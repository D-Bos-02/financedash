import { describe, expect, it } from "vitest";
import { ANTHROPIC_MODEL, resolveChatProvider } from "@/lib/chat/provider";

describe("resolveChatProvider", () => {
  it("is off without any provider", () => {
    expect(resolveChatProvider({}).ok).toBe(false);
  });

  it("keeps the original Anthropic setup working with just a key", () => {
    expect(resolveChatProvider({ ANTHROPIC_API_KEY: "k" })).toEqual({ ok: true, provider: { kind: "anthropic", label: "Anthropic", model: ANTHROPIC_MODEL } });
  });

  it("picks a provider from whichever key is set, but needs a model for non-Anthropic ones", () => {
    const missing = resolveChatProvider({ OPENAI_API_KEY: "k" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toContain("LLM_MODEL");
    expect(resolveChatProvider({ OPENAI_API_KEY: "k", LLM_MODEL: "m" })).toMatchObject({
      ok: true, provider: { kind: "openai", id: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "k", model: "m" },
    });
  });

  it("uses LLM_PROVIDER over whatever keys happen to be set", () => {
    const gemini = resolveChatProvider({ LLM_PROVIDER: "Gemini", GEMINI_API_KEY: "g", ANTHROPIC_API_KEY: "a", LLM_MODEL: "m" });
    expect(gemini).toMatchObject({ ok: true, provider: { id: "gemini", apiKey: "g" } });
  });

  it("runs local models without a key", () => {
    expect(resolveChatProvider({ LLM_PROVIDER: "ollama", LLM_MODEL: "m" })).toMatchObject({
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
    expect(unknown.ok || unknown.reason).toContain("Unknown LLM_PROVIDER");
  });
});
