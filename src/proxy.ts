// ---------------------------------------------------------------------------
// Route429 — Proxy Engine
// ---------------------------------------------------------------------------
// Extracted from the original single-tenant index.ts. Now accepts a
// ProjectConfig object (loaded from KV) instead of reading env vars directly.
// ---------------------------------------------------------------------------

import { type ProjectConfig, type ErrorBody } from "./types";

// ── Per-project round-robin counters ──────────────────────────────────────
// Each project maintains its own counter within the isolate so successive
// requests to the same project start from different keys.
const roundRobinCounters = new Map<string, number>();

// ── Constants ──────────────────────────────────────────────────────────────

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

/** Clone headers from a source, stripping hop-by-hop headers. */
function sanitizeHeaders(source: Headers): Headers {
  const cleaned = new Headers();
  for (const [key, value] of source.entries()) {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      cleaned.set(key, value);
    }
  }
  return cleaned;
}

/** Mask an API key for safe logging (shows first 5 and last 3 chars). */
function maskKey(key: string): string {
  if (key.length <= 10) return `${key.slice(0, 3)}***`;
  return `${key.slice(0, 5)}...${key.slice(-3)}`;
}

/** Build CORS headers based on request origin and allowed-origins list. */
function buildCorsHeaders(
  requestOrigin: string | null,
  allowedOrigins: string
): Record<string, string> {
  const origins = allowedOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const isWildcard = origins.includes("*");

  let allowOrigin = "*";
  if (!isWildcard && requestOrigin) {
    allowOrigin = origins.includes(requestOrigin) ? requestOrigin : "";
  }

  if (allowOrigin === "") return {};

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With, Accept, Origin, X-Proxy-Secret",
    "Access-Control-Max-Age": "86400",
  };

  if (!isWildcard) {
    headers["Vary"] = "Origin";
  }

  return headers;
}

/** Create a JSON error response. */
function errorResponse(
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

// ── Main Proxy Handler ────────────────────────────────────────────────────

/**
 * Proxy a request through the given project config with key rotation.
 *
 * @param request  - The incoming client request.
 * @param config   - The project configuration loaded from KV.
 * @param proxyPath - The path portion after `/p/<project>/` to forward upstream.
 */
export async function handleProxy(
  request: Request,
  config: ProjectConfig,
  proxyPath: string
): Promise<Response> {
  const requestOrigin = request.headers.get("Origin");
  const corsHeaders = buildCorsHeaders(requestOrigin, config.allowedOrigins);

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Validate proxy secret if configured
  if (config.proxySecret) {
    const clientSecret = request.headers.get("X-Proxy-Secret");
    if (!clientSecret || clientSecret !== config.proxySecret) {
      console.warn(
        `[Route429:${config.name}] Proxy secret mismatch — rejecting request.`
      );
      return errorResponse(
        {
          error: "unauthorized",
          message: "Invalid or missing X-Proxy-Secret header.",
        },
        401,
        corsHeaders
      );
    }
  }

  const keys = config.apiKeys;
  const maxRetries = keys.length;

  // Build upstream URL
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(
    proxyPath + incomingUrl.search,
    config.targetBaseUrl
  );

  // Prepare forwarded headers (strip proxy secret so it doesn't leak upstream)
  const forwardHeaders = sanitizeHeaders(request.headers);
  forwardHeaders.delete("X-Proxy-Secret");

  // Get or init round-robin counter for this project
  let rrIndex = roundRobinCounters.get(config.name) ?? 0;
  const startIndex = rrIndex % keys.length;

  // Retry loop with key rotation
  let lastResponse: Response | null = null;
  let lastRetryAfter: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyIndex = (startIndex + attempt) % keys.length;
    const currentKey = keys[keyIndex];

    // Attach the API key
    forwardHeaders.set(
      config.apiKeyHeader,
      `${config.apiKeyPrefix}${currentKey}`
    );

    console.log(
      `[Route429:${config.name}] Attempt ${attempt + 1}/${maxRetries} — key index ${keyIndex} (${maskKey(currentKey)})`
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
      const message =
        fetchError instanceof Error
          ? fetchError.message
          : "Unknown fetch error";
      console.error(
        `[Route429:${config.name}] Fetch failed on attempt ${attempt + 1}: ${message}`
      );
      return errorResponse(
        { error: "upstream_error", message: `Upstream fetch failed: ${message}` },
        502,
        corsHeaders
      );
    }

    // Check for rate limit
    if (lastResponse.status === 429) {
      lastRetryAfter = lastResponse.headers.get("Retry-After");
      console.warn(
        `[Route429:${config.name}] 429 received on key index ${keyIndex} (${maskKey(currentKey)}).` +
          (lastRetryAfter ? ` Retry-After: ${lastRetryAfter}` : "") +
          (attempt + 1 < maxRetries
            ? " Rotating to next key..."
            : " All keys exhausted.")
      );
      // Consume the body so the connection can be reused
      await lastResponse.text();
      continue;
    }

    // Success (or any non-429 status) — forward to client
    roundRobinCounters.set(config.name, (keyIndex + 1) % keys.length);

    const responseHeaders = new Headers(lastResponse.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      responseHeaders.set(key, value);
    }

    return new Response(lastResponse.body, {
      status: lastResponse.status,
      statusText: lastResponse.statusText,
      headers: responseHeaders,
    });
  }

  // All keys exhausted
  roundRobinCounters.set(config.name, (startIndex + maxRetries) % keys.length);

  console.error(
    `[Route429:${config.name}] All ${maxRetries} keys exhausted. Returning 503.`
  );

  const extraHeaders: Record<string, string> = {};
  if (lastRetryAfter) {
    extraHeaders["Retry-After"] = lastRetryAfter;
  }

  return errorResponse(
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
}
