/* ai-mirror — frontend app logic.
   - Fetches the provider catalog from /api/models.
   - Renders model pills; clicking one flips data-theme and restyles everything.
   - Streams /api/chat (SSE) token by token.
   - BYOK keys + history + prefs live in localStorage only. */

const $ = (id) => document.getElementById(id);
const LS = {
  lang: "aimirror.lang",
  mode: "aimirror.mode",
  provider: "aimirror.provider",
  keys: "aimirror.keys",          // { providerId: "sk-..." }
  history: "aimirror.history",    // { providerId: [{role,content}] }
};

const state = {
  lang: localStorage.getItem(LS.lang) || (navigator.language || "en").slice(0, 2),
  mode: localStorage.getItem(LS.mode) || "light",
  provider: localStorage.getItem(LS.provider) || "openai",
  providers: [],                  // from /api/models
  keys: JSON.parse(localStorage.getItem(LS.keys) || "{}"),
  history: JSON.parse(localStorage.getItem(LS.history) || "{}"),
  streaming: false,
};
if (!window.I18N[state.lang]) state.lang = "en";

const t = () => window.I18N[state.lang];
const curProvider = () => state.providers.find((p) => p.id === state.provider) || state.providers[0];

// ---------- boot ----------
init();
async function init() {
  buildLangSelector();
  try {
    const r = await fetch("/api/models");
    state.providers = (await r.json()).providers || [];
  } catch {
    // offline / not deployed: fall back to a static list so the UI still works
    state.providers = FALLBACK_PROVIDERS;
  }
  if (!state.providers.find((p) => p.id === state.provider)) {
    state.provider = state.providers[0]?.id || "openai";
  }
  applyTheme();
  applyLang();
  renderPills();
  renderThread();
  wireEvents();
}

// ---------- theme & language ----------
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.provider);
  document.documentElement.setAttribute("data-mode", state.mode);
  $("modeBtn").textContent = state.mode === "dark" ? "☀" : "🌙";
  const p = curProvider();
  const glyph = BRAND_GLYPH[state.provider] || "✦";
  $("brandGlyph").textContent = glyph;
  $("welcomeHero").textContent = glyph;
  $("brandName").textContent = p ? `${p.label} · AI Mirror` : "AI Mirror";
}

function applyLang() {
  document.documentElement.setAttribute("lang", state.lang);
  const x = t();
  $("tagline").textContent = x.tagline;
  $("welcomeTitle").textContent = x.welcomeTitle;
  $("welcomeBody").textContent = x.welcomeBody;
  $("input").placeholder = x.placeholder;
  $("settingsLabel").textContent = x.settings;
  $("footNote").textContent = x.footNote;
  $("mTitle").textContent = x.settings;
  $("mDesc").textContent = x.settingsDesc;
  $("mWarn").textContent = x.relayWarn;
  $("mCancel").textContent = x.cancel;
  $("mSave").textContent = x.save;
  $("clearBtn").title = x.clear;
  $("langSel").value = state.lang;
}

function buildLangSelector() {
  const sel = $("langSel");
  sel.innerHTML = "";
  for (const code of ["zh", "en", "ja", "ko"]) {
    const o = document.createElement("option");
    o.value = code; o.textContent = window.I18N[code]._name;
    sel.appendChild(o);
  }
}

// ---------- model pills ----------
function renderPills() {
  const nav = $("modelPills");
  nav.innerHTML = "";
  for (const p of state.providers) {
    const pill = document.createElement("button");
    pill.className = "pill" + (p.id === state.provider ? " active" : "");
    pill.style.setProperty("--pill-color", BRAND_COLOR[p.id] || "#888");
    const dot = `<span class="dot"></span>`;
    let tag = "";
    if (p.serverReady) tag = `<span class="tag">${t().badgeReady}</span>`;
    else if (p.freeTier) tag = `<span class="tag">${t().badgeFree}</span>`;
    else tag = `<span class="tag">${t().badgeByok}</span>`;
    pill.innerHTML = `${dot}${p.label}${tag}`;
    pill.onclick = () => switchProvider(p.id);
    nav.appendChild(pill);
  }
}

function switchProvider(id) {
  if (state.streaming) return;
  state.provider = id;
  localStorage.setItem(LS.provider, id);
  applyTheme();
  renderPills();
  renderThread();
}

// ---------- thread rendering ----------
function curHistory() { return state.history[state.provider] || []; }
function setHistory(arr) {
  state.history[state.provider] = arr;
  localStorage.setItem(LS.history, JSON.stringify(state.history));
}

function renderThread() {
  const thread = $("thread");
  const hist = curHistory();
  thread.innerHTML = "";
  if (!hist.length) {
    applyLang(); // refresh welcome text
    const w = document.createElement("div");
    w.className = "welcome";
    w.innerHTML = `<div class="hero">${BRAND_GLYPH[state.provider] || "✦"}</div>
      <h1>${t().welcomeTitle}</h1><p>${t().welcomeBody}</p>`;
    thread.appendChild(w);
    return;
  }
  for (const m of hist) thread.appendChild(msgEl(m.role, m.content));
  scrollDown();
}

function msgEl(role, content) {
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  const avatar = role === "user" ? "U" : (BRAND_GLYPH[state.provider] || "✦");
  el.innerHTML = `<div class="avatar">${avatar}</div><div class="body"></div>`;
  el.querySelector(".body").textContent = content;
  return el;
}

function scrollDown() { $("main").scrollTop = $("main").scrollHeight; }

// ---------- send + stream ----------
async function send() {
  const input = $("input");
  const text = input.value.trim();
  if (!text || state.streaming) return;

  const hist = curHistory().slice();
  hist.push({ role: "user", content: text });
  setHistory(hist);
  input.value = ""; autosize();
  renderThread();

  const p = curProvider();
  const assistantEl = msgEl("assistant", "");
  const bodyEl = assistantEl.querySelector(".body");
  bodyEl.classList.add("cursor");
  $("thread").appendChild(assistantEl);
  scrollDown();

  state.streaming = true; updateSendBtn();
  let acc = "";

  try {
    const headers = { "content-type": "application/json" };
    const userKey = (state.keys[state.provider] || "").trim();
    if (userKey) headers["x-user-key"] = userKey;

    const resp = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        provider: state.provider,
        model: p.models[0],
        messages: hist,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      bodyEl.classList.remove("cursor");
      if (resp.status === 401 || err.error === "no-key") {
        bodyEl.textContent = t().needKey;
        bodyEl.style.color = "var(--fg-soft)";
        setTimeout(openSettings, 600);
      } else {
        bodyEl.textContent = t().errorPrefix + (err.message || err.detail || resp.status);
        bodyEl.style.color = "#d9534f";
      }
      state.streaming = false; updateSendBtn();
      // drop the empty assistant turn from history
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const data = s.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          if (j.delta) { acc += j.delta; bodyEl.textContent = acc; scrollDown(); }
        } catch { /* ignore */ }
      }
    }
    bodyEl.classList.remove("cursor");
    if (acc) {
      const h2 = curHistory().slice();
      h2.push({ role: "assistant", content: acc });
      setHistory(h2);
    }
  } catch (e) {
    bodyEl.classList.remove("cursor");
    bodyEl.textContent = t().errorPrefix + (e.message || e);
    bodyEl.style.color = "#d9534f";
  } finally {
    state.streaming = false; updateSendBtn();
  }
}

function updateSendBtn() {
  $("sendBtn").disabled = state.streaming || !$("input").value.trim();
}
function autosize() {
  const i = $("input");
  i.style.height = "auto";
  i.style.height = Math.min(i.scrollHeight, 180) + "px";
}

// ---------- settings modal ----------
function openSettings() {
  const wrap = $("keyFields");
  wrap.innerHTML = "";
  for (const p of state.providers) {
    const field = document.createElement("div");
    field.className = "field";
    let badge = "";
    if (p.serverReady) badge = `<span class="badge ready">${t().badgeReady}</span>`;
    else if (p.freeTier) badge = `<span class="badge free">${t().badgeFree}</span>`;
    else badge = `<span class="badge byok">${t().badgeByok}</span>`;
    field.innerHTML = `<label>${p.label}${badge}</label>
      <input type="password" data-pid="${p.id}" placeholder="${t().keyPlaceholder}" value="${state.keys[p.id] || ""}" />`;
    wrap.appendChild(field);
  }
  $("overlay").classList.add("open");
}
function saveSettings() {
  document.querySelectorAll("#keyFields input").forEach((inp) => {
    const pid = inp.dataset.pid;
    const v = inp.value.trim();
    if (v) state.keys[pid] = v; else delete state.keys[pid];
  });
  localStorage.setItem(LS.keys, JSON.stringify(state.keys));
  $("overlay").classList.remove("open");
  renderPills();
}

// ---------- events ----------
function wireEvents() {
  const input = $("input");
  input.addEventListener("input", () => { autosize(); updateSendBtn(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("sendBtn").onclick = send;
  $("modeBtn").onclick = () => {
    state.mode = state.mode === "dark" ? "light" : "dark";
    localStorage.setItem(LS.mode, state.mode);
    applyTheme();
  };
  $("langSel").onchange = (e) => {
    state.lang = e.target.value;
    localStorage.setItem(LS.lang, state.lang);
    applyLang(); renderPills(); renderThread();
  };
  $("settingsBtn").onclick = openSettings;
  $("mCancel").onclick = () => $("overlay").classList.remove("open");
  $("mSave").onclick = saveSettings;
  $("overlay").onclick = (e) => { if (e.target === $("overlay")) $("overlay").classList.remove("open"); };
  $("clearBtn").onclick = () => { setHistory([]); renderThread(); };
}

// ---------- brand visuals (client-side cosmetic only) ----------
const BRAND_COLOR = {
  openai: "#10a37f", gemini: "#4285f4", claude: "#d97757", deepseek: "#4d6bfe",
  qwen: "#615ced", glm: "#1f9c6b", kimi: "#6b4eff", minimax: "#f23c5d",
  doubao: "#0a84ff", ernie: "#2932e1",
};
const BRAND_GLYPH = {
  openai: "✦", gemini: "✧", claude: "✳", deepseek: "🐳", qwen: "通",
  glm: "智", kimi: "🌙", minimax: "M", doubao: "豆", ernie: "文",
};

// used only if /api/models is unreachable (e.g. opened as a static file)
const FALLBACK_PROVIDERS = [
  { id: "openai", label: "ChatGPT", models: ["gpt-4o"], freeTier: false, serverReady: false },
  { id: "gemini", label: "Gemini", models: ["gemini-2.5-flash"], freeTier: true, serverReady: false },
  { id: "claude", label: "Claude", models: ["claude-sonnet-4-6"], freeTier: false, serverReady: false },
  { id: "deepseek", label: "DeepSeek", models: ["deepseek-chat"], freeTier: false, serverReady: false },
  { id: "qwen", label: "Qwen", models: ["qwen-plus"], freeTier: true, serverReady: false },
  { id: "glm", label: "GLM", models: ["glm-4-flash"], freeTier: true, serverReady: false },
  { id: "kimi", label: "Kimi", models: ["moonshot-v1-8k"], freeTier: false, serverReady: false },
  { id: "minimax", label: "MiniMax", models: ["abab6.5s-chat"], freeTier: false, serverReady: false },
  { id: "doubao", label: "Doubao", models: ["doubao-lite-32k"], freeTier: false, serverReady: false },
  { id: "ernie", label: "ERNIE", models: ["ernie-speed-128k"], freeTier: true, serverReady: false },
];
