# MetaLLM

Tiny, transparent OpenAI-style completions proxy that:
- Keeps a hot SQLite WAL-backed database in RAM while persisting to `data/rate_limits.db`.
- Tracks per-model usage and rate limits (per minute / hour / day / month) for completions, and per-provider limits for search.
- Lets you grade models and route a meta-model name to the best available candidate; if the top choice is throttled it falls back automatically.
- Ships with a lightweight web UI to manage providers, models, limits, and see live counters.
- Handles both direct OpenAI-compatible providers and OpenRouter provider-pinned routing (use provider IDs prefixed with `openrouter-`). Fetch the OpenRouter provider/model directory via `/api/openrouter/providers` to seed records quickly.

## Stack
- Nuxt 4 + Nuxt UI v4
- h3 / Nitro server routes
- SQLite via `bun:sqlite` (hot WAL + large cache)

## Quickstart
```bash
# install deps (requires network)
bun install   # or npm install

# dev server
bun dev
# build & preview
bun build && bun start
```
The dev server listens on `http://localhost:3000` by default. Override with `PORT=4000 npx nuxi dev`.

### Admin auth
- Set `ADMIN_TOKEN=<your-secret>` in env; UI and config endpoints require it.
- Authenticate at `/login`; a cookie `admin_token` is set for one week.
- API admin calls can also send `Authorization: Bearer <token>` or `x-admin-token: <token>`.
- (Search) Providers are ordered by `priority` and routed to the first one under its limits; you can still override auth per request with `Authorization: Bearer ...`.

## Concepts
- **Provider**: base URL + API key (e.g., `openai`, `anthropic`).  
- **Model**: concrete model name tied to a provider plus limits and grade/priority.  
- **Meta-model**: friendly alias (e.g., `base`) mapped to an ordered list of models. Routing picks the highest-graded candidate that is not rate-limited.

## OpenRouter providers
- Register OpenRouter providers with IDs prefixed by `openrouter-` (for example, `openrouter-anthropic`) and `https://openrouter.ai/api/v1` as the base URL.
- Requests to these providers automatically include OpenRouter headers (`Referer`, `X-Title`) and set provider preferences (`order` + `allow_fallbacks=false`) so calls are pinned to the intended upstream provider per the routing docs.
- Use `GET /api/openrouter/models` (admin-only) to list models, then `GET /api/openrouter/endpoints?model=<id>` to pick a specific provider endpoint for that model.

## HTTP Surface
- `POST /v1/chat/completions` — drop-in proxy. Body must include `model`.  
  - If `model` matches a real model, it proxies there.  
  - If it matches a meta-model, the router walks candidates until one is under its limits.  
  - Returns upstream JSON; on 429 includes `retry_after_seconds`.
- `GET /v1/models` — OpenAI-style list of active concrete and meta models (meta entries include `targets` order).
- `GET /config` — providers, models, meta mappings (admin-protected).
- `GET /health` — liveness.
- Web UI at `/` (admin-protected) — manage and inspect everything.

## Persistence & Performance
SQLite lives at `data/rate_limits.db` with WAL + large memory cache to keep it hot while keeping durable files on disk. Files are git-ignored (`data/*.db*`).

## Adding Providers/Models (UI)
1) Open `http://localhost:3000/`.  
2) Add a provider (id, base_url, api_key).  
3) Add models with optional limits and grades.  
4) Create meta-models by providing a comma-separated list of model IDs in order of preference.
5) Add Search Providers (Perplexity-style) with limits and priority; `/v1/search` will pick the first active provider under its limits.

## Notes
- Proxy forwards the incoming body, overriding only `model` for the selected target. Auth header comes from the stored provider key, or the incoming `Authorization` header if the provider key is empty.  
- Usage is recorded from upstream `usage.prompt_tokens`, `usage.completion_tokens`, and `usage.total_tokens` if present; otherwise counts still increment request totals.  
- Error handling: 404 when no model/meta matches; 429 when every candidate is at limit; 502 if the upstream call fails.

## Testing ideas
- Seed two models with tight limits and fire requests to see fallback.  
- Point provider `base_url` at `https://api.openai.com` and set `api_key` to a valid key to act as a transparent proxy.  
- Use `curl`:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"base","prompt":"hello"}'
```
