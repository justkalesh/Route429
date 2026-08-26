// ---------------------------------------------------------------------------
// Route429 — Main Entry Point & Router
// ---------------------------------------------------------------------------

import { type Env, projectKey, jsonResponse } from "./types";
import { handleAuth } from "./auth";
import { handleProjects } from "./projects";
import { handleProxy } from "./proxy";

// Import HTML files as strings (enabled by wrangler.toml rules)
import landingHtml from "./ui/landing.html";
import dashboardHtml from "./ui/dashboard.html";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // ── Static UI Routes ───────────────────────────────────────────────────

    if (path === "/" || path === "") {
      return new Response(landingHtml, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (path === "/dashboard") {
      return new Response(dashboardHtml, {
        status: 200,
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    // ── API Routes ─────────────────────────────────────────────────────────

    if (path.startsWith("/api/auth/")) {
      const subpath = path.substring("/api/auth/".length);
      return handleAuth(request, env, subpath);
    }

    if (path.startsWith("/api/projects")) {
      let subpath = path.substring("/api/projects".length);
      if (subpath.startsWith("/")) subpath = subpath.substring(1);
      return handleProjects(request, env, subpath);
    }

    // ── Proxy Routes ───────────────────────────────────────────────────────

    // Format: /p/<project-name>/<upstream-path...>
    if (path.startsWith("/p/")) {
      const parts = path.split("/");
      // parts[0] = "", parts[1] = "p", parts[2] = "<project-name>"
      if (parts.length >= 3) {
        const projectName = parts[2].toLowerCase();
        
        // Reconstruct the proxy path (everything after /p/<project-name>)
        const proxyPath = "/" + parts.slice(3).join("/");

        // Load project config from KV
        const projectConfig = await env.ROUTE429_KV.get(projectKey(projectName), "json");

        if (!projectConfig) {
          return jsonResponse(
            { error: "project_not_found", message: `Project '${projectName}' not found.` },
            404
          );
        }

        // Forward to the proxy engine
        return handleProxy(request, projectConfig as any, proxyPath);
      }
    }

    // ── Fallback (404) ─────────────────────────────────────────────────────

    return jsonResponse(
      { error: "not_found", message: `Route not found: ${path}` },
      404
    );
  },
} satisfies ExportedHandler<Env>;
