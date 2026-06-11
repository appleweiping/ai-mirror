# Handoff — for GPT-5.5 Codex (and future contributors)

This doc is the single source of truth for picking up AI Mirror. Read it fully
before changing anything.

## Status at handoff (2026-06-11)

**Built, syntax-clean, logic-tested, and pushed to GitHub. NOT yet deployed to
Vercel** (deployment is a GitHub-integration click in the Vercel dashboard — see
[`DEPLOY.md`](DEPLOY.md) Option A; the owner does this, no token was shared).

- ✅ 10-provider registry + auth resolution — **14/14 unit assertions pass**
  (BYOK → operator env → relay precedence, protocol selection, slash trimming,
  relay-capability gating, `serverUsable`).
- ✅ Streaming proxy: OpenAI-compatible path + Anthropic→OpenAI translation,
  both re-emitted as a unified `data: {"delta": "..."}` SSE stream.
- ✅ Frontend: model pills, per-brand theming (10 brands × light/dark), SSE
  client, BYOK settings modal, per-model local history, 4 languages.
- ✅ `node build.js` passes; all `.js` pass `node --check`.
- ⚠️ **Not yet run against live provider APIs** — no keys were available in the
  build environment. The protocol shapes follow each vendor's public docs but
  should be smoke-tested live (see "First things to verify" below).

## Mental model

Almost every provider speaks the **OpenAI `/chat/completions` protocol**. Only
Anthropic differs (`/v1/messages`, system as top-level field, different SSE event
shape). So the whole backend is one registry + one proxy with a small Anthropic
branch. The frontend always sends and receives the OpenAI shape; the proxy
translates. Adding a new OpenAI-compatible provider = **one entry in
`api/_providers.js`**, nothing else.

## File map

- `api/_providers.js` — registry (base URLs, model IDs, env key names, flags) +
  `resolveAuth()` + `serverUsable()`. **Start here for any provider change.**
- `api/chat.js` — edge function. `streamOpenAI()` and `streamAnthropic()` +
  generic `transformSSE()` re-encoder.
- `api/models.js` — returns catalog + availability for the UI badges.
- `public/app.js` — all client logic. `BRAND_COLOR` / `BRAND_GLYPH` maps near the
  bottom. `FALLBACK_PROVIDERS` lets the UI work even if `/api/models` is down.
- `public/themes.css` — one `[data-theme="…"]` block per brand, each with a
  `[data-mode="dark"]` variant. Switching a pill sets `data-theme` on `<html>`.
- `public/i18n.js` — zh/en/ja/ko. Keys are referenced in `app.js` via `t()`.

## First things to verify (live)

1. **Free-tier smoke test, no keys:** deploy, set only `GEMINI_API_KEY` (free
   tier), confirm Gemini streams. Then test a Chinese free tier (`ZHIPU_API_KEY`
   → `glm-4-flash`).
2. **BYOK path:** with no env keys, paste a DeepSeek key in Settings → confirm it
   streams and that the key never appears in any server log.
3. **Anthropic translation:** with `ANTHROPIC_API_KEY`, confirm Claude streams
   and that a `system` message is handled (it's split out in `streamAnthropic`).
4. **Doubao caveat:** Volcano Ark uses *endpoint IDs*, not plain model names. The
   registry ships placeholder IDs (`doubao-pro-32k`); real deploys may need the
   user's endpoint ID. Consider adding a per-provider "model override" input in
   Settings (currently only key override exists).

## Known limitations / good next tasks

- **No rate limiting** on `/api/chat`. Before any public deploy with operator
  keys, add a Vercel KV / Upstash counter or the Vercel firewall. (High priority
  if operator keys are used; irrelevant for pure BYOK.)
- **Model picker uses `models[0]` only.** The registry lists multiple models per
  provider but the UI always sends the first. Add a model dropdown per provider.
- **No markdown rendering** in assistant messages (plain text + basic `pre/code`
  styling exists in CSS but isn't wired to a parser). Adding `marked` +
  sanitization would improve readability.
- **Relay** is wired but untested against a real relay endpoint.
- **MiniMax / ERNIE base URLs** follow current public docs; verify they haven't
  changed (these vendors rev their API paths often).

## How to extend

**Add a provider:** add one object to `PROVIDERS` in `api/_providers.js`
(`label`, `protocol`, `baseUrl`, `envKey`, `relayCapable`, `models`, optional
`freeTier`). Then add a theme block in `themes.css` and entries in `BRAND_COLOR`
/ `BRAND_GLYPH` in `app.js`. That's the whole surface.

**Test the registry logic** without a network: the 14-assertion harness used at
build time lives in git history of this commit's message context — recreate by
importing `_providers.js` and asserting `resolveAuth` precedence. Keep it green.

## Owner's intent (from the original request)

- Free multi-model AI for users in China, web-only, instant model switching.
- ChatGPT + Gemini + Claude + DeepSeek + "mainstream Chinese models", **each with
  its matching brand aesthetic** (this is a hard requirement — don't flatten the
  themes into one).
- **Must deploy on Vercel.** No use of the owner's research servers; if a server
  were ever needed, find a free one — but the current design needs none.
- README + site in **English / 中文 / 日本語 / 한국어**.
