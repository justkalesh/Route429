# Route429

> 🔄 A free API key rotation proxy gateway built on Cloudflare Workers.

Route429 transparently proxies your API requests, attaching keys from a rotating pool. When a key hits a rate limit (HTTP 429), it automatically swaps to the next key and retries — zero downtime, zero client changes.

## Features

- **Automatic Key Rotation** — Seamless failover on 429 responses
- **Round-Robin Distribution** — Spreads load across your key pool
- **Full CORS Support** — Preflight handling for browser-based apps
- **Zero Dependencies** — Pure Cloudflare Workers API, no npm bloat
- **Configurable Headers** — Works with `Authorization: Bearer`, `x-api-key`, or any custom header
- **Secure by Design** — Keys stored as Cloudflare secrets, never in code

## Quick Start

### 1. Clone & Install

```bash
cd Route429
npm install
```

### 2. Configure Environment

Set your secrets via Wrangler CLI:

```bash
# Set your API key pool (JSON array)
npx wrangler secret put API_KEYS
# When prompted, paste: ["sk-key1","sk-key2","sk-key3"]
```

Edit `wrangler.toml` to set your target API:

```toml
[vars]
TARGET_BASE_URL = "https://api.openai.com"
API_KEY_HEADER  = "Authorization"
API_KEY_PREFIX  = "Bearer "
ALLOWED_ORIGINS = "*"
```

### 3. Run Locally

```bash
npm run dev
```

Test with curl:

```bash
curl http://localhost:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'
```

### 4. Deploy

```bash
npm run deploy
```

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `API_KEYS` | ✅ Secret | — | JSON array of API keys |
| `TARGET_BASE_URL` | ✅ | — | Upstream API base URL |
| `API_KEY_HEADER` | Optional | `Authorization` | Header name for key attachment |
| `API_KEY_PREFIX` | Optional | `Bearer ` | String prepended to key value |
| `ALLOWED_ORIGINS` | Optional | `*` | Comma-separated CORS origins |

## Common Configurations

### OpenAI
```toml
[vars]
TARGET_BASE_URL = "https://api.openai.com"
API_KEY_HEADER  = "Authorization"
API_KEY_PREFIX  = "Bearer "
```

### Google Gemini
```toml
[vars]
TARGET_BASE_URL = "https://generativelanguage.googleapis.com"
API_KEY_HEADER  = "x-goog-api-key"
API_KEY_PREFIX  = ""
```

### Anthropic Claude
```toml
[vars]
TARGET_BASE_URL = "https://api.anthropic.com"
API_KEY_HEADER  = "x-api-key"
API_KEY_PREFIX  = ""
```

## How It Works

```
Request → Parse Key Pool → Pick Key (round-robin)
                                │
                          ┌─────▼─────┐
                          │  fetch()   │──── Success → Forward Response
                          │  upstream  │
                          └─────┬─────┘
                                │ 429?
                          ┌─────▼─────┐
                          │ Next Key   │──── Loop until pool exhausted
                          └─────┬─────┘
                                │ All exhausted?
                          ┌─────▼─────┐
                          │  503 JSON  │──── Client retries later
                          └───────────┘
```

## Error Responses

| Status | Error Code | Meaning |
|---|---|---|
| 500 | `configuration_error` | Missing or invalid env vars |
| 502 | `upstream_error` | Network failure reaching target API |
| 503 | `all_keys_exhausted` | Every key in the pool got rate-limited |

## License

MIT
