/* ai-mirror — frontend app logic.
   Static UI + Vercel API, with local BYOK keys and per-provider history. */

const $ = (id) => document.getElementById(id);

const LS = {
  lang: "aimirror.lang",
  mode: "aimirror.mode",
  provider: "aimirror.provider",
  keys: "aimirror.keys",
  history: "aimirror.history",
  models: "aimirror.models",
  relayNotice: "aimirror.relayNoticeDismissed",
};

const state = {
  lang: localStorage.getItem(LS.lang) || (navigator.language || "en").slice(0, 2),
  mode: localStorage.getItem(LS.mode) || "light",
  provider: localStorage.getItem(LS.provider) || "openai",
  providers: [],
  keys: readJSON(LS.keys, {}),
  history: readJSON(LS.history, {}),
  modelPrefs: readJSON(LS.models, {}),
  apiOnline: true,
  streaming: false,
  abortController: null,
  toastTimer: null,
  toastHover: false,
  scene: null,
  sceneContainer: null,
  sceneLoading: false,
};

if (!window.I18N[state.lang]) state.lang = "en";

const t = () => window.I18N[state.lang] || window.I18N.en;
const curProvider = () => state.providers.find((p) => p.id === state.provider) || state.providers[0];
const hasUserKey = (providerId) => Boolean((state.keys[providerId] || "").trim());
const selectedModel = (provider = curProvider()) => {
  if (!provider) return "";
  return (state.modelPrefs[provider.id] || provider.models?.[0] || "").trim();
};

init();

async function init() {
  buildLangSelector();
  wireEvents();
  await loadProviders();
  if (!state.providers.find((p) => p.id === state.provider)) {
    state.provider = state.providers[0]?.id || "openai";
  }
  renderApp();
  maybeShowRelayNotice();
}

async function loadProviders() {
  try {
    const resp = await fetch("/api/models", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!resp.ok) throw new Error(`models ${resp.status}`);
    const data = await resp.json();
    state.providers = data.providers || [];
    state.apiOnline = true;
  } catch {
    state.providers = FALLBACK_PROVIDERS;
    state.apiOnline = false;
  }
}

function renderApp() {
  applyTheme();
  applyLang();
  renderPills();
  renderProviderPanel();
  renderThread();
  updateSendBtn();
  autosize();
}

// ---------- theme & language ----------
function applyTheme() {
  const p = curProvider();
  document.documentElement.setAttribute("data-theme", state.provider);
  document.documentElement.setAttribute("data-mode", state.mode);

  $("modeBtn").textContent = state.mode === "dark" ? "☀" : "☾";
  $("modeBtn").title = state.mode === "dark" ? t().lightMode : t().darkMode;

  const glyph = BRAND_GLYPH[state.provider] || "AI";
  $("brandGlyph").textContent = glyph;
  $("brandName").textContent = p ? `${p.label} · AI Mirror` : "AI Mirror";

  // 3D welcome scene reads the CSS accent at switch time.
  if (state.scene) state.scene.refreshTheme();
}

function applyLang() {
  document.documentElement.setAttribute("lang", state.lang);
  const x = t();
  $("tagline").textContent = x.tagline;
  $("input").placeholder = x.placeholder;
  $("settingsLabel").textContent = x.settings;
  $("clearBtn").title = x.clear;
  $("clearBtn").setAttribute("aria-label", x.clear);
  $("newChatBtn").textContent = x.newChat;
  $("modelLabel").textContent = x.modelLabel;
  $("footNote").textContent = x.footNote;
  $("mTitle").textContent = x.settings;
  $("mDesc").textContent = x.settingsDesc;
  $("mWarn").textContent = x.relayWarn;
  $("mCancel").textContent = x.cancel;
  $("mSave").textContent = x.save;
  $("mClose").setAttribute("aria-label", x.cancel);
  $("mClearAll").textContent = x.clearAllData;
  $("noticeText").textContent = x.relayNoticeBar;
  $("noticeDismiss").setAttribute("aria-label", x.dismiss);
  $("langSel").value = state.lang;
  if (state.scene) state.scene.setHint(x.sceneHint);
}

function buildLangSelector() {
  const sel = $("langSel");
  sel.innerHTML = "";
  for (const code of ["zh", "en", "ja", "ko"]) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = window.I18N[code]._name;
    sel.appendChild(option);
  }
}

// ---------- provider picker ----------
function renderPills() {
  const nav = $("modelPills");
  nav.innerHTML = "";
  for (const p of state.providers) {
    const pill = document.createElement("button");
    pill.className = "pill" + (p.id === state.provider ? " active" : "");
    pill.type = "button";
    pill.style.setProperty("--pill-color", BRAND_COLOR[p.id] || "#888");
    pill.setAttribute("aria-pressed", String(p.id === state.provider));
    pill.onclick = () => switchProvider(p.id);

    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.className = "pill-label";
    label.textContent = p.label;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = providerBadge(p).short;

    pill.append(dot, label, tag);
    nav.appendChild(pill);
  }
}

function renderProviderPanel() {
  const p = curProvider();
  if (!p) return;
  const status = providerBadge(p);

  $("selectedProviderGlyph").textContent = BRAND_GLYPH[p.id] || "AI";
  $("selectedProviderLabel").textContent = p.label;
  $("selectedProviderSub").textContent = t().providerSub
    .replace("{count}", String(p.models?.length || 0))
    .replace("{model}", selectedModel(p) || "-");

  const badge = $("providerStatus");
  badge.textContent = status.label;
  badge.className = `status-badge ${status.kind}`;
  $("providerHelp").textContent = state.apiOnline ? status.help : t().staticMode;

  const select = $("modelSel");
  select.innerHTML = "";
  const models = p.models || [];
  const current = selectedModel(p);
  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  }
  if (current && !models.includes(current)) {
    const option = document.createElement("option");
    option.value = current;
    option.textContent = `${current} (${t().customModel})`;
    select.prepend(option);
  }
  select.value = current || models[0] || "";

  $("providerAction").textContent = hasUserKey(p.id) || p.serverReady ? t().manageKeys : t().addKey;
}

function providerBadge(p) {
  if (!state.apiOnline) {
    return { kind: "offline", short: t().badgePreview, label: t().badgePreview, help: t().staticMode };
  }
  if (p.serverReady) {
    return { kind: "ready", short: t().badgeReady, label: t().statusReady, help: t().statusReadyHelp };
  }
  if (hasUserKey(p.id)) {
    return { kind: "byok", short: t().badgeKeySaved, label: t().statusKeySaved, help: t().statusKeySavedHelp };
  }
  if (p.freeTier) {
    return { kind: "free", short: t().badgeFree, label: t().statusFree, help: t().statusFreeHelp };
  }
  return { kind: "needs-key", short: t().badgeByok, label: t().statusNeedsKey, help: t().statusNeedsKeyHelp };
}

function switchProvider(id) {
  if (state.streaming) {
    showToast(t().waitForStream);
    return;
  }
  state.provider = id;
  localStorage.setItem(LS.provider, id);
  renderApp();
}

// ---------- thread rendering ----------
function curHistory() {
  return state.history[state.provider] || [];
}

function setHistory(arr) {
  state.history[state.provider] = arr;
  localStorage.setItem(LS.history, JSON.stringify(state.history));
}

function renderThread() {
  const thread = $("thread");
  const hist = curHistory();
  thread.innerHTML = "";
  if (!hist.length) {
    thread.appendChild(welcomeEl());
    mountWelcomeScene();
    return;
  }
  destroyWelcomeScene();
  for (const message of hist) thread.appendChild(msgEl(message.role, message.content));
  scrollDown();
}

function welcomeEl() {
  const x = t();
  const p = curProvider();
  const wrap = document.createElement("section");
  wrap.className = "welcome";

  // Persistent 3D scene container (canvas survives provider switches);
  // falls back to the static banner when WebGL is unavailable.
  if (!state.sceneContainer) {
    state.sceneContainer = document.createElement("div");
    state.sceneContainer.className = "welcome-scene";
  }

  const title = document.createElement("h1");
  title.textContent = x.welcomeTitle;
  const body = document.createElement("p");
  body.textContent = x.welcomeBody;

  const status = document.createElement("div");
  status.className = "welcome-status";
  status.textContent = providerBadge(p).help;

  const prompts = document.createElement("div");
  prompts.className = "quick-prompts";
  for (const prompt of x.quickPrompts || []) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = prompt;
    button.onclick = () => usePrompt(prompt);
    prompts.appendChild(button);
  }

  const actions = document.createElement("div");
  actions.className = "welcome-actions";
  const settings = document.createElement("button");
  settings.type = "button";
  settings.className = "btn primary compact";
  settings.textContent = hasUserKey(p.id) || p.serverReady ? x.startReady : x.addKey;
  settings.onclick = hasUserKey(p.id) || p.serverReady ? focusComposer : openSettings;
  const docs = document.createElement("a");
  docs.className = "btn ghost compact";
  docs.href = "https://github.com/appleweiping/ai-mirror";
  docs.target = "_blank";
  docs.rel = "noreferrer";
  docs.textContent = x.sourceCode;
  actions.append(settings, docs);

  wrap.append(state.sceneContainer, title, body, status, prompts, actions);
  return wrap;
}

// ---------- 3D welcome scene lifecycle ----------
let webglOk = null;
function webglSupported() {
  if (webglOk !== null) return webglOk;
  try {
    const c = document.createElement("canvas");
    webglOk = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    webglOk = false;
  }
  return webglOk;
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || false;
}

async function mountWelcomeScene() {
  const container = state.sceneContainer;
  if (!container) return;

  if (state.scene) {
    state.scene.setActive(state.provider);
    state.scene.refreshTheme();
    state.scene.setHint(t().sceneHint);
    state.scene.resume();
    return;
  }
  if (state.sceneLoading || container.dataset.fallback) return;

  if (prefersReducedMotion() || !webglSupported()) {
    mountFallbackBanner(container);
    return;
  }

  state.sceneLoading = true;
  try {
    const mod = await import("./scene3d.js");
    // Chat may have started (or scene mounted) while the module loaded.
    if (state.scene || !container.isConnected) return;
    state.scene = mod.createMirrorScene({
      container,
      providers: state.providers.map((p) => ({
        id: p.id,
        label: p.label,
        color: BRAND_COLOR[p.id] || "#888888",
      })),
      activeId: state.provider,
      hint: t().sceneHint,
      tooltipFor: (label) => label,
      onSelect: (id) => switchProvider(id),
    });
    container.classList.add("live");
  } catch {
    // CDN unreachable or WebGL init failed — static welcome stays usable.
    mountFallbackBanner(container);
  } finally {
    state.sceneLoading = false;
  }
}

function mountFallbackBanner(container) {
  if (container.dataset.fallback) return;
  container.dataset.fallback = "1";
  const banner = document.createElement("img");
  banner.className = "welcome-banner";
  banner.src = "assets/ai-mirror-banner.png";
  banner.alt = "";
  banner.loading = "lazy";
  container.appendChild(banner);
}

function destroyWelcomeScene() {
  if (state.scene) {
    state.scene.dispose();
    state.scene = null;
  }
  if (state.sceneContainer) {
    state.sceneContainer.remove();
    state.sceneContainer = null;
  }
}

function msgEl(role, content) {
  const el = document.createElement("article");
  el.className = `msg ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "U" : (BRAND_GLYPH[state.provider] || "AI");

  const contentWrap = document.createElement("div");
  contentWrap.className = "message-content";

  const body = document.createElement("div");
  body.className = "body";
  if (role === "assistant") body.innerHTML = formatContent(content);
  else body.textContent = content;
  contentWrap.appendChild(body);

  if (role === "assistant" && content) {
    const actions = document.createElement("div");
    actions.className = "msg-actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = t().copy;
    copy.onclick = async () => {
      try {
        await copyText(content);
        showToast(t().copied);
      } catch {
        showToast(t().copyFailed);
      }
    };
    actions.appendChild(copy);
    contentWrap.appendChild(actions);
  }

  el.append(avatar, contentWrap);
  return el;
}

function scrollDown() {
  $("main").scrollTop = $("main").scrollHeight;
}

// ---------- send + stream ----------
async function send() {
  const input = $("input");
  const text = input.value.trim();
  const p = curProvider();
  if (!text || !p || state.streaming) return;

  if (!state.apiOnline) {
    showToast(t().staticMode);
    return;
  }
  if (!hasUserKey(p.id) && !p.serverReady) {
    showToast(p.freeTier ? t().freeNeedsKeyToast : t().needsKeyToast);
    openSettings();
    return;
  }

  const hist = curHistory().slice();
  hist.push({ role: "user", content: text });
  setHistory(hist);
  input.value = "";
  autosize();
  renderThread();

  const assistantEl = msgEl("assistant", "");
  const bodyEl = assistantEl.querySelector(".body");
  bodyEl.classList.add("cursor");
  $("thread").appendChild(assistantEl);
  scrollDown();

  state.streaming = true;
  state.abortController = new AbortController();
  updateSendBtn();

  let acc = "";
  try {
    const headers = { "content-type": "application/json" };
    const userKey = (state.keys[state.provider] || "").trim();
    if (userKey) headers["x-user-key"] = userKey;

    const resp = await fetch("/api/chat", {
      method: "POST",
      headers,
      signal: state.abortController.signal,
      body: JSON.stringify({
        provider: state.provider,
        model: selectedModel(p),
        messages: hist,
      }),
    });

    if (!resp.ok || !resp.body) {
      const err = await readError(resp);
      bodyEl.classList.remove("cursor");
      bodyEl.classList.add("error");
      if (resp.status === 401 || err.error === "no-key") {
        bodyEl.textContent = t().needKey;
        setTimeout(openSettings, 250);
      } else {
        bodyEl.textContent = t().errorPrefix + (err.message || err.detail || err.status || resp.status);
      }
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
        if (!data || data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          if (json.delta) {
            acc += json.delta;
            bodyEl.textContent = acc;
            scrollDown();
          }
        } catch {
          // Ignore malformed keepalive fragments.
        }
      }
    }

    bodyEl.classList.remove("cursor");
    if (acc) {
      bodyEl.innerHTML = formatContent(acc);
      const h2 = curHistory().slice();
      h2.push({ role: "assistant", content: acc });
      setHistory(h2);
      renderThread();
    }
  } catch (e) {
    bodyEl.classList.remove("cursor");
    if (e?.name === "AbortError") {
      bodyEl.textContent = acc || t().stopped;
      if (acc) {
        const h2 = curHistory().slice();
        h2.push({ role: "assistant", content: acc });
        setHistory(h2);
        renderThread();
      }
    } else {
      bodyEl.classList.add("error");
      bodyEl.textContent = t().errorPrefix + (e.message || e);
    }
  } finally {
    state.streaming = false;
    state.abortController = null;
    updateSendBtn();
  }
}

function stopStreaming() {
  if (state.abortController) state.abortController.abort();
}

function updateSendBtn() {
  const sendBtn = $("sendBtn");
  if (state.streaming) {
    sendBtn.disabled = false;
    sendBtn.textContent = "■";
    sendBtn.title = t().stop;
    return;
  }
  sendBtn.disabled = !$("input").value.trim();
  sendBtn.textContent = "↑";
  sendBtn.title = t().send;
}

function autosize() {
  const input = $("input");
  input.style.height = "auto";
  // Auto-grow up to 6 lines, then scroll inside the textarea.
  const cs = getComputedStyle(input);
  const lineHeight = parseFloat(cs.lineHeight) || 23;
  const padding = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const max = Math.round(lineHeight * 6 + padding);
  input.style.height = Math.min(input.scrollHeight, max) + "px";
}

async function readError(resp) {
  try {
    return await resp.json();
  } catch {
    return { message: await resp.text().catch(() => "") };
  }
}

// ---------- settings modal ----------
function openSettings() {
  const wrap = $("keyFields");
  wrap.innerHTML = "";

  for (const p of state.providers) {
    const field = document.createElement("div");
    field.className = "field";

    const head = document.createElement("div");
    head.className = "field-head";
    const label = document.createElement("label");
    label.textContent = p.label;
    const badge = document.createElement("span");
    const status = providerBadge(p);
    badge.className = `badge ${status.kind}`;
    badge.textContent = status.label;
    head.append(label, badge);

    const keyRow = document.createElement("div");
    keyRow.className = "key-row";

    const key = document.createElement("input");
    key.type = "password";
    key.dataset.keyPid = p.id;
    key.placeholder = t().keyPlaceholder;
    key.value = state.keys[p.id] || "";
    key.autocomplete = "off";
    key.spellcheck = false;

    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "key-eye";
    eye.setAttribute("aria-label", t().showKey);
    eye.setAttribute("aria-pressed", "false");
    eye.innerHTML = EYE_SVG;
    eye.onclick = () => {
      const reveal = key.type === "password";
      key.type = reveal ? "text" : "password";
      eye.innerHTML = reveal ? EYE_OFF_SVG : EYE_SVG;
      eye.setAttribute("aria-label", reveal ? t().hideKey : t().showKey);
      eye.setAttribute("aria-pressed", String(reveal));
    };

    keyRow.append(key, eye);

    const modelLabel = document.createElement("label");
    modelLabel.className = "field-sub-label";
    modelLabel.textContent = t().customModelLabel;

    const model = document.createElement("input");
    model.type = "text";
    model.dataset.modelPid = p.id;
    model.placeholder = p.models?.[0] || t().customModel;
    model.value = state.modelPrefs[p.id] || "";
    model.spellcheck = false;

    const hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = t().modelOverrideHint;

    field.append(head, keyRow, modelLabel, model, hint);
    wrap.appendChild(field);
  }

  $("overlay").classList.add("open");
  $("overlay").setAttribute("aria-hidden", "false");
  const first = wrap.querySelector("input");
  if (first) setTimeout(() => first.focus(), 20);
}

function closeSettings() {
  if ($("overlay").contains(document.activeElement)) {
    $("settingsBtn").focus({ preventScroll: true });
  }
  $("overlay").classList.remove("open");
  $("overlay").setAttribute("aria-hidden", "true");
}

function saveSettings() {
  document.querySelectorAll("[data-key-pid]").forEach((input) => {
    const pid = input.dataset.keyPid;
    const value = input.value.trim();
    if (value) state.keys[pid] = value;
    else delete state.keys[pid];
  });

  document.querySelectorAll("[data-model-pid]").forEach((input) => {
    const pid = input.dataset.modelPid;
    const value = input.value.trim();
    if (value) state.modelPrefs[pid] = value;
    else delete state.modelPrefs[pid];
  });

  localStorage.setItem(LS.keys, JSON.stringify(state.keys));
  localStorage.setItem(LS.models, JSON.stringify(state.modelPrefs));
  closeSettings();
  renderApp();
  showToast(t().saved);
}

// ---------- events ----------
function wireEvents() {
  const input = $("input");
  input.addEventListener("input", () => {
    autosize();
    updateSendBtn();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  $("sendBtn").onclick = () => state.streaming ? stopStreaming() : send();
  $("modeBtn").onclick = () => {
    state.mode = state.mode === "dark" ? "light" : "dark";
    localStorage.setItem(LS.mode, state.mode);
    applyTheme();
  };
  $("langSel").onchange = (e) => {
    state.lang = e.target.value;
    localStorage.setItem(LS.lang, state.lang);
    renderApp();
  };
  $("modelSel").onchange = (e) => {
    state.modelPrefs[state.provider] = e.target.value.trim();
    localStorage.setItem(LS.models, JSON.stringify(state.modelPrefs));
    renderProviderPanel();
  };
  $("settingsBtn").onclick = openSettings;
  $("providerAction").onclick = openSettings;
  $("mCancel").onclick = closeSettings;
  $("mClose").onclick = closeSettings;
  $("mSave").onclick = saveSettings;
  $("overlay").onclick = (e) => { if (e.target === $("overlay")) closeSettings(); };
  $("clearBtn").onclick = clearChat;
  $("newChatBtn").onclick = clearChat;
  $("mClearAll").onclick = clearAllData;
  $("noticeDismiss").onclick = () => {
    localStorage.setItem(LS.relayNotice, "1");
    $("noticeBar").hidden = true;
  };

  // Toast stays while hovered; dismissal resumes on leave.
  const toast = $("toast");
  toast.addEventListener("mouseenter", () => {
    state.toastHover = true;
    clearTimeout(state.toastTimer);
  });
  toast.addEventListener("mouseleave", () => {
    state.toastHover = false;
    if (toast.classList.contains("open")) armToastTimer(1600);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("overlay").classList.contains("open")) closeSettings();
  });
}

function maybeShowRelayNotice() {
  if (localStorage.getItem(LS.relayNotice)) return;
  if (!state.apiOnline) return;
  if (!state.providers.some((p) => p.relayCapable && p.serverReady)) return;
  $("noticeText").textContent = t().relayNoticeBar;
  $("noticeBar").hidden = false;
}

function clearAllData() {
  if (!confirm(t().confirmClearAll)) return;
  const doomed = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("aimirror.")) doomed.push(k);
  }
  for (const k of doomed) localStorage.removeItem(k);
  location.reload();
}

function clearChat() {
  if (state.streaming) {
    showToast(t().waitForStream);
    return;
  }
  if (curHistory().length && !confirm(t().confirmClear)) return;
  setHistory([]);
  renderThread();
  focusComposer();
}

function usePrompt(prompt) {
  $("input").value = prompt;
  autosize();
  updateSendBtn();
  focusComposer();
}

function focusComposer() {
  $("input").focus();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("open");
  armToastTimer(4000);
}

function armToastTimer(ms) {
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    if (state.toastHover) return; // re-armed on mouseleave
    $("toast").classList.remove("open");
  }, ms);
}

// ---------- formatting helpers ----------
// Hand-rolled, escape-first markdown. Fenced code blocks are split out first
// (their content is escaped verbatim); everything else goes through the block
// parser. Block markers are recognized on the RAW line, then the content is
// escaped via inlineFormat before any HTML is assembled — so user/model text
// can never inject markup.
function formatContent(text) {
  if (!text) return "";
  const chunks = String(text).split("```");
  return chunks.map((chunk, index) => {
    if (index % 2 === 1) {
      const normalized = chunk.replace(/^\n/, "").replace(/\n$/, "");
      const lines = normalized.split("\n");
      const maybeLang = lines[0] && /^[A-Za-z0-9_-]{1,20}$/.test(lines[0]) ? lines.shift() : "";
      const code = escapeHTML(lines.join("\n"));
      const lang = maybeLang ? `<div class="code-lang">${escapeHTML(maybeLang)}</div>` : "";
      return `<pre>${lang}<code>${code}</code></pre>`;
    }
    return blockFormat(chunk);
  }).join("");
}

function blockFormat(text) {
  const out = [];
  let para = [];   // pending paragraph lines (already inline-formatted)
  let quote = [];  // pending blockquote lines (already inline-formatted)
  let list = null; // { tag: "ul"|"ol", items: [] }

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
    para = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${quote.join("<br>")}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushAll = () => { flushPara(); flushQuote(); flushList(); };

  for (const line of String(text).split("\n")) {
    let m;
    if (/^\s*$/.test(line)) {
      flushAll();
      continue;
    }
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flushAll();
      const level = m[1].length;
      out.push(`<h${level}>${inlineFormat(m[2])}</h${level}>`);
      continue;
    }
    if (/^\s{0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushAll();
      out.push("<hr>");
      continue;
    }
    if ((m = line.match(/^\s{0,3}>\s?(.*)$/))) {
      flushPara();
      flushList();
      quote.push(inlineFormat(m[1]));
      continue;
    }
    if ((m = line.match(/^\s{0,3}[-*+]\s+(.+)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== "ul") { flushList(); list = { tag: "ul", items: [] }; }
      list.items.push(inlineFormat(m[1]));
      continue;
    }
    if ((m = line.match(/^\s{0,3}\d{1,3}[.)]\s+(.+)$/))) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== "ol") { flushList(); list = { tag: "ol", items: [] }; }
      list.items.push(inlineFormat(m[1]));
      continue;
    }
    flushQuote();
    flushList();
    para.push(inlineFormat(line));
  }
  flushAll();
  return out.join("");
}

// Escapes FIRST, then layers inline markup on the escaped text. Replacement
// payloads only wrap already-escaped capture groups, so ordering is safe:
// links (needs literal ] and parens) → inline code → bold.
function inlineFormat(text) {
  return escapeHTML(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("copy failed");
}

function readJSON(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

// ---------- static icons (trusted markup only) ----------
const EYE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// ---------- brand visuals ----------
const BRAND_COLOR = {
  openai: "#10a37f",
  gemini: "#4285f4",
  claude: "#d97757",
  deepseek: "#4d6bfe",
  qwen: "#615ced",
  glm: "#1f9c6b",
  kimi: "#6b4eff",
  minimax: "#f23c5d",
  doubao: "#0a84ff",
  ernie: "#2932e1",
  huggingface: "#ffb000",
};

const BRAND_GLYPH = {
  openai: "AI",
  gemini: "G",
  claude: "C",
  deepseek: "D",
  qwen: "Q",
  glm: "Z",
  kimi: "K",
  minimax: "M",
  doubao: "豆",
  ernie: "文",
  huggingface: "HF",
};

const FALLBACK_PROVIDERS = [
  { id: "openai", label: "ChatGPT", models: ["gpt-4o", "gpt-4o-mini", "o4-mini"], freeTier: false, serverReady: false },
  { id: "gemini", label: "Gemini", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"], freeTier: true, serverReady: false },
  { id: "claude", label: "Claude", models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"], freeTier: false, serverReady: false },
  { id: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"], freeTier: false, serverReady: false },
  { id: "qwen", label: "Qwen", models: ["qwen-max", "qwen-plus", "qwen-turbo"], freeTier: true, serverReady: false },
  { id: "glm", label: "GLM", models: ["glm-4-plus", "glm-4-air", "glm-4-flash"], freeTier: true, serverReady: false },
  { id: "kimi", label: "Kimi", models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"], freeTier: false, serverReady: false },
  { id: "minimax", label: "MiniMax", models: ["MiniMax-Text-01", "abab6.5s-chat"], freeTier: false, serverReady: false },
  { id: "doubao", label: "Doubao", models: ["doubao-pro-32k", "doubao-lite-32k"], freeTier: false, serverReady: false },
  { id: "ernie", label: "ERNIE", models: ["ernie-4.0-turbo-8k", "ernie-speed-128k", "ernie-lite-8k"], freeTier: true, serverReady: false },
  { id: "huggingface", label: "Hugging Face", models: ["openai/gpt-oss-120b:fastest", "openai/gpt-oss-20b:fastest", "deepseek-ai/DeepSeek-R1:fastest"], freeTier: false, serverReady: false },
];
