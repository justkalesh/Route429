// ---------------------------------------------------------------------------
// Route429 — Shared Type Definitions
// ---------------------------------------------------------------------------

/** Environment bindings injected by Cloudflare / wrangler.toml */
export interface Env {
  /** Cloudflare KV namespace for storing users, sessions, and projects */
  ROUTE429_KV: KVNamespace;

  // ── Legacy env vars (fallback for backward compat) ────────────────────
  /** JSON-encoded string array of API keys */
  API_KEYS?: string;
  /** Upstream API base URL */
  TARGET_BASE_URL?: string;
  /** Header name for key attachment */
  API_KEY_HEADER?: string;
  /** Prefix prepended to key value */
  API_KEY_PREFIX?: string;
  /** Comma-separated CORS origins */
  ALLOWED_ORIGINS?: string;
}

// ── Provider Presets ───────────────────────────────────────────────────────

export type Provider = "gemini" | "openai" | "anthropic" | "custom";

export interface ProviderPreset {
  targetBaseUrl: string;
  apiKeyHeader: string;
  apiKeyPrefix: string;
}

export const PROVIDER_PRESETS: Record<Exclude<Provider, "custom">, ProviderPreset> = {
  gemini: {
    targetBaseUrl: "https://generativelanguage.googleapis.com",
    apiKeyHeader: "x-goog-api-key",
    apiKeyPrefix: "",
  },
  openai: {
    targetBaseUrl: "https://api.openai.com",
    apiKeyHeader: "Authorization",
    apiKeyPrefix: "Bearer ",
  },
  anthropic: {
    targetBaseUrl: "https://api.anthropic.com",
    apiKeyHeader: "x-api-key",
    apiKeyPrefix: "",
  },
};

// ── Data Models (KV Records) ──────────────────────────────────────────────

/** User account stored at KV key: `users:<email>` */
export interface User {
  email: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  projects: string[];
}

/** Session stored at KV key: `sessions:<token>` */
export interface Session {
  email: string;
  createdAt: string;
}

/** Project config stored at KV key: `projects:<name>` */
export interface ProjectConfig {
  name: string;
  owner: string;
  provider: Provider;
  targetBaseUrl: string;
  apiKeyHeader: string;
  apiKeyPrefix: string;
  apiKeys: string[];
  allowedOrigins: string;
  /** Optional secret that clients must send via X-Proxy-Secret header */
  proxySecret?: string;
  createdAt: string;
  updatedAt: string;
}

/** Structured JSON error body */
export interface ErrorBody {
  error: string;
  message: string;
  retryAfter?: string | null;
}

// ── KV Key Helpers ────────────────────────────────────────────────────────

export function userKey(email: string): string {
  return `users:${email.toLowerCase()}`;
}

export function sessionKey(token: string): string {
  return `sessions:${token}`;
}

export function projectKey(name: string): string {
  return `projects:${name.toLowerCase()}`;
}

// ── Logging Models ────────────────────────────────────────────────────────

/** A single proxy request log entry stored in KV at `logs:<project>` */
export interface LogEntry {
  /** ISO timestamp of the request */
  timestamp: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Upstream path that was hit */
  path: string;
  /** Final HTTP status returned to the client */
  status: number;
  /** Number of API keys attempted before success or exhaustion */
  keysAttempted: number;
  /** Whether a key rotation occurred (i.e. at least one 429 was hit) */
  rotated: boolean;
  /** Whether all keys in the pool were exhausted */
  exhausted: boolean;
  /** Total request duration in milliseconds */
  durationMs: number;
}

/** Aggregate stats for a project, stored in KV at `stats:<project>` */
export interface ProjectStats {
  totalRequests: number;
  /** How many times a 429 triggered rotation to another key */
  totalRotations: number;
  /** How many times ALL keys were exhausted (503 returned) */
  totalExhausted: number;
  /** ISO timestamp of the last request, or null if none */
  lastRequestAt: string | null;
}

export function logKey(projectName: string): string {
  return `logs:${projectName.toLowerCase()}`;
}

export function statsKey(projectName: string): string {
  return `stats:${projectName.toLowerCase()}`;
}

/** Maximum number of log entries retained per project */
export const MAX_LOG_ENTRIES = 100;

// ── Response Helpers ──────────────────────────────────────────────────────

export function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Requested-With, Accept, Origin",
      ...extraHeaders,
    },
  });
}
