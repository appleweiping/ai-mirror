// List prices used for the cost estimates, in USD per million tokens, at the
// standard (non-batch) rate. Copied by hand from the pages in SOURCES on the
// date below. Prices change; if a number here looks wrong, the provider's
// page wins. Models not listed show their cost as unknown.

export const PRICES_CHECKED = "2026-10-21";

export const SOURCES = {
  openai: "https://developers.openai.com/api/docs/pricing",
  anthropic: "https://platform.claude.com/docs/en/about-claude/pricing",
  gemini: "https://ai.google.dev/gemini-api/docs/pricing",
  deepseek: "https://api-docs.deepseek.com/quick_start/pricing",
  openrouter: "https://openrouter.ai/api/v1/models",
};

// Key: "<provider>/<model id>".
export const PRICES = {
  "openai/gpt-6-luna": { input: 0.1, output: 0.5 },
  "openai/gpt-6.1-sol": { input: 2, output: 10 },
  "openai/gpt-4.1-mini": { input: 0.4, output: 1.6 },

  "anthropic/claude-haiku-5-5": { input: 0.1, output: 0.5, note: "prompts up to 100k tokens" },
  "anthropic/claude-sonnet-5-5": { input: 2, output: 10 },
  "anthropic/claude-opus-5-5": { input: 4, output: 20 },
  "anthropic/claude-haiku-4-5": { input: 1, output: 5 },

  "gemini/gemini-3.8-flash": { input: 0.75, output: 3.75, note: "until 2026-12-31, then $1.50 / $7.50" },
  "gemini/gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini/gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },

  "deepseek/deepseek-flash": { input: 0.3, output: 1.2, note: "peak rate, cache miss; off-peak is half" },
  "deepseek/deepseek-v4-pro": { input: 1.32, output: 3.96, note: "peak rate, cache miss; off-peak is half" },

  "openrouter/qwen/qwen3.7-plus": { input: 0.32, output: 1.28 },
  "openrouter/z-ai/glm-5.3": { input: 0.079, output: 1.4 },
  "openrouter/moonshotai/kimi-k3": { input: 0.239, output: 11.936 },
  "openrouter/openai/gpt-oss-120b": { input: 0.15, output: 0.6 },
};

// Mistral is left out on purpose: its pricing page did not say which
// versions the *-latest aliases point to, so any number would be a guess.

export function priceFor(provider, model) {
  return PRICES[`${provider}/${model}`] || null;
}
