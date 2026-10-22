// Canned provider replies for `MOCK_UPSTREAM=1 npm run dev`, so the page can
// be tried without a key. Each model gets a fixed text and a made-up speed
// (derived from its name) so the columns finish at different times. None of
// this is real model output, and the timings say nothing about real models.

import { PROVIDERS } from "../api/_providers.js";

const HOSTS = new Set(Object.values(PROVIDERS).map((p) => new URL(p.baseUrl).host));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function replyFor(model, prompt) {
  const h = hash(model);
  const short = h % 2 === 0;
  return [
    `**(mock reply for \`${model}\`)** This text comes from \`scripts/mock-upstream.mjs\`, not from a model.`,
    "",
    `Your prompt was ${prompt.length} characters long. A real run streams the model's answer here, so you can compare wording, length and speed column by column.`,
    ...(short ? [] : [
      "",
      "Things worth comparing in real answers:",
      "",
      "- whether the model follows the system prompt",
      "- how long it takes before the first token",
      "- how many output tokens it spends on the same question",
      "",
      "```python",
      "def tokens_per_second(tokens, seconds):",
      "    return tokens / seconds",
      "```",
    ]),
  ].join("\n");
}

function stream(protocol, model, text, inputTokens) {
  const enc = new TextEncoder();
  const h = hash(model);
  const firstDelay = 300 + (h % 900);     // 0.3 - 1.2 s
  const perChunk = 25 + ((h >> 8) % 45);  // 25 - 69 ms
  const pieces = text.match(/[\s\S]{1,10}/g) || [""];
  return new ReadableStream({
    async start(c) {
      const send = (obj) => c.enqueue(enc.encode(`data: ${typeof obj === "string" ? obj : JSON.stringify(obj)}\n\n`));
      if (protocol === "anthropic") send({ type: "message_start", message: { usage: { input_tokens: inputTokens, output_tokens: 1 } } });
      await sleep(firstDelay);
      for (const p of pieces) {
        if (protocol === "anthropic") send({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: p } });
        else send({ choices: [{ delta: { content: p } }] });
        await sleep(perChunk);
      }
      const out = Math.ceil(text.length / 4);
      if (protocol === "anthropic") {
        send({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: out } });
        send({ type: "message_stop" });
      } else {
        // Leave usage out for some models so the "~" estimate path shows up.
        if (h % 3 !== 0) send({ choices: [], usage: { prompt_tokens: inputTokens, completion_tokens: out } });
        send("[DONE]");
      }
      c.close();
    },
  });
}

export function installMock() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (!HOSTS.has(u.host)) return realFetch(url, init);
    const body = JSON.parse(init.body || "{}");
    const prompt = (body.messages || []).filter((m) => m.role === "user").map((m) => m.content).join("\n");
    const all = [body.system || "", ...(body.messages || []).map((m) => m.content)].join("\n");
    const protocol = u.pathname.endsWith("/messages") ? "anthropic" : "openai";
    return new Response(stream(protocol, body.model || "?", replyFor(body.model || "?", prompt), Math.ceil(all.length / 4)), {
      status: 200, headers: { "content-type": "text/event-stream" },
    });
  };
}
