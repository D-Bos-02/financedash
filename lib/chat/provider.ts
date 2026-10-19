// Which AI provider the chat assistant uses. Anthropic is called through its own API; every other provider
// through the OpenAI-compatible chat completions API that OpenAI, Gemini, OpenRouter, Ollama and LM Studio
// all offer. Keys always come from .env; the provider and model can also be chosen in Settings, which wins.
// Pure, so it can be tested and shown in the UI.

export type ChatProvider =
  | { kind: "anthropic"; label: string; model: string }
  | { kind: "openai"; id: string; label: string; model: string; baseUrl: string; apiKey: string | null };

export type ProviderSetup = { ok: true; provider: ChatProvider; source: "settings" | "env" | "auto" } | { ok: false; reason: string };

// The provider and model chosen in Settings › AI assistant (null = not chosen).
export interface SavedChoice {
  provider: string | null;
  model: string | null;
}

// Default Anthropic model. Other providers need a model chosen, since their names change too often to guess.
export const ANTHROPIC_MODEL = "claude-opus-5-5";

interface Preset {
  label: string;
  baseUrl: string;
  keyVar: string | null; // null: runs on this computer, no key needed
}

const PRESETS: Record<string, Preset> = {
  anthropic: { label: "Anthropic", baseUrl: "", keyVar: "ANTHROPIC_API_KEY" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", keyVar: "OPENAI_API_KEY" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyVar: "GEMINI_API_KEY" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY" },
  ollama: { label: "Ollama (on this computer)", baseUrl: "http://127.0.0.1:11434/v1", keyVar: null },
  lmstudio: { label: "LM Studio (on this computer)", baseUrl: "http://127.0.0.1:1234/v1", keyVar: null },
  custom: { label: "OpenAI-compatible", baseUrl: "", keyVar: "LLM_API_KEY" },
};

export const PROVIDER_IDS = Object.keys(PRESETS);
// Tried in this order when nothing is chosen: the hosted providers whose key is set.
const AUTO_ORDER = ["anthropic", "openai", "gemini", "openrouter"];

type Env = Record<string, string | undefined>;
const val = (env: Env, key: string) => env[key]?.trim() || undefined;

// Where to choose a model, for messages.
const CHOOSE = "Choose one in Settings › AI assistant";

// One provider with an optional model; reports what's missing instead of guessing.
export function buildProvider(env: Env, id: string, model?: string): ProviderSetup {
  const preset = PRESETS[id];
  if (!preset) return { ok: false, reason: `Unknown AI provider "${id}". Use one of: ${PROVIDER_IDS.join(", ")}.` };
  const key = preset.keyVar ? val(env, preset.keyVar) : undefined;

  if (id === "anthropic") {
    if (!key) return { ok: false, reason: "Anthropic needs ANTHROPIC_API_KEY in .env." };
    return { ok: true, source: "auto", provider: { kind: "anthropic", label: preset.label, model: model ?? ANTHROPIC_MODEL } };
  }

  const baseUrl = (id === "custom" ? val(env, "LLM_BASE_URL") : val(env, "LLM_BASE_URL") ?? preset.baseUrl)?.replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, reason: "A custom provider needs LLM_BASE_URL in .env (the address ending in /v1)." };
  // A key may be optional for local servers; LLM_API_KEY works for any provider.
  const apiKey = key ?? val(env, "LLM_API_KEY") ?? null;
  if (preset.keyVar && preset.keyVar !== "LLM_API_KEY" && !apiKey) return { ok: false, reason: `${preset.label} needs ${preset.keyVar} in .env.` };
  if (!model) return { ok: false, reason: `${preset.label} needs a model. ${CHOOSE}, or set LLM_MODEL in .env.` };
  return { ok: true, source: "auto", provider: { kind: "openai", id, label: preset.label, model, baseUrl, apiKey } };
}

// Settings choice first, then LLM_PROVIDER / LLM_MODEL in .env, then the first hosted provider with a key.
export function resolveChatProvider(env: Env, saved: SavedChoice = { provider: null, model: null }): ProviderSetup {
  if (saved.provider) {
    const chosen = buildProvider(env, saved.provider, saved.model ?? undefined);
    // A choice whose key has since been removed falls through, so chat keeps working with what's left.
    if (chosen.ok) return { ...chosen, source: "settings" };
    if (!PRESETS[saved.provider] || !needsMissingKey(env, saved.provider)) return chosen;
  }

  const envModel = val(env, "LLM_MODEL");
  const requested = val(env, "LLM_PROVIDER")?.toLowerCase();
  if (requested) {
    const fromEnv = buildProvider(env, requested, envModel);
    return fromEnv.ok ? { ...fromEnv, source: "env" } : fromEnv;
  }

  const withKeys = AUTO_ORDER.filter((id) => val(env, PRESETS[id].keyVar!));
  for (const id of withKeys) {
    const auto = buildProvider(env, id, envModel);
    if (auto.ok) return auto;
  }
  if (withKeys.length) {
    const labels = withKeys.map((id) => PRESETS[id].label).join(" or ");
    return { ok: false, reason: `${labels} ${withKeys.length > 1 ? "are set up but need" : "is set up but needs"} a model. ${CHOOSE}.` };
  }
  return { ok: false, reason: "No AI provider is set up yet." };
}

function needsMissingKey(env: Env, id: string): boolean {
  const keyVar = PRESETS[id].keyVar;
  return Boolean(keyVar && keyVar !== "LLM_API_KEY" && !val(env, keyVar));
}

// Every provider, with whether it can be used now, for the Settings picker. Never includes keys.
export interface ProviderOption {
  id: string;
  label: string;
  ready: boolean; // key present, or nothing needed (local)
  local: boolean;
  needs: string | null; // what to add to .env to use it
}

export function providerOptions(env: Env): ProviderOption[] {
  return PROVIDER_IDS.map((id) => {
    const p = PRESETS[id];
    const local = p.keyVar === null;
    const needs = id === "custom" ? (val(env, "LLM_BASE_URL") ? null : "LLM_BASE_URL") : p.keyVar && !val(env, p.keyVar) ? p.keyVar : null;
    return { id, label: p.label, ready: needs === null, local, needs };
  });
}

// Model names worth offering for chat: leaves out embedding, image, audio and similar models.
const NOT_CHAT = /(embed|tts|whisper|dall-e|image|audio|realtime|transcri|moderation|search|babbage|davinci|aqa|imagen|veo|sora|lyria|robotics|computer-use|banana|guard)/i;
export function chatModels(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.replace(/^models\//, "")))].filter((id) => !NOT_CHAT.test(id)).sort().reverse();
}

// What the chat page shows about the provider in use; never includes keys.
export function describeProvider(p: ChatProvider): string {
  return `${p.label} · ${p.model}`;
}

// Conversations remember which provider wrote them, since each stores its transcript in its own format.
export function transcriptFormat(p: ChatProvider): "anthropic" | "openai" {
  return p.kind;
}
