// ---------------------------------------------------------------------------
// Route429 — API Key Rotation Proxy Gateway (Cloudflare Worker)
// ---------------------------------------------------------------------------
// Intercepts requests, attaches an API key from a rotating pool, forwards to
// the upstream target, and automatically swaps keys on HTTP 429 responses.
// ---------------------------------------------------------------------------

// ── Types ──────────────────────────────────────────────────────────────────

/** Environment bindings injected by Cloudflare / wrangler.toml */
interface Env {
  /** JSON-encoded string array of API keys, e.g. '["sk-a","sk-b"]' */
  API_KEYS: string;
  /** Upstream API base URL, e.g. "https://api.openai.com" */
  TARGET_BASE_URL: string;
  /** Header name used to attach the API key (default: "Authorization") */
  API_KEY_HEADER?: string;
  /** Prefix prepended to the key value (default: "Bearer ") */
  API_KEY_PREFIX?: string;
  /** Comma-separated allowed CORS origins (default: "*") */
  ALLOWED_ORIGINS?: string;
}

/** Structured JSON error body returned on failure */
interface ErrorBody {
  error: string;
  message: string;
  retryAfter?: string | null;
}

// ── Isolate-level round-robin counter ──────────────────────────────────────
// Each Worker isolate maintains its own counter so successive requests start
// from different keys, distributing load across the pool.
let roundRobinIndex = 0;

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_KEY_HEADER = "Authorization";
const DEFAULT_KEY_PREFIX = "Bearer ";
const DEFAULT_ALLOWED_ORIGINS = "*";

/** Hop-by-hop headers that must NOT be forwarded through a proxy. */
const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse the API key pool from the environment.
 * Expects a JSON-encoded string array.
 * @throws {Error} if the value is missing, not valid JSON, or not a string[].
 */
function parseKeyPool(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) {
    throw new Error("API_KEYS environment variable is not set or is empty.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("API_KEYS is not valid JSON. Expected a JSON string array.");
  }

  if (
    !Array.isArray(parsed) ||
    parsed.length === 0 ||
    !parsed.every((k) => typeof k === "string" && k.length > 0)
  ) {
    throw new Error(
      "API_KEYS must be a non-empty JSON array of non-empty strings."
    );
  }

  return parsed as string[];
}

/**
 * Build CORS headers based on the request origin and the allowed-origins list.
 */
function buildCorsHeaders(
  requestOrigin: string | null,
  allowedOrigins: string
): Record<string, string> {
  const origins = allowedOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const isWildcard = origins.includes("*");

  // Determine the value of Access-Control-Allow-Origin
  let allowOrigin = "*";
  if (!isWildcard && requestOrigin) {
    allowOrigin = origins.includes(requestOrigin) ? requestOrigin : "";
  }

  // If the origin is not allowed, return empty headers (browser will block)
  if (allowOrigin === "") {
    return {};
  }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Accept, Origin",
    "Access-Control-Max-Age": "86400", // 24 hours
  };

  // When not using wildcard, include Vary so caches differentiate by origin
  if (!isWildcard) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

/**
 * Clone headers from a source, stripping hop-by-hop headers.
 */
function sanitizeHeaders(source: Headers): Headers {
  const cleaned = new Headers();
  for (const [key, value] of source.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      cleaned.set(key, value);
    }
  }
  return cleaned;
}

/**
 * Create a JSON Response with CORS headers.
 */
function jsonResponse(
  body: ErrorBody,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

/**
 * Mask an API key for safe logging (shows first 5 and last 3 chars).
 */
function maskKey(key: string): string {
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 5)}...${key.slice(-3)}`;
}

// ── Main Handler ───────────────────────────────────────────────────────────

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigins = env.ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS;
    const corsHeaders = buildCorsHeaders(requestOrigin, allowedOrigins);

    // ── Handle CORS preflight ────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // ── Parse configuration ──────────────────────────────────────────────
    let keys: string[];
    try {
      keys = parseKeyPool(env.API_KEYS);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to parse API_KEYS.";
      console.error(`[Route429] Config error: ${message}`);
      return jsonResponse(
        { error: "configuration_error", message },
        500,
        corsHeaders
      );
    }

    const targetBase = env.TARGET_BASE_URL;
    if (!targetBase) {
      console.error("[Route429] TARGET_BASE_URL is not set.");
      return jsonResponse(
        {
          error: "configuration_error",
          message: "TARGET_BASE_URL environment variable is not set.",
        },
        500,
        corsHeaders
      );
    }

    const keyHeader = env.API_KEY_HEADER ?? DEFAULT_KEY_HEADER;
    const keyPrefix = env.API_KEY_PREFIX ?? DEFAULT_KEY_PREFIX;
    const maxRetries = keys.length;

    // ── Build upstream URL ───────────────────────────────────────────────
    const incomingUrl = new URL(request.url);
    const upstreamUrl = new URL(
      incomingUrl.pathname + incomingUrl.search,
      targetBase
    );

    // ── Prepare forwarded headers ────────────────────────────────────────
    const forwardHeaders = sanitizeHeaders(request.headers);

    // ── Retry loop with key rotation ─────────────────────────────────────
    let lastResponse: Response | null = null;
    let lastRetryAfter: string | null = null;
    const startIndex = roundRobinIndex % keys.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const keyIndex = (startIndex + attempt) % keys.length;
      const currentKey = keys[keyIndex];

      // Attach the API key
      forwardHeaders.set(keyHeader, `${keyPrefix}${currentKey}`);

      console.log(
        `[Route429] Attempt ${attempt + 1}/${maxRetries} — key index ${keyIndex} (${maskKey(currentKey)})`
      );

      try {
        lastResponse = await fetch(upstreamUrl.toString(), {
          method: request.method,
          headers: forwardHeaders,
          body:
            request.method !== "GET" && request.method !== "HEAD"
              ? request.body
              : undefined,
          redirect: "manual",
        });
      } catch (fetchError) {
        // Network-level failure (DNS, timeout, etc.)
        const message =
          fetchError instanceof Error
            ? fetchError.message
            : "Unknown fetch error";
        console.error(
          `[Route429] Fetch failed on attempt ${attempt + 1}: ${message}`
        );
        return jsonResponse(
          { error: "upstream_error", message: `Upstream fetch failed: ${message}` },
          502,
          corsHeaders
        );
      }

      // ── Check for rate limit ─────────────────────────────────────────
      if (lastResponse.status === 429) {
        lastRetryAfter = lastResponse.headers.get("Retry-After");
        console.warn(
          `[Route429] 429 received on key index ${keyIndex} (${maskKey(currentKey)}).` +
            (lastRetryAfter ? ` Retry-After: ${lastRetryAfter}` : "") +
            (attempt + 1 < maxRetries
              ? " Rotating to next key..."
              : " All keys exhausted.")
        );

        // Consume the body so the connection can be reused
        await lastResponse.text();
        continue;
      }

      // ── Success (or any non-429 status) — forward to client ──────────
      // Advance round-robin so the next request starts from the next key
      roundRobinIndex = (keyIndex + 1) % keys.length;

      const responseHeaders = new Headers(lastResponse.headers);
      // Inject CORS headers into the proxied response
      for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
      }

      return new Response(lastResponse.body, {
        status: lastResponse.status,
        statusText: lastResponse.statusText,
        headers: responseHeaders,
      });
    }

    // ── All keys exhausted ─────────────────────────────────────────────
    // Advance round-robin past all exhausted keys
    roundRobinIndex = (startIndex + maxRetries) % keys.length;

    console.error(
      `[Route429] All ${maxRetries} keys exhausted. Returning 503.`
    );

    const extraHeaders: Record<string, string> = {};
    if (lastRetryAfter) {
      extraHeaders["Retry-After"] = lastRetryAfter;
    }

    return jsonResponse(
      {
        error: "all_keys_exhausted",
        message:
          "All API keys in the pool have been rate-limited. Please try again later.",
        retryAfter: lastRetryAfter,
      },
      503,
      corsHeaders,
      extraHeaders
    );
  },
} satisfies ExportedHandler<Env>;
