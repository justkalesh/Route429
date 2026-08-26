# Route429 — Context

## Project Purpose
Route429 is a **Cloudflare Worker** that acts as a transparent API key rotation proxy. It sits between your frontend applications and a target API (e.g., OpenAI, Gemini, Anthropic). When the upstream API returns a **429 Too Many Requests**, the proxy automatically swaps the exhausted key for a fresh one from a pre-configured pool and retries — all invisible to the client.

## Architecture

```
┌──────────┐        ┌──────────────┐        ┌──────────────┐
│  Client   │──req──▶│   Route429   │──req──▶│  Target API  │
│  (Browser)│◀──res──│  (CF Worker) │◀──res──│  (upstream)  │
└──────────┘        └──────────────┘        └──────────────┘
                          │
                    ┌─────┴─────┐
                    │  Key Pool │
                    │ [k1,k2,k3]│
                    └───────────┘
```

### Request Flow
1. Client sends request to the Worker URL.
2. Worker reads `API_KEYS` env var → parses key pool.
3. Picks next key via round-robin, attaches it to the configured header.
4. Forwards request to `TARGET_BASE_URL`.
5. If upstream returns **429**: rotates to next key, retries.
6. If all keys exhausted: returns **503** to client.
7. Otherwise: forwards upstream response with CORS headers.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEYS` | ✅ Yes (secret) | — | JSON array of API keys: `["sk-a","sk-b"]` |
| `TARGET_BASE_URL` | ✅ Yes | — | Upstream API base URL |
| `API_KEY_HEADER` | No | `Authorization` | Header name for the key |
| `API_KEY_PREFIX` | No | `Bearer ` | Prefix prepended to key value |
| `ALLOWED_ORIGINS` | No | `*` | Comma-separated CORS origins |

## Tech Stack
- **Runtime**: Cloudflare Workers (V8 isolates)
- **Language**: TypeScript (ES module syntax)
- **Tooling**: Wrangler CLI
- **Dependencies**: Zero runtime dependencies (native `fetch` API only)

## Current Phase
Initial implementation — core proxy with key rotation logic.
