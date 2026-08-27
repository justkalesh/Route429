# Context: Route429

## Goal
To provide a seamless, zero-dependency API key rotation proxy deployed on Cloudflare Workers, complete with a beautiful SaaS dashboard for managing multiple projects and API key pools.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Route429 Worker                          │
│                                                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  Dashboard   │   │   Auth API   │   │   Proxy Engine   │  │
│  │  (Static UI) │   │  /api/auth/* │   │ /p/<project>/*   │  │
│  │  /dashboard  │   │  /api/proj/* │   │                  │  │
│  └─────────────┘   └──────┬───────┘   └────────┬─────────┘  │
│                           │                     │            │
│                    ┌──────▼─────────────────────▼──────┐     │
│                    │        Cloudflare KV              │     │
│                    │  users:<email> → user record       │     │
│                    │  sessions:<token> → user email     │     │
│                    │  projects:<name> → project config  │     │
│                    └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### Request Flow
1. **Management**: Clients manage users and projects through the dashboard UI. The UI calls `/api/*` endpoints which read/write to Cloudflare KV.
2. **Proxying**: The client application sends a request to the proxy path `/p/<project-name>/<upstream-path>`.
3. The Worker reads the `<project-name>` configuration from KV.
4. The proxy engine picks the next key via round-robin, attaches it to the configured header, and forwards the request to the project's target API.
5. If the upstream returns **429 Rate Limited**, the engine automatically rotates to the next key and retries.
6. If all keys are exhausted, it returns a **503 Service Unavailable** to the client.
7. Otherwise, it forwards the successful upstream response with proper CORS headers.

## Tech Stack
- **Compute**: Cloudflare Workers
- **Language**: TypeScript
- **Storage**: Cloudflare KV
- **Frontend**: HTML / Vanilla CSS / Vanilla JS (No external framework dependencies)
- **Security**: Web Crypto API (PBKDF2)

## Current Phase
**Deployed and Live**. The multi-tenant architecture is complete and the application is running in production. Features include automatic key rotation, multi-project dashboard, provider presets, CORS configuration, and optional per-project Proxy Secret for endpoint protection. The landing page and dashboard follow a 'Serene Operational Excellence' light design aesthetic.
