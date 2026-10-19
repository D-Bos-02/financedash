// Which AI provider the chat assistant uses, from .env. Anthropic is called through its own API; every
// other provider through the OpenAI-compatible chat completions API that OpenAI, Gemini, OpenRouter,
// Ollama and LM Studio all offer. Pure, so it can be tested and shown in the UI.

export type ChatProvider =
  | { kind: "anthropic"; label: string; model: string }
  | { kind: "openai"; id: string; label: string; model: string; baseUrl: string; apiKey: string | null };

export type ProviderSetup = { ok: true; provider: ChatProvider } | { ok: false; reason: string };

// Default Anthropic model. Other providers need LLM_MODEL, since model names change too often to guess.
export const ANTHROPIC_MODEL = "claude-opus-5-5";

const PRESETS: Record<string, { label: string; baseUrl: string; keyVar: string | null }> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", keyVar: "OPENAI_API_KEY" },
  gemini: { label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", keyVar: "GEMINI_API_KEY" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY" },
  ollama: { label: "Ollama (on this computer)", baseUrl: "http://127.0.0.1:11434/v1", keyVar: null },
  lmstudio: { label: "LM Studio (on this computer)", baseUrl: "http://127.0.0.1:1234/v1", keyVar: null },
  custom: { label: "OpenAI-compatible", baseUrl: "", keyVar: "LLM_API_KEY" },
};

export const PROVIDER_IDS = ["anthropic", ...Object.keys(PRESETS)];

type Env = Record<string, string | undefined>;
const val = (env: Env, key: string) => env[key]?.trim() || undefined;

export function resolveChatProvider(env: Env): ProviderSetup {
  // Without LLM_PROVIDER, use whichever key is set, checking Anthropic first (the original setup).
  const requested = val(env, "LLM_PROVIDER")?.toLowerCase();
  const id = requested
    ?? (val(env, "ANTHROPIC_API_KEY") ? "anthropic"
      : val(env, "OPENAI_API_KEY") ? "openai"
      : val(env, "GEMINI_API_KEY") ? "gemini"
      : val(env, "OPENROUTER_API_KEY") ? "openrouter"
      : undefined);
  if (!id) return { ok: false, reason: "No AI provider is set up." };
  const model = val(env, "LLM_MODEL");

  if (id === "anthropic") {
    if (!val(env, "ANTHROPIC_API_KEY")) return { ok: false, reason: "LLM_PROVIDER is anthropic but ANTHROPIC_API_KEY is empty." };
    return { ok: true, provider: { kind: "anthropic", label: "Anthropic", model: model ?? ANTHROPIC_MODEL } };
  }

  const preset = PRESETS[id];
  if (!preset) return { ok: false, reason: `Unknown LLM_PROVIDER "${requested}". Use one of: ${PROVIDER_IDS.join(", ")}.` };
  const baseUrl = (val(env, "LLM_BASE_URL") ?? preset.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, reason: "LLM_PROVIDER is custom, so LLM_BASE_URL is needed (the address ending in /v1)." };
  // A key may be optional for local servers; LLM_API_KEY works for any provider.
  const apiKey = (preset.keyVar ? val(env, preset.keyVar) : undefined) ?? val(env, "LLM_API_KEY") ?? null;
  if (preset.keyVar && preset.keyVar !== "LLM_API_KEY" && !apiKey) return { ok: false, reason: `${preset.label} needs ${preset.keyVar} in .env.` };
  if (!model) return { ok: false, reason: `Set LLM_MODEL in .env to the ${preset.label} model to use (its name as the provider lists it).` };
  return { ok: true, provider: { kind: "openai", id, label: preset.label, model, baseUrl, apiKey } };
}

// What the chat page shows about the provider in use; never includes keys.
export function describeProvider(p: ChatProvider): string {
  return `${p.label} · ${p.model}`;
}

// Conversations remember which provider wrote them, since each stores its transcript in its own format.
export function transcriptFormat(p: ChatProvider): "anthropic" | "openai" {
  return p.kind;
}
