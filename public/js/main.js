// AI Mirror page logic: columns, keys, running one prompt on every column,
// live stats and Markdown export.

import { streamChat } from "./stream-client.js";
import {
  buildMessages, runStats, formatMs, formatCost, formatTokens, formatSpeed,
  comparisonMarkdown, renderMarkdown,
} from "./compare.js";
import { PRICES, PRICES_CHECKED, SOURCES } from "./prices.js";

const $ = (id) => document.getElementById(id);
const PREFS_KEY = "aimirror.prefs";
const MIN_COLS = 2;
const MAX_COLS = 3;
const DEFAULT_COLS = [
  { provider: "openai", model: "gpt-6-luna" },
  { provider: "anthropic", model: "claude-haiku-5-5" },
];

let catalog = [];      // from /api/models
let columns = [];      // { id, provider, model, el, run }
let nextId = 1;
let controller = null; // AbortController for the current round
let lastRound = null;  // { prompt, system, temperature, maxTokens }

// ---------- storage (any of it may be unavailable) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
const keys = {
  name: (p) => `aimirror.key.${p}`,
  get(p) { try { return localStorage.getItem(this.name(p)) || sessionStorage.getItem(this.name(p)) || ""; } catch { return ""; } },
  set(p, value, remember) {
    try {
      localStorage.removeItem(this.name(p));
      sessionStorage.removeItem(this.name(p));
      if (value) (remember ? localStorage : sessionStorage).setItem(this.name(p), value);
    } catch { /* ignore */ }
  },
  anyRemembered() {
    try { return catalog.some((p) => localStorage.getItem(this.name(p.id))); } catch { return false; }
  },
};

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) n.append(c);
  return n;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3500);
}

const providerInfo = (id) => catalog.find((p) => p.id === id);

// ---------- prefs ----------
function savePrefs() {
  store.set(PREFS_KEY, {
    columns: columns.map((c) => ({ provider: c.provider, model: c.model })),
    prompt: $("prompt").value,
    system: $("system").value,
    temperature: $("temperature").value,
    maxTokens: $("max-tokens").value,
  });
}

// ---------- columns ----------
function addColumn(cfg) {
  if (columns.length >= MAX_COLS) return;
  const id = nextId++;
  const node = $("col-template").content.firstElementChild.cloneNode(true);
  const col = { id, provider: cfg.provider, model: cfg.model, el: node, run: null };

  const sel = node.querySelector(".provider");
  for (const p of catalog) sel.append(el("option", { value: p.id }, p.label));
  if (!providerInfo(col.provider)) col.provider = catalog[0]?.id || col.provider;
  sel.value = col.provider;

  const model = node.querySelector(".model");
  const listId = `models-${id}`;
  model.setAttribute("list", listId);
  node.querySelector(".col-head").append(el("datalist", { id: listId }));
  fillModels(col);
  model.value = col.model || providerInfo(col.provider)?.models[0] || "";
  col.model = model.value;

  sel.addEventListener("change", () => {
    col.provider = sel.value;
    fillModels(col);
    model.value = providerInfo(col.provider)?.models[0] || "";
    col.model = model.value;
    renderKeys();
    savePrefs();
  });
  model.addEventListener("change", () => { col.model = model.value.trim(); savePrefs(); });
  node.querySelector(".remove").addEventListener("click", () => removeColumn(col));
  node.querySelector(".copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(col.run?.text || ""); toast("Copied."); } catch { toast("Copy failed."); }
  });

  columns.push(col);
  $("columns").append(node);
  layoutColumns();
}

function fillModels(col) {
  const list = col.el.querySelector("datalist");
  list.innerHTML = "";
  for (const m of providerInfo(col.provider)?.models || []) list.append(el("option", { value: m }));
}

function removeColumn(col) {
  if (columns.length <= MIN_COLS) return;
  columns = columns.filter((c) => c !== col);
  col.el.remove();
  layoutColumns();
  renderKeys();
  savePrefs();
}

function layoutColumns() {
  $("columns").style.setProperty("--n", String(columns.length));
  $("add-col").disabled = columns.length >= MAX_COLS || Boolean(controller);
  for (const c of columns) {
    const btn = c.el.querySelector(".remove");
    btn.hidden = columns.length <= MIN_COLS;
    btn.disabled = Boolean(controller);
  }
}

// ---------- keys ----------
function renderKeys() {
  const box = $("keys");
  const used = [...new Set(columns.map((c) => c.provider))];
  box.innerHTML = "";
  for (const id of used) {
    const p = providerInfo(id);
    if (!p) continue;
    const input = el("input", { type: "password", autocomplete: "off", spellcheck: "false", placeholder: p.operatorKey ? "optional on this deployment" : `${p.label} API key` });
    input.value = keys.get(id);
    const note = el("span", { class: "key-note muted" });
    input.addEventListener("change", () => {
      keys.set(id, input.value.trim(), $("remember").checked);
      const guess = catalog.find((x) => x.keyPattern && new RegExp(x.keyPattern).test(input.value.trim()));
      note.textContent = guess && guess.id !== id ? `This key looks like it is for ${guess.label}.` : "";
    });
    box.append(el("label", { class: "key-row" }, el("span", { class: "key-label" }, p.label), input, note));
  }
}

function missingKeys() {
  const used = [...new Set(columns.map((c) => c.provider))];
  return used.filter((id) => !keys.get(id) && !providerInfo(id)?.operatorKey);
}

// ---------- running ----------
function readSettings() {
  return {
    prompt: $("prompt").value,
    system: $("system").value,
    temperature: $("temperature").value.trim(),
    maxTokens: Math.max(16, Math.min(16384, Number($("max-tokens").value) || 1024)),
  };
}

function setRunning(on) {
  $("run").disabled = on;
  $("stop").disabled = !on;
  $("export").disabled = on || !lastRound;
  for (const c of columns) {
    c.el.querySelector(".provider").disabled = on;
    c.el.querySelector(".model").disabled = on;
  }
  layoutColumns();
}

async function runAll() {
  if (controller) return;
  const s = readSettings();
  if (!s.prompt.trim()) { toast("Write a prompt first."); $("prompt").focus(); return; }
  if (!catalog.length) { toast("The /api endpoints are not reachable. Run the app with npm run dev or on Vercel."); return; }
  for (const c of columns) c.model = c.el.querySelector(".model").value.trim();
  const missing = missingKeys();
  if (missing.length) {
    $("keys-box").open = true;
    toast(`Add a key for ${missing.map((id) => providerInfo(id)?.label || id).join(" and ")}.`);
    return;
  }
  savePrefs();
  controller = new AbortController();
  lastRound = { ...s };
  setRunning(true);
  const messages = buildMessages(s.system, s.prompt);
  const promptText = messages.map((m) => m.content).join("\n");
  await Promise.allSettled(columns.map((c) => runColumn(c, messages, promptText, s, controller.signal)));
  controller = null;
  setRunning(false);
}

async function runColumn(col, messages, promptText, s, signal) {
  const run = {
    provider: col.provider, providerLabel: providerInfo(col.provider)?.label, model: col.model,
    promptText, text: "", thinking: "", usage: null, error: null, stopped: false,
    startedAt: performance.now(), firstTokenAt: null, endedAt: null,
  };
  col.run = run;
  const node = col.el;
  const out = node.querySelector(".output");
  const think = node.querySelector(".thinking");
  out.innerHTML = "";
  out.classList.add("streaming");
  think.hidden = true;
  think.querySelector("pre").textContent = "";
  node.querySelector(".copy").disabled = true;
  status(col, "Waiting for the first token...");
  showStats(col);

  let frame = 0;
  const paint = () => {
    frame = 0;
    out.innerHTML = renderMarkdown(run.text);
    if (run.thinking) {
      think.hidden = false;
      think.querySelector("summary").textContent = `Reasoning (${run.thinking.length.toLocaleString("en-US")} characters)`;
      think.querySelector("pre").textContent = run.thinking;
    }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };

  try {
    const res = await streamChat({
      provider: col.provider, model: col.model, key: keys.get(col.provider), messages,
      temperature: s.temperature === "" ? undefined : Number(s.temperature), maxTokens: s.maxTokens, signal,
      onEvent: (ev) => {
        if ((ev.delta || ev.thinking) && run.firstTokenAt == null) {
          run.firstTokenAt = performance.now();
          status(col, "Streaming...");
          showStats(col);
        }
        if (ev.delta) { run.text += ev.delta; schedule(); }
        if (ev.thinking) { run.thinking += ev.thinking; schedule(); }
        if (ev.usage) run.usage = ev.usage;
      },
    });
    if (res.error) run.error = res.error;
  } catch (e) {
    if (e.name === "AbortError") run.stopped = true;
    else run.error = e.message;
  }
  run.endedAt = performance.now();
  if (frame) cancelAnimationFrame(frame);
  paint();
  out.classList.remove("streaming");
  if (!run.text && !run.error && !run.stopped) out.innerHTML = '<p class="placeholder">The model returned no text.</p>';
  if (run.error) out.append(el("p", { class: "error" }, run.error));
  node.querySelector(".copy").disabled = !run.text;
  status(col, run.error ? "Failed." : run.stopped ? "Stopped." : "Done.");
  showStats(col);
}

function status(col, text) { col.el.querySelector(".status").textContent = text; }

function showStats(col) {
  const run = col.run;
  const q = (sel) => col.el.querySelector(sel);
  if (!run) { for (const s of [".s-ttft", ".s-total", ".s-tokens", ".s-speed", ".s-cost"]) q(s).textContent = "-"; return; }
  const st = runStats(run);
  q(".s-ttft").textContent = formatMs(st.ttftMs);
  q(".s-total").textContent = run.endedAt != null ? formatMs(st.totalMs) : "...";
  if (run.endedAt == null) { q(".s-tokens").textContent = "..."; q(".s-speed").textContent = "..."; q(".s-cost").textContent = "..."; return; }
  q(".s-tokens").textContent = `${formatTokens(st.inputTokens, st.estimated.input)} / ${formatTokens(st.outputTokens, st.estimated.output)}`;
  q(".s-speed").textContent = formatSpeed(st.tokPerSec);
  q(".s-cost").textContent = formatCost(st.costUsd);
  q(".s-cost").title = st.price
    ? `$${st.price.input} in / $${st.price.output} out per million tokens${st.price.note ? ` (${st.price.note})` : ""}`
    : "No list price on file for this model.";
}

function stopAll() { controller?.abort(); }

function exportMarkdown() {
  const runs = columns.map((c) => c.run).filter(Boolean);
  if (!lastRound || !runs.length) return;
  const md = comparisonMarkdown({ ...lastRound, runs });
  const blob = new Blob([md], { type: "text/markdown" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `model-comparison-${new Date().toISOString().slice(0, 10)}.md` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

// ---------- price table ----------
function renderPrices() {
  $("price-date").textContent = `(checked ${PRICES_CHECKED})`;
  const rows = Object.entries(PRICES).map(([k, p]) => {
    const [provider, ...rest] = k.split("/");
    return el("tr", {},
      el("td", {}, providerInfo(provider)?.label || provider),
      el("td", {}, el("code", {}, rest.join("/"))),
      el("td", { class: "num" }, `$${p.input}`),
      el("td", { class: "num" }, `$${p.output}`),
      el("td", { class: "muted" }, p.note || ""));
  });
  $("price-table").append(
    el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Provider"), el("th", {}, "Model"), el("th", { class: "num" }, "Input / 1M"), el("th", { class: "num" }, "Output / 1M"), el("th", {}, "Note"))),
      el("tbody", {}, rows)),
    el("p", { class: "hint" }, "Sources: ", ...Object.entries(SOURCES).flatMap(([id, url], i) => [i ? ", " : "", el("a", { href: url, rel: "noopener noreferrer" }, providerInfo(id)?.label || id)]),
      ". Mistral is not listed because I could not confirm which versions its -latest aliases point to. Models without a price show the cost as unknown."));
}

// ---------- init ----------
async function loadCatalog() {
  try {
    const r = await fetch("/api/models");
    if (!r.ok) throw new Error(String(r.status));
    catalog = (await r.json()).providers || [];
  } catch {
    catalog = [];
  }
}

async function init() {
  await loadCatalog();
  const prefs = store.get(PREFS_KEY, {});
  $("prompt").value = prefs.prompt || "";
  $("system").value = prefs.system || "";
  if (prefs.temperature != null) $("temperature").value = prefs.temperature;
  if (prefs.maxTokens) $("max-tokens").value = prefs.maxTokens;
  if (!catalog.length) {
    $("columns").append(el("p", { class: "panel error" }, "Could not load /api/models, so no provider list is available. Start the app with npm run dev, or deploy it on Vercel."));
  }
  const cols = Array.isArray(prefs.columns) && prefs.columns.length >= MIN_COLS ? prefs.columns.slice(0, MAX_COLS) : DEFAULT_COLS;
  if (catalog.length) for (const c of cols) addColumn(c);
  $("remember").checked = keys.anyRemembered();
  renderKeys();
  renderPrices();

  $("remember").addEventListener("change", () => {
    for (const p of catalog) { const k = keys.get(p.id); if (k) keys.set(p.id, k, $("remember").checked); }
  });
  $("run").addEventListener("click", runAll);
  $("stop").addEventListener("click", stopAll);
  $("add-col").addEventListener("click", () => {
    const last = columns[columns.length - 1];
    addColumn({ provider: last?.provider || "openrouter", model: "" });
    renderKeys();
    savePrefs();
  });
  $("export").addEventListener("click", exportMarkdown);
  for (const id of ["prompt", "system", "temperature", "max-tokens"]) $(id).addEventListener("change", savePrefs);
  $("prompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runAll(); }
  });
}

init();
