# Deploying AI Mirror

AI Mirror is **static frontend + Vercel edge functions**. There is **no separate
server** to provision, and **no free server is needed** — Vercel's free Hobby plan
runs the whole thing.

## Option A — GitHub integration (recommended)

This is the most reliable path and requires no secrets handed to anyone.

1. The repo lives at `github.com/appleweiping/ai-mirror`.
2. Open <https://vercel.com/new> and sign in (GitHub login is fine).
3. **Import** the `ai-mirror` repo.
4. Vercel reads `vercel.json` automatically:
   - Framework Preset: **Other** (auto-detected as `null`)
   - Build Command: `node build.js`
   - Output Directory: `public`
   - Functions in `api/` deploy as **Edge Functions** automatically.
5. Click **Deploy**. In ~30s you get a `*.vercel.app` URL.
6. Every future `git push` to the default branch redeploys automatically.

## Option B — Vercel CLI

```bash
npm i -g vercel
cd ai-mirror
vercel            # first run links/creates the project
vercel --prod     # promote to production
```

## Environment variables (all optional)

Set these in **Vercel → Project → Settings → Environment Variables**, then
redeploy. With **none** set, the app runs in pure BYOK mode and still works —
users just paste their own keys in Settings.

| Variable | Provider | Notes |
|----------|----------|-------|
| `OPENAI_API_KEY` | ChatGPT | paid |
| `GEMINI_API_KEY` | Gemini | **has a free tier** |
| `ANTHROPIC_API_KEY` | Claude | paid |
| `DEEPSEEK_API_KEY` | DeepSeek | cheap |
| `DASHSCOPE_API_KEY` | Qwen | free quota for new accounts |
| `ZHIPU_API_KEY` | GLM | `glm-4-flash` free |
| `MOONSHOT_API_KEY` | Kimi | paid |
| `MINIMAX_API_KEY` | MiniMax | paid |
| `ARK_API_KEY` | Doubao | uses Volcano Ark endpoint IDs |
| `QIANFAN_API_KEY` | ERNIE | `ernie-speed` free |
| `HF_TOKEN` | Hugging Face | routes OpenAI-compatible chat through `router.huggingface.co` |
| `RELAY_BASE_URL` + `RELAY_API_KEY` | any relay-capable | one OpenAI-compatible endpoint that fronts many models |

Optional compatible base URL overrides:

| Variable | Applies to | Notes |
|----------|------------|-------|
| `OPENAI_BASE_URL` | ChatGPT provider operator key | Useful for an OpenAI-compatible gateway used with `OPENAI_API_KEY` |
| `HF_BASE_URL` | Hugging Face provider operator token | Defaults to `https://router.huggingface.co/v1` |

### About the relay

If you set `RELAY_BASE_URL` (an OpenAI-compatible `/chat/completions` endpoint)
and `RELAY_API_KEY`, every provider marked `relayCapable` in
[`api/_providers.js`](../api/_providers.js) will route there when no BYOK/operator
key is present. This is how you can offer a "free ChatGPT-style" experience to
visitors — **but third-party relays often violate provider ToS and can disappear
without notice.** Gemini is intentionally *not* relay-capable; use its official
free tier instead.

## Cost & abuse warning for public deploys

`/api/chat` is an open proxy by design. If you configure operator keys, **anyone
with your URL can spend them.** For a public site:

- Prefer **BYOK + free tiers** (Gemini / Qwen / GLM / ERNIE) — zero operator cost.
- If you must expose operator keys, add rate limiting (e.g. Vercel's firewall, or
  a KV-backed counter) and/or a simple access gate first.

## Verifying a deploy

- Visit the URL → you should see the model pills with badges.
- `GET /api/models` → JSON catalog with `serverReady` flags.
- Pick a free-tier model (or one you set a key for), send a message → tokens stream in.
- If a model says "no key", open Settings and paste a key — it should work immediately.

## Local verification

Run `npm run dev`, not a plain static file server. The Vercel CLI local server is
required because the frontend depends on `/api/models` and `/api/chat`.

`npm run dev:static` is useful only for visual preview; the UI will intentionally
show a static-preview warning and block sends.
