// Pure helpers for the comparison page: token and cost estimates, number
// formatting, Markdown export and a small Markdown-to-HTML renderer.
// No DOM access here, so everything can be tested in Node.

import { priceFor, PRICES_CHECKED } from "./prices.js";

export function buildMessages(system, prompt) {
  const out = [];
  if (system && system.trim()) out.push({ role: "system", content: system.trim() });
  out.push({ role: "user", content: String(prompt || "").trim() });
  return out;
}

// Rough token count for when a provider does not report usage: about four
// characters per token for English, about one token per CJK character.
export function estimateTokens(text) {
  const s = String(text || "");
  const cjk = (s.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
  return Math.ceil(cjk + (s.length - cjk) / 4);
}

// Summarise one finished run. `run` holds what the page measured:
// { provider, model, startedAt, firstTokenAt, endedAt, text, usage, promptText }
export function runStats(run) {
  const ttftMs = run.firstTokenAt != null ? run.firstTokenAt - run.startedAt : null;
  const totalMs = run.endedAt != null ? run.endedAt - run.startedAt : null;
  const reported = run.usage && (run.usage.input != null || run.usage.output != null);
  const inputTokens = run.usage?.input ?? estimateTokens(run.promptText);
  const outputTokens = run.usage?.output ?? estimateTokens((run.thinking || "") + (run.text || ""));
  const estimated = {
    input: run.usage?.input == null,
    output: run.usage?.output == null,
  };
  // Speed over the streaming part only, so slow first tokens do not drag it down.
  const streamMs = ttftMs != null && totalMs != null ? totalMs - ttftMs : null;
  const tokPerSec = streamMs && streamMs > 50 && outputTokens > 0 ? outputTokens / (streamMs / 1000) : null;
  const price = priceFor(run.provider, run.model);
  const costUsd = price ? (inputTokens * price.input + outputTokens * price.output) / 1e6 : null;
  return { ttftMs, totalMs, inputTokens, outputTokens, estimated, reported: Boolean(reported), tokPerSec, costUsd, price };
}

export function formatMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
}

export function formatCost(usd) {
  if (usd == null || !Number.isFinite(usd)) return "unknown";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return "< $0.0001";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

export function formatTokens(n, estimated) {
  if (n == null) return "-";
  return `${estimated ? "~" : ""}${n.toLocaleString("en-US")}`;
}

export function formatSpeed(tps) {
  return tps == null ? "-" : `${tps < 10 ? tps.toFixed(1) : Math.round(tps)} tok/s`;
}

// Markdown report of one comparison, for download.
export function comparisonMarkdown({ prompt, system, temperature, maxTokens, runs, date = new Date() }) {
  const lines = [`# Model comparison, ${date.toISOString().slice(0, 16).replace("T", " ")} UTC`, ""];
  if (system && system.trim()) lines.push("**System prompt**", "", quote(system), "");
  lines.push("**Prompt**", "", quote(prompt), "");
  lines.push(`Settings: temperature ${temperature === "" || temperature == null ? "model default" : temperature}, max output tokens ${maxTokens}.`, "");
  lines.push("| Model | First token | Total | Input tokens | Output tokens | Speed | Est. cost |", "| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of runs) {
    const s = runStats(r);
    lines.push(`| ${r.model} (${r.providerLabel || r.provider}) | ${formatMs(s.ttftMs)} | ${formatMs(s.totalMs)} | ${formatTokens(s.inputTokens, s.estimated.input)} | ${formatTokens(s.outputTokens, s.estimated.output)} | ${formatSpeed(s.tokPerSec)} | ${formatCost(s.costUsd)} |`);
  }
  lines.push("", `Times are measured in the browser and include the hop through the proxy. "~" marks token counts estimated from text length because the provider did not report them. Costs use list prices checked on ${PRICES_CHECKED}.`, "");
  for (const r of runs) {
    lines.push(`## ${r.model} (${r.providerLabel || r.provider})`, "");
    if (r.error) lines.push(`_Error: ${r.error}_`, "");
    if (r.stopped) lines.push("_Stopped before the answer finished._", "");
    lines.push((r.text || "").trim() || "_No answer text._", "");
  }
  return lines.join("\n");
}

function quote(text) {
  return String(text).trim().split("\n").map((l) => `> ${l}`).join("\n");
}

// ---------- Markdown-lite renderer ----------
// Enough Markdown for chat answers: fenced code, headings, lists, quotes,
// paragraphs, inline code, bold, italics and links. Everything is escaped
// first, so model output can never inject HTML.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function inline(s) {
  const codes = [];
  let out = escapeHtml(s).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  out = out
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1<em>$2</em>")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
}

export function renderMarkdown(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let para = [];
  let list = null; // { tag, items }

  const flushPara = () => { if (para.length) { html.push(`<p>${para.map(inline).join("<br>")}</p>`); para = []; } };
  const flushList = () => { if (list) { html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.tag}>`); list = null; } };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w+#.-]*)\s*$/);
    if (fence) {
      flushPara(); flushList();
      const code = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i++]);
      const lang = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : "";
      html.push(`<pre${lang}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); flushList(); const n = Math.min(h[1].length + 2, 6); html.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const tag = ul ? "ul" : "ol";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul || ol)[1]);
      continue;
    }
    const q = line.match(/^>\s?(.*)$/);
    if (q) { flushPara(); flushList(); html.push(`<blockquote>${inline(q[1])}</blockquote>`); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return html.join("\n");
}
