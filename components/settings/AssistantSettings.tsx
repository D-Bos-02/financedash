"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ProviderOption, SavedChoice } from "@/lib/chat/provider";

interface AssistantState {
  providers: ProviderOption[];
  saved: SavedChoice;
  current: { name: string; source: "settings" | "env" | "auto" } | null;
  reason: string | null;
}

type Models = { status: "idle" | "loading" } | { status: "ok"; models: string[] } | { status: "error"; error: string };

const field = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-violet-500 disabled:opacity-60";
const OTHER = "__other__";

async function fetchState(): Promise<AssistantState> {
  return fetch("/api/assistant").then((r) => r.json());
}

async function fetchModels(provider: string): Promise<Models> {
  const res = await fetch(`/api/assistant/models?provider=${encodeURIComponent(provider)}`);
  const body = await res.json().catch(() => ({}));
  return res.ok ? { status: "ok", models: body.models ?? [] } : { status: "error", error: body.error ?? `Request failed (${res.status})` };
}

// Pick which AI provider and model the chat assistant uses. Keys stay in .env; only the choice is saved.
export function AssistantSettings() {
  const [state, setState] = useState<AssistantState | null>(null);
  const [provider, setProvider] = useState(""); // "" = automatic, from .env
  const [model, setModel] = useState("");
  const [typing, setTyping] = useState(false); // typing a model name the list doesn't have
  const [models, setModels] = useState<Models>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // State is set when the data arrives, not during the effect itself.
  useEffect(() => {
    fetchState().then(async (s) => {
      setState(s);
      setProvider(s.saved.provider ?? "");
      setModel(s.saved.model ?? "");
      if (s.saved.provider) {
        const m = await fetchModels(s.saved.provider);
        setModels(m);
        setTyping(Boolean(s.saved.model) && m.status === "ok" && !m.models.includes(s.saved.model!));
      }
    });
  }, []);

  async function chooseProvider(id: string) {
    setProvider(id);
    setModel("");
    setTyping(false);
    setSaved(false);
    if (!id) return setModels({ status: "idle" });
    setModels({ status: "loading" });
    setModels(await fetchModels(id));
  }

  // After keys are added to .env (picked up automatically with npm run dev).
  async function recheck() {
    const s = await fetchState();
    setState(s);
    if (provider) setModels(await fetchModels(provider));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/assistant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider || null, model: model.trim() || null }),
    });
    if (res.ok) {
      setState(await res.json());
      setSaved(true);
    }
    setSaving(false);
  }

  if (!state) return null;
  const option = state.providers.find((p) => p.id === provider);
  const anthropic = provider === "anthropic";
  const list = models.status === "ok" ? models.models : [];
  const changed = (provider || null) !== state.saved.provider || (model.trim() || null) !== state.saved.model;
  // Every provider but Anthropic needs a model; Anthropic falls back to the app's default.
  const canSave = !provider || anthropic || Boolean(model.trim());

  return (
    <Card id="assistant" className="scroll-mt-6">
      <CardHeader>
        <CardTitle>AI assistant</CardTitle>
        <button type="button" onClick={recheck} className="text-xs text-violet-400 hover:text-violet-300">Check keys again</button>
      </CardHeader>
      <div className="space-y-4">
        <div className={`rounded-lg px-3 py-2 text-sm ${state.current ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300"}`}>
          {state.current ? (
            <>Chat is using <span className="font-medium">{state.current.name}</span>
              {state.current.source === "env" && " (from .env)"}{state.current.source === "auto" && " (the first key found in .env)"}.</>
          ) : (
            state.reason
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs text-zinc-400 mb-1">Provider</span>
            <select value={provider} onChange={(e) => chooseProvider(e.target.value)} className={field}>
              <option value="">Automatic (from .env)</option>
              {state.providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.ready}>
                  {p.label}{p.needs ? ` (add ${p.needs} to .env)` : ""}
                </option>
              ))}
            </select>
          </label>

          {provider && (
            <label className="block">
              <span className="block text-xs text-zinc-400 mb-1">Model</span>
              {typing || models.status === "error" ? (
                <input
                  value={model}
                  onChange={(e) => { setModel(e.target.value); setSaved(false); }}
                  placeholder={anthropic ? "Leave empty for the app's default" : "The model's name, as the provider lists it"}
                  className={field}
                  spellCheck={false}
                />
              ) : (
                <select
                  value={model}
                  disabled={models.status === "loading"}
                  onChange={(e) => {
                    if (e.target.value === OTHER) setTyping(true);
                    else setModel(e.target.value);
                    setSaved(false);
                  }}
                  className={field}
                >
                  <option value="">{models.status === "loading" ? "Loading models…" : anthropic ? "App default" : "Choose a model"}</option>
                  {list.map((m) => <option key={m} value={m}>{m}</option>)}
                  <option value={OTHER}>Other (type a name)…</option>
                </select>
              )}
              {models.status === "error" && <span className="block text-[11px] text-amber-400 mt-1">{models.error} Type the model name instead.</span>}
            </label>
          )}
        </div>

        {option && !option.local && provider !== "anthropic" && (
          <p className="text-[11px] text-zinc-500">Pick a model that supports tool (function) calling; the assistant needs it to read your data.</p>
        )}
        {option?.local && (
          <p className="text-[11px] text-zinc-500">Runs on this computer, so nothing is sent anywhere. Smaller local models often can&apos;t use tools; pick a larger one if answers come back without your numbers.</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={saving || !changed || !canSave}>{saving ? "Saving…" : "Save"}</Button>
          {saved && !changed && <span className="text-xs text-emerald-400">Saved</span>}
        </div>
        <p className="text-xs text-zinc-500">
          API keys stay in <code className="text-zinc-400">.env</code> and are never shown here. Switching between Anthropic and another
          provider starts fresh chats; older ones stay readable. The figures the assistant needs are sent to the provider you choose (except with Ollama or LM Studio).
        </p>
      </div>
    </Card>
  );
}
