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
