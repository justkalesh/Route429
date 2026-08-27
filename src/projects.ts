// ---------------------------------------------------------------------------
// Route429 — Project Management Module
// ---------------------------------------------------------------------------
// CRUD handlers for managing proxy projects (create, list, get, update, delete).
// ---------------------------------------------------------------------------

import {
  type Env,
  type User,
  type ProjectConfig,
  type Provider,
  PROVIDER_PRESETS,
  userKey,
  projectKey,
  jsonResponse,
} from "./types";
import { authenticateRequest } from "./auth";

// ── Validation ─────────────────────────────────────────────────────────────

/** Project name must be 3-40 chars, alphanumeric + hyphens, no leading/trailing hyphens. */
const PROJECT_NAME_REGEX = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

function validateProjectName(name: string): string | null {
  if (!name) return "Project name is required.";
  const normalized = name.toLowerCase();
  if (!PROJECT_NAME_REGEX.test(normalized)) {
    return "Project name must be 3-40 characters, lowercase alphanumeric and hyphens only. Cannot start or end with a hyphen.";
  }
  return null;
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────

/** POST /api/projects — Create a new project. */
async function handleCreateProject(
  request: Request,
  env: Env,
  email: string
): Promise<Response> {
  let body: {
    name?: string;
    provider?: Provider;
    targetBaseUrl?: string;
    apiKeyHeader?: string;
    apiKeyPrefix?: string;
    apiKeys?: string[];
    allowedOrigins?: string;
    proxySecret?: string;
  };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_body", message: "Invalid JSON body." }, 400);
  }

  // Validate name
  const name = body.name?.trim().toLowerCase();
  if (!name) {
    return jsonResponse(
      { error: "missing_field", message: "Project name is required." },
      400
    );
  }
  const nameError = validateProjectName(name);
  if (nameError) {
    return jsonResponse({ error: "invalid_name", message: nameError }, 400);
  }

  // Check uniqueness
  const existing = await env.ROUTE429_KV.get(projectKey(name));
  if (existing) {
    return jsonResponse(
      { error: "name_taken", message: `Project name '${name}' is already taken.` },
      409
    );
  }

  // Validate provider
  const provider = body.provider ?? "custom";
  if (!["gemini", "openai", "anthropic", "custom"].includes(provider)) {
    return jsonResponse(
      { error: "invalid_provider", message: "Provider must be gemini, openai, anthropic, or custom." },
      400
    );
  }

  // Resolve config from provider preset or custom values
  let targetBaseUrl: string;
  let apiKeyHeader: string;
  let apiKeyPrefix: string;

  if (provider !== "custom") {
    const preset = PROVIDER_PRESETS[provider];
    targetBaseUrl = body.targetBaseUrl ?? preset.targetBaseUrl;
    apiKeyHeader = body.apiKeyHeader ?? preset.apiKeyHeader;
    apiKeyPrefix = body.apiKeyPrefix ?? preset.apiKeyPrefix;
  } else {
    targetBaseUrl = body.targetBaseUrl ?? "";
    apiKeyHeader = body.apiKeyHeader ?? "Authorization";
    apiKeyPrefix = body.apiKeyPrefix ?? "Bearer ";
  }

  if (!targetBaseUrl || !validateUrl(targetBaseUrl)) {
    return jsonResponse(
      { error: "invalid_url", message: "A valid TARGET_BASE_URL is required." },
      400
    );
  }

  // Validate API keys
  const apiKeys = body.apiKeys ?? [];
  if (!Array.isArray(apiKeys) || apiKeys.length === 0) {
    return jsonResponse(
      { error: "missing_keys", message: "At least one API key is required." },
      400
    );
  }
  if (!apiKeys.every((k) => typeof k === "string" && k.trim().length > 0)) {
    return jsonResponse(
      { error: "invalid_keys", message: "All API keys must be non-empty strings." },
      400
    );
  }

  const allowedOrigins = body.allowedOrigins ?? "*";

  // Create project config
  const now = new Date().toISOString();
  const project: ProjectConfig = {
    name,
    owner: email,
    provider,
    targetBaseUrl,
    apiKeyHeader,
    apiKeyPrefix,
    apiKeys: apiKeys.map((k) => k.trim()),
    allowedOrigins,
    proxySecret: body.proxySecret?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };

  // Save project
  await env.ROUTE429_KV.put(projectKey(name), JSON.stringify(project));

  // Add project to user's project list
  const user = await env.ROUTE429_KV.get<User>(userKey(email), "json");
  if (user) {
    user.projects.push(name);
    await env.ROUTE429_KV.put(userKey(email), JSON.stringify(user));
  }

  // Return project (with masked keys)
  return jsonResponse(
    {
      message: "Project created successfully.",
      project: maskProjectKeys(project),
    },
    201
  );
}

/** GET /api/projects — List the authenticated user's projects. */
async function handleListProjects(
  env: Env,
  email: string
): Promise<Response> {
  const user = await env.ROUTE429_KV.get<User>(userKey(email), "json");
  if (!user) {
    return jsonResponse({ error: "not_found", message: "User not found." }, 404);
  }

  const projects: Array<Record<string, unknown>> = [];
  for (const name of user.projects) {
    const project = await env.ROUTE429_KV.get<ProjectConfig>(
      projectKey(name),
      "json"
    );
    if (project) {
      projects.push(maskProjectKeys(project));
    }
  }

  return jsonResponse({ projects }, 200);
}

/** GET /api/projects/:name — Get a single project's config. */
async function handleGetProject(
  env: Env,
  email: string,
  name: string
): Promise<Response> {
  const project = await env.ROUTE429_KV.get<ProjectConfig>(
    projectKey(name),
    "json"
  );
  if (!project) {
    return jsonResponse({ error: "not_found", message: "Project not found." }, 404);
  }
  if (project.owner !== email) {
    return jsonResponse({ error: "forbidden", message: "Not your project." }, 403);
  }

  return jsonResponse({ project: maskProjectKeys(project) }, 200);
}

/** PUT /api/projects/:name — Update a project's config. */
async function handleUpdateProject(
  request: Request,
  env: Env,
  email: string,
  name: string
): Promise<Response> {
  const project = await env.ROUTE429_KV.get<ProjectConfig>(
    projectKey(name),
    "json"
  );
  if (!project) {
    return jsonResponse({ error: "not_found", message: "Project not found." }, 404);
  }
  if (project.owner !== email) {
    return jsonResponse({ error: "forbidden", message: "Not your project." }, 403);
  }

  let body: Partial<{
    targetBaseUrl: string;
    apiKeyHeader: string;
    apiKeyPrefix: string;
    apiKeys: string[];
    allowedOrigins: string;
    proxySecret: string;
    appendKey: string;
    removeKeyIndex: number;
  }>;

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_body", message: "Invalid JSON body." }, 400);
  }

  // Apply updates
  if (body.targetBaseUrl !== undefined) {
    if (!validateUrl(body.targetBaseUrl)) {
      return jsonResponse(
        { error: "invalid_url", message: "Invalid target base URL." },
        400
      );
    }
    project.targetBaseUrl = body.targetBaseUrl;
  }
  if (body.apiKeyHeader !== undefined) {
    project.apiKeyHeader = body.apiKeyHeader;
  }
  if (body.apiKeyPrefix !== undefined) {
    project.apiKeyPrefix = body.apiKeyPrefix;
  }
  if (body.apiKeys !== undefined) {
    if (
      !Array.isArray(body.apiKeys) ||
      body.apiKeys.length === 0 ||
      !body.apiKeys.every((k) => typeof k === "string" && k.trim().length > 0)
    ) {
      return jsonResponse(
        { error: "invalid_keys", message: "API keys must be a non-empty array of non-empty strings." },
        400
      );
    }
    project.apiKeys = body.apiKeys.map((k) => k.trim());
  }
  // Append a single key to the pool
  if (body.appendKey !== undefined) {
    const newKey = body.appendKey.trim();
    if (!newKey) {
      return jsonResponse(
        { error: "invalid_key", message: "API key must be a non-empty string." },
        400
      );
    }
    project.apiKeys.push(newKey);
  }
  // Remove a key by index
  if (body.removeKeyIndex !== undefined) {
    const idx = body.removeKeyIndex;
    if (typeof idx !== "number" || idx < 0 || idx >= project.apiKeys.length) {
      return jsonResponse(
        { error: "invalid_index", message: "Invalid key index." },
        400
      );
    }
    if (project.apiKeys.length <= 1) {
      return jsonResponse(
        { error: "min_keys", message: "Cannot remove the last API key. At least one key is required." },
        400
      );
    }
    project.apiKeys.splice(idx, 1);
  }
  if (body.allowedOrigins !== undefined) {
    project.allowedOrigins = body.allowedOrigins;
  }
  if (body.proxySecret !== undefined) {
    // Empty string removes the secret; non-empty sets it
    project.proxySecret = body.proxySecret.trim() || undefined;
  }

  project.updatedAt = new Date().toISOString();
  await env.ROUTE429_KV.put(projectKey(name), JSON.stringify(project));

  return jsonResponse(
    { message: "Project updated.", project: maskProjectKeys(project) },
    200
  );
}

/** DELETE /api/projects/:name — Delete a project. */
async function handleDeleteProject(
  env: Env,
  email: string,
  name: string
): Promise<Response> {
  const project = await env.ROUTE429_KV.get<ProjectConfig>(
    projectKey(name),
    "json"
  );
  if (!project) {
    return jsonResponse({ error: "not_found", message: "Project not found." }, 404);
  }
  if (project.owner !== email) {
    return jsonResponse({ error: "forbidden", message: "Not your project." }, 403);
  }

  // Delete project
  await env.ROUTE429_KV.delete(projectKey(name));

  // Remove from user's project list
  const user = await env.ROUTE429_KV.get<User>(userKey(email), "json");
  if (user) {
    user.projects = user.projects.filter((p) => p !== name);
    await env.ROUTE429_KV.put(userKey(email), JSON.stringify(user));
  }

  return jsonResponse({ message: `Project '${name}' deleted.` }, 200);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Mask API keys in project config for client-side display. */
function maskProjectKeys(project: ProjectConfig): Record<string, unknown> {
  const maskedSecret = project.proxySecret
    ? project.proxySecret.length <= 8
      ? `${project.proxySecret.slice(0, 2)}***`
      : `${project.proxySecret.slice(0, 4)}...${project.proxySecret.slice(-3)}`
    : null;

  return {
    ...project,
    apiKeys: project.apiKeys.map((k) => {
      if (k.length <= 10) return `${k.slice(0, 3)}***`;
      return `${k.slice(0, 6)}...${k.slice(-4)}`;
    }),
    keyCount: project.apiKeys.length,
    proxySecret: maskedSecret,
    hasProxySecret: !!project.proxySecret,
  };
}

// ── Route Dispatcher ──────────────────────────────────────────────────────

/** Dispatch /api/projects* requests. */
export async function handleProjects(
  request: Request,
  env: Env,
  subpath: string
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  // Authenticate
  const email = await authenticateRequest(request, env.ROUTE429_KV);
  if (!email) {
    return jsonResponse(
      { error: "unauthorized", message: "Authentication required." },
      401
    );
  }

  // Route: /api/projects (no subpath)
  if (!subpath || subpath === "") {
    if (request.method === "GET") return handleListProjects(env, email);
    if (request.method === "POST") return handleCreateProject(request, env, email);
    return jsonResponse(
      { error: "method_not_allowed", message: "Use GET or POST." },
      405
    );
  }

  // Route: /api/projects/:name
  const projectName = subpath.split("/")[0];

  if (request.method === "GET") return handleGetProject(env, email, projectName);
  if (request.method === "PUT") return handleUpdateProject(request, env, email, projectName);
  if (request.method === "DELETE") return handleDeleteProject(env, email, projectName);

  return jsonResponse(
    { error: "method_not_allowed", message: "Use GET, PUT, or DELETE." },
    405
  );
}
