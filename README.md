# Route429

**API Key Rotation, Simplified.**

Route429 is an edge-deployed proxy and multi-tenant dashboard that transparently proxies your API requests and rotates keys from a pool. When a key hits a rate limit (HTTP 429), it automatically swaps to the next key and retries — zero downtime, zero client changes.

## Features

- **Multi-Tenant Dashboard** — Create accounts, manage projects, and get proxy URLs all from a beautiful web UI.
- **Provider Presets** — One-click setups for Gemini, OpenAI, and Anthropic. Or use any custom API.
- **Automatic Key Rotation** — Seamless failover on 429 responses.
- **Round-Robin Distribution** — Spreads load across your key pool.
- **Full CORS Support** — Preflight handling for browser-based apps.
- **Zero Dependencies** — Pure Cloudflare Workers API + KV + Web Crypto (no npm bloat).
- **Secure by Design** — Keys are encrypted at rest in Cloudflare KV. Passwords hashed with PBKDF2.

## Deployment Guide

### 1. Clone & Install

```bash
git clone https://github.com/your-org/route429.git
cd Route429
npm install
```

### 2. Configure Cloudflare KV

Route429 uses Cloudflare KV to store user accounts, project configurations, and encrypted API keys. 

Create a new KV namespace for production:

```bash
npx wrangler kv:namespace create ROUTE429_KV
```

Copy the generated `id` and update your `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "ROUTE429_KV"
id = "<your-production-id-here>"
```

### 3. Deploy to Production

```bash
npm run deploy
```

Once deployed, visit your worker's production URL (e.g., `https://route429.<your-subdomain>.workers.dev`). 

Sign up for an account through the UI, create a project, and you will receive a unique proxy URL (e.g. `https://route429.../p/my-project/`) that you can plug into your client applications!

## How It Works

Route429 acts as an intelligent router and proxy. When you visit the root URL (`/` or `/dashboard`), it serves a static frontend SPA. 

When your frontend application sends an API request to a proxy path (`/p/<project-name>/*`), the proxy engine kicks in:

```
Request → Parse Project from URL → Load Config from KV
                                           │
                                     Pick Next Key
                                           │
                           ┌───────────────▼───────────────┐
                           │            fetch()            │──── Success → Forward Response
                           │            upstream           │
                           └───────────────┬───────────────┘
                                           │ 429?
                           ┌───────────────▼───────────────┐
                           │          Next Key             │──── Loop until pool exhausted
                           └───────────────┬───────────────┘
                                           │ All exhausted?
                           ┌───────────────▼───────────────┐
                           │          503 JSON             │──── Client retries later
                           └───────────────────────────────┘
```

## Security

- **Encryption at Rest**: API keys and session tokens are stored in Cloudflare KV. 
- **Password Hashing**: User passwords are securely hashed using `PBKDF2-SHA256` via the native Web Crypto API.
- **Edge Deployment**: Keys are injected at the edge and never returned to the client browser.
- **CORS Handling**: You can configure allowed origins per project directly in the dashboard.

### Proxy Secret (Endpoint Protection)

By default, anyone who knows your proxy URL can use it. To lock it down, set a **Proxy Secret** in your project settings. When enabled, every request must include an `X-Proxy-Secret` header:

```bash
curl -X POST "https://route429.dev/p/my-project/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Secret: your-secret-here" \
  -d '{"messages":[{"role":"user","content":"Hello!"}]}'
```

Requests without the correct header receive a `401 Unauthorized` response. The secret is never forwarded to the upstream API.

---
*Route429 — an open-source proxy. Made by [Building It Live](https://buildingitlive.com).*  
*Need help? Email [buildingitlive@gmail.com](mailto:buildingitlive@gmail.com).*
