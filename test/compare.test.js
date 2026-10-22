import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMessages, estimateTokens, runStats, formatMs, formatCost, formatTokens, formatSpeed,
  comparisonMarkdown, renderMarkdown, escapeHtml,
} from "../public/js/compare.js";
import { PRICES, priceFor } from "../public/js/prices.js";
import { PROVIDERS } from "../api/_providers.js";

test("buildMessages adds the system prompt only when there is one", () => {
  assert.deepEqual(buildMessages("", " hi "), [{ role: "user", content: "hi" }]);
  assert.deepEqual(buildMessages("Be brief.", "hi"), [{ role: "system", content: "Be brief." }, { role: "user", content: "hi" }]);
});

test("estimateTokens counts CJK characters as single tokens", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcdefgh"), 2);
  assert.equal(estimateTokens("你好世界"), 4);
});

test("runStats uses reported usage and list prices", () => {
  const s = runStats({
    provider: "anthropic", model: "claude-sonnet-5-5", promptText: "x",
    startedAt: 1000, firstTokenAt: 1400, endedAt: 3400, text: "answer",
    usage: { input: 1000, output: 400 },
  });
  assert.equal(s.ttftMs, 400);
  assert.equal(s.totalMs, 2400);
  assert.equal(s.inputTokens, 1000);
  assert.equal(s.outputTokens, 400);
  assert.deepEqual(s.estimated, { input: false, output: false });
  assert.equal(s.tokPerSec, 200); // 400 tokens over the 2 s after the first token
  assert.ok(Math.abs(s.costUsd - (1000 * 2 + 400 * 10) / 1e6) < 1e-12);
});

test("runStats estimates tokens when usage is missing and leaves cost unknown without a price", () => {
  const s = runStats({
    provider: "mistral", model: "mistral-small-latest", promptText: "12345678",
    startedAt: 0, firstTokenAt: null, endedAt: 500, text: "abcd", usage: null,
  });
  assert.equal(s.ttftMs, null);
  assert.equal(s.inputTokens, 2);
  assert.equal(s.outputTokens, 1);
  assert.deepEqual(s.estimated, { input: true, output: true });
  assert.equal(s.tokPerSec, null);
  assert.equal(s.costUsd, null);
});

test("formatters", () => {
  assert.equal(formatMs(null), "-");
  assert.equal(formatMs(830.4), "830 ms");
  assert.equal(formatMs(2345), "2.35 s");
  assert.equal(formatMs(12345), "12.3 s");
  assert.equal(formatCost(null), "unknown");
  assert.equal(formatCost(0.00002), "< $0.0001");
  assert.equal(formatCost(0.0012345), "$0.00123");
  assert.equal(formatCost(0.12345), "$0.1235");
  assert.equal(formatTokens(1234, true), "~1,234");
  assert.equal(formatTokens(12, false), "12");
  assert.equal(formatSpeed(null), "-");
  assert.equal(formatSpeed(7.25), "7.3 tok/s");
  assert.equal(formatSpeed(88.6), "89 tok/s");
});

test("every price entry points at a provider and model the adapter offers", () => {
  for (const key of Object.keys(PRICES)) {
    const [provider, ...rest] = key.split("/");
    assert.ok(PROVIDERS[provider], `unknown provider in ${key}`);
    assert.ok(PROVIDERS[provider].models.includes(rest.join("/")), `${key} is not in the model list`);
  }
  assert.equal(priceFor("openrouter", "qwen/qwen3.7-plus").input, 0.32);
  assert.equal(priceFor("openai", "nope"), null);
});

test("comparisonMarkdown has a stats table and every answer", () => {
  const md = comparisonMarkdown({
    prompt: "What is 2+2?", system: "Be brief.", temperature: "", maxTokens: 256, date: new Date(Date.UTC(2026, 9, 21, 9, 30)),
    runs: [
      { provider: "openai", providerLabel: "OpenAI", model: "gpt-6-luna", promptText: "x", startedAt: 0, firstTokenAt: 300, endedAt: 900, text: "4", usage: { input: 20, output: 2 } },
      { provider: "deepseek", providerLabel: "DeepSeek", model: "deepseek-flash", promptText: "x", startedAt: 0, firstTokenAt: null, endedAt: 100, text: "", usage: null, error: "upstream said no" },
    ],
  });
  assert.match(md, /^# Model comparison, 2026-10-21 09:30 UTC/);
  assert.match(md, /> Be brief\./);
  assert.match(md, /> What is 2\+2\?/);
  assert.match(md, /temperature model default, max output tokens 256/);
  assert.match(md, /\| gpt-6-luna \(OpenAI\) \| 300 ms \| 900 ms \| 20 \| 2 \|/);
  assert.match(md, /## deepseek-flash \(DeepSeek\)\n\n_Error: upstream said no_/);
});

test("renderMarkdown escapes HTML and handles the common blocks", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  const html = renderMarkdown([
    "## Title",
    "Some **bold**, *italic* and `code <b>`.",
    "",
    "- one",
    "- two",
    "",
    "1. first",
    "",
    "```js",
    "if (a < b) alert('x')",
    "```",
    "> quoted",
    "[link](https://example.com) and [bad](javascript:alert(1))",
    "<script>alert(1)</script>",
  ].join("\n"));
  assert.match(html, /<h4>Title<\/h4>/);
  assert.match(html, /<strong>bold<\/strong>, <em>italic<\/em> and <code>code &lt;b&gt;<\/code>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
  assert.match(html, /<pre data-lang="js"><code>if \(a &lt; b\) alert\(&#39;x&#39;\)<\/code><\/pre>/);
  assert.match(html, /<blockquote>quoted<\/blockquote>/);
  assert.match(html, /<a href="https:\/\/example.com" rel="noopener noreferrer" target="_blank">link<\/a>/);
  assert.ok(!html.includes("<script>"));
  assert.ok(!/href="javascript/.test(html));
});

test("renderMarkdown copes with an unfinished code fence while streaming", () => {
  const html = renderMarkdown("Here:\n```py\nprint(1)");
  assert.match(html, /<pre data-lang="py"><code>print\(1\)<\/code><\/pre>/);
});
