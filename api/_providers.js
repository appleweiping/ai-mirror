// ai-mirror — provider registry (server-side, ESM, used by edge functions).
//
// Architecture: nearly every model speaks an OpenAI-compatible protocol, so we
// keep ONE registry mapping each provider to its base URL + model IDs + the env
// var holding the operator key. Only Anthropic uses its own /v1/messages shape;
// we translate to/from OpenAI shape so the frontend always speaks one language.
//
// Auth resolution order (per request): user BYOK key (header) → operator env
// key → optional relay. A provider is "usable" if any of these is present.

export const PROVIDERS = {
  openai: {
    label: "ChatGPT",
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    envKey: "OPENAI_API_KEY",
    relayCapable: true,
    models: ["gpt-4o", "gpt-4o-mini", "o4-mini"],
  },
  gemini: {
    label: "Gemini",
    protocol: "openai", // Google's OpenAI-compatible endpoint
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envKey: "GEMINI_API_KEY",
    relayCapable: false,
    freeTier: true, // Google AI Studio offers a genuine free tier
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
  },
  claude: {
    label: "Claude",
    protocol: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    envKey: "ANTHROPIC_API_KEY",
    relayCapable: true,
    models: ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5-20251001"],
  },
  deepseek: {
    label: "DeepSeek",
    protocol: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    envKey: "DEEPSEEK_API_KEY",
    relayCapable: true,
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  qwen: {
    label: "Qwen",
    protocol: "openai",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envKey: "DASHSCOPE_API_KEY",
    relayCapable: true,
    freeTier: true, // DashScope grants free quota to new accounts
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  glm: {
    label: "GLM",
    protocol: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    envKey: "ZHIPU_API_KEY",
    relayCapable: true,
    freeTier: true, // glm-4-flash is free
    models: ["glm-4-plus", "glm-4-air", "glm-4-flash"],
  },
  kimi: {
    label: "Kimi",
    protocol: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    envKey: "MOONSHOT_API_KEY",
    relayCapable: true,
    models: ["moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"],
  },
  minimax: {
    label: "MiniMax",
    protocol: "openai",
    baseUrl: "https://api.minimaxi.com/v1",
    envKey: "MINIMAX_API_KEY",
    relayCapable: true,
    models: ["MiniMax-Text-01", "abab6.5s-chat"],
  },
  doubao: {
    label: "Doubao",
    protocol: "openai",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    envKey: "ARK_API_KEY",
    relayCapable: true,
    // Volcano Ark uses endpoint IDs; users may override the model id in Settings.
    models: ["doubao-pro-32k", "doubao-lite-32k"],
  },
  ernie: {
    label: "ERNIE",
    protocol: "openai",
    baseUrl: "https://qianfan.baidubce.com/v2",
    envKey: "QIANFAN_API_KEY",
    relayCapable: true,
    freeTier: true, // ernie-speed / ernie-lite are free
    models: ["ernie-4.0-turbo-8k", "ernie-speed-128k", "ernie-lite-8k"],
  },
};

// Resolve which key + base URL + protocol to use for a request.
// byokKey: key the user pasted in their browser (forwarded via X-User-Key).
export function resolveAuth(providerId, byokKey, env) {
  const p = PROVIDERS[providerId];
  if (!p) return { error: `unknown provider: ${providerId}` };

  // 1) user's own key wins (BYOK) — always hits the official upstream
  if (byokKey && byokKey.trim()) {
    return { key: byokKey.trim(), baseUrl: p.baseUrl, protocol: p.protocol, source: "byok" };
  }
  // 2) operator's official key from env
  const envVal = env[p.envKey];
  if (envVal && envVal.trim()) {
    return { key: envVal.trim(), baseUrl: p.baseUrl, protocol: p.protocol, source: "operator" };
  }
  // 3) optional relay (OpenAI-compatible) for providers that allow it
  if (p.relayCapable && env.RELAY_BASE_URL && env.RELAY_API_KEY) {
    return {
      key: env.RELAY_API_KEY.trim(),
      baseUrl: env.RELAY_BASE_URL.replace(/\/$/, ""),
      protocol: "openai", // relay normalizes everything to OpenAI shape
      source: "relay",
    };
  }
  return { error: "no-auth", needsByok: true };
}

// Which providers are usable without the user typing a key (for the UI badge).
export function serverUsable(providerId, env) {
  const p = PROVIDERS[providerId];
  if (!p) return false;
  if (env[p.envKey] && env[p.envKey].trim()) return true;
  if (p.relayCapable && env.RELAY_BASE_URL && env.RELAY_API_KEY) return true;
  return false;
}
