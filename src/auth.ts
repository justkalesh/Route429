// ---------------------------------------------------------------------------
// Route429 — Authentication Module
// ---------------------------------------------------------------------------
// Handles user sign-up, login, logout, and session validation.
// Uses PBKDF2 via Web Crypto API — zero npm dependencies.
// ---------------------------------------------------------------------------

import {
  type Env,
  type User,
  type Session,
  userKey,
  sessionKey,
  jsonResponse,
} from "./types";

// ── Constants ──────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ── Crypto Helpers ─────────────────────────────────────────────────────────

/** Generate a cryptographically random hex string. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Hash a password with PBKDF2-SHA256. */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Session Helpers ────────────────────────────────────────────────────────

/** Extract session token from Authorization header (Bearer <token>). */
function extractToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth) return null;
  const parts = auth.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1];
}

/** Validate a session token and return the associated user email. */
async function validateSession(
  token: string,
  kv: KVNamespace
): Promise<string | null> {
  const session = await kv.get<Session>(sessionKey(token), "json");
  if (!session) return null;
  return session.email;
}

/**
 * Authenticate a request and return the user email.
 * Returns null if not authenticated.
 */
export async function authenticateRequest(
  request: Request,
  kv: KVNamespace
): Promise<string | null> {
  const token = extractToken(request);
  if (!token) return null;
  return validateSession(token, kv);
}

// ── Auth Handlers ──────────────────────────────────────────────────────────

/** POST /api/auth/signup — Create a new user account. */
async function handleSignup(request: Request, env: Env): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_body", message: "Invalid JSON body." }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return jsonResponse(
      { error: "missing_fields", message: "Email and password are required." },
      400
    );
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse(
      { error: "invalid_email", message: "Please provide a valid email address." },
      400
    );
  }

  // Password strength
  if (password.length < 6) {
    return jsonResponse(
      { error: "weak_password", message: "Password must be at least 6 characters." },
      400
    );
  }

  // Check if user already exists
  const existing = await env.ROUTE429_KV.get(userKey(email));
  if (existing) {
    return jsonResponse(
      { error: "user_exists", message: "An account with this email already exists." },
      409
    );
  }

  // Hash password
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);

  // Create user record
  const user: User = {
    email,
    passwordHash,
    salt,
    createdAt: new Date().toISOString(),
    projects: [],
  };

  await env.ROUTE429_KV.put(userKey(email), JSON.stringify(user));

  // Create session
  const token = randomHex(32);
  const session: Session = {
    email,
    createdAt: new Date().toISOString(),
  };
  await env.ROUTE429_KV.put(sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return jsonResponse(
    { message: "Account created successfully.", token, email },
    201
  );
}

/** POST /api/auth/login — Log in and get a session token. */
async function handleLogin(request: Request, env: Env): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_body", message: "Invalid JSON body." }, 400);
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return jsonResponse(
      { error: "missing_fields", message: "Email and password are required." },
      400
    );
  }

  // Look up user
  const userData = await env.ROUTE429_KV.get<User>(userKey(email), "json");
  if (!userData) {
    return jsonResponse(
      { error: "invalid_credentials", message: "Invalid email or password." },
      401
    );
  }

  // Verify password
  const hash = await hashPassword(password, userData.salt);
  if (hash !== userData.passwordHash) {
    return jsonResponse(
      { error: "invalid_credentials", message: "Invalid email or password." },
      401
    );
  }

  // Create session
  const token = randomHex(32);
  const session: Session = {
    email,
    createdAt: new Date().toISOString(),
  };
  await env.ROUTE429_KV.put(sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return jsonResponse({ message: "Login successful.", token, email }, 200);
}

/** POST /api/auth/logout — Destroy the current session. */
async function handleLogout(request: Request, env: Env): Promise<Response> {
  const token = extractToken(request);
  if (token) {
    await env.ROUTE429_KV.delete(sessionKey(token));
  }
  return jsonResponse({ message: "Logged out." }, 200);
}

/** GET /api/auth/me — Get the current authenticated user. */
async function handleMe(request: Request, env: Env): Promise<Response> {
  const email = await authenticateRequest(request, env.ROUTE429_KV);
  if (!email) {
    return jsonResponse(
      { error: "unauthorized", message: "Not authenticated." },
      401
    );
  }

  const user = await env.ROUTE429_KV.get<User>(userKey(email), "json");
  if (!user) {
    return jsonResponse(
      { error: "not_found", message: "User not found." },
      404
    );
  }

  return jsonResponse(
    { email: user.email, projects: user.projects, createdAt: user.createdAt },
    200
  );
}

// ── Route Dispatcher ──────────────────────────────────────────────────────

/** Dispatch /api/auth/* requests to the appropriate handler. */
export async function handleAuth(
  request: Request,
  env: Env,
  subpath: string
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  switch (subpath) {
    case "signup":
      if (request.method !== "POST")
        return jsonResponse({ error: "method_not_allowed", message: "Use POST." }, 405);
      return handleSignup(request, env);

    case "login":
      if (request.method !== "POST")
        return jsonResponse({ error: "method_not_allowed", message: "Use POST." }, 405);
      return handleLogin(request, env);

    case "logout":
      if (request.method !== "POST")
        return jsonResponse({ error: "method_not_allowed", message: "Use POST." }, 405);
      return handleLogout(request, env);

    case "me":
      if (request.method !== "GET")
        return jsonResponse({ error: "method_not_allowed", message: "Use GET." }, 405);
      return handleMe(request, env);

    default:
      return jsonResponse(
        { error: "not_found", message: `Auth endpoint '${subpath}' not found.` },
        404
      );
  }
}
