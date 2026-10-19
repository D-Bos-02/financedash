import { describe, expect, it } from "vitest";
import { ANTHROPIC_MODEL, chatModels, providerOptions, resolveChatProvider } from "@/lib/chat/provider";

describe("resolveChatProvider", () => {
  it("is off without any provider", () => {
    expect(resolveChatProvider({})).toEqual({ ok: false, reason: "No AI provider is set up yet." });
  });

  it("keeps the original Anthropic setup working with just a key", () => {
    expect(resolveChatProvider({ ANTHROPIC_API_KEY: "k" })).toEqual({
      ok: true, source: "auto", provider: { kind: "anthropic", label: "Anthropic", model: ANTHROPIC_MODEL },
    });
  });

  it("picks a provider from whichever key is set, but asks for a model for non-Anthropic ones", () => {
    const missing = resolveChatProvider({ OPENAI_API_KEY: "k" });
    expect(missing.ok || missing.reason).toBe("OpenAI is set up but needs a model. Choose one in Settings › AI assistant.");
    expect(resolveChatProvider({ OPENAI_API_KEY: "k", LLM_MODEL: "m" })).toMatchObject({
      ok: true, source: "auto", provider: { kind: "openai", id: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "m" },
    });
  });

  it("names every provider that has a key but no model", () => {
    const r = resolveChatProvider({ OPENAI_API_KEY: "o", GEMINI_API_KEY: "g" });
    expect(r.ok || r.reason).toBe("OpenAI or Google Gemini are set up but need a model. Choose one in Settings › AI assistant.");
  });

  it("uses LLM_PROVIDER over whatever keys happen to be set", () => {
    const gemini = resolveChatProvider({ LLM_PROVIDER: "Gemini", GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LLM_MODEL: "m" });
    expect(gemini).toMatchObject({ ok: true, source: "env", provider: { id: "gemini", apiKey: "g" } });
  });

  it("uses the choice made in Settings over .env", () => {
    const env = { LLM_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g" };
    expect(resolveChatProvider(env, { provider: "gemini", model: "flash" })).toMatchObject({
      ok: true, source: "settings", provider: { id: "gemini", model: "flash" },
    });
    expect(resolveChatProvider(env, { provider: "anthropic", model: null })).toMatchObject({
      ok: true, source: "settings", provider: { kind: "anthropic", model: ANTHROPIC_MODEL },
    });
  });

  it("falls back when the chosen provider's key has been removed", () => {
    expect(resolveChatProvider({ GEMINI_API_KEY: "g", LLM_MODEL: "m" }, { provider: "anthropic", model: null })).toMatchObject({
      ok: true, source: "auto", provider: { id: "gemini" },
    });
  });

  it("explains a chosen provider that still needs a model", () => {
    const r = resolveChatProvider({ OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "a" }, { provider: "openai", model: null });
    expect(r.ok || r.reason).toContain("OpenAI needs a model");
  });

  it("runs local models without a key", () => {
    expect(resolveChatProvider({}, { provider: "ollama", model: "m" })).toMatchObject({
      ok: true, provider: { id: "ollama", baseUrl: "http://127.0.0.1:11434/v1", apiKey: null },
    });
  });

  it("needs a base URL for a custom server, and trims its trailing slash", () => {
    expect(resolveChatProvider({ LLM_PROVIDER: "custom", LLM_MODEL: "m" }).ok).toBe(false);
    expect(resolveChatProvider({ LLM_PROVIDER: "custom", LLM_MODEL: "m", LLM_BASE_URL: "http://box:8000/v1/" })).toMatchObject({
      ok: true, provider: { baseUrl: "http://box:8000/v1", apiKey: null },
    });
  });

  it("explains a missing key or unknown provider", () => {
    const noKey = resolveChatProvider({ LLM_PROVIDER: "openai", LLM_MODEL: "m" });
    expect(noKey.ok || noKey.reason).toContain("OPENAI_API_KEY");
    const unknown = resolveChatProvider({ LLM_PROVIDER: "skynet" });
    expect(unknown.ok || unknown.reason).toContain("Unknown AI provider");
  });
});

describe("providerOptions", () => {
  it("says which providers are ready and what each still needs, without exposing keys", () => {
    const opts = providerOptions({ GEMINI_API_KEY: "secret" });
    expect(opts.find((o) => o.id === "gemini")).toEqual({ id: "gemini", label: "Google Gemini", ready: true, local: false, needs: null });
    expect(opts.find((o) => o.id === "openai")).toMatchObject({ ready: false, needs: "OPENAI_API_KEY" });
    expect(opts.find((o) => o.id === "ollama")).toMatchObject({ ready: true, local: true });
    expect(opts.find((o) => o.id === "custom")).toMatchObject({ ready: false, needs: "LLM_BASE_URL" });
    expect(JSON.stringify(opts)).not.toContain("secret");
  });
});

describe("chatModels", () => {
  it("keeps chat models, newest-looking first, and drops embedding, image and audio ones", () => {
    expect(chatModels(["models/gemini-flash-latest", "text-embedding-3-small", "gpt-5", "dall-e-3", "gpt-5", "whisper-1", "imagen-4"])).toEqual([
      "gpt-5", "gemini-flash-latest",
    ]);
  });
});
