"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ProviderOption, SavedChoice } from "@/lib/chat/provider";
import type { TranscriptFormat } from "@/lib/chat/types";

export interface AssistantState {
  providers: ProviderOption[];
  saved: SavedChoice;
  current: { name: string; source: "settings" | "env" | "auto"; format: TranscriptFormat } | null;
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

// Choose the AI provider and model from the chat page. Keys stay in .env; only the choice is saved.
// `inline` shows the form straight away (when nothing is set up); otherwise it opens from a button.
export function ModelPicker({ label, inline = false, disabled = false, onSaved }: {
  label: string | null; // what's in use now, e.g. "Google Gemini · gemini-flash-latest"
  inline?: boolean;
  disabled?: boolean;
  onSaved: (state: AssistantState) => void;
}) {
  const [open, setOpen] = useState(inline);
  const [state, setState] = useState<AssistantState | null>(null);
  const [provider, setProvider] = useState(""); // "" = automatic, from .env
  const [model, setModel] = useState("");
  const [typing, setTyping] = useState(false); // typing a model name the list doesn't have
  const [models, setModels] = useState<Models>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  // Load the options whenever the form opens. State is set when the data arrives, not during the effect.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetchState().then(async (s) => {
      if (!alive) return;
      setState(s);
      setProvider(s.saved.provider ?? "");
      setModel(s.saved.model ?? "");
      setTyping(false);
      if (s.saved.provider) {
        setModels({ status: "loading" });
        const m = await fetchModels(s.saved.provider);
        if (!alive) return;
        setModels(m);
        setTyping(Boolean(s.saved.model) && m.status === "ok" && !m.models.includes(s.saved.model!));
      } else {
        setModels({ status: "idle" });
      }
    });
    return () => { alive = false; };
  }, [open]);

  // Close the popover on Escape or a click outside it.
  useEffect(() => {
    if (!open || inline) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => panel.current && !panel.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, inline]);

  async function chooseProvider(id: string) {
    setProvider(id);
    setModel("");
    setTyping(false);
    if (!id) return setModels({ status: "idle" });
    setModels({ status: "loading" });
    setModels(await fetchModels(id));
  }

  // After keys are added to .env (picked up automatically with npm run dev).
  async function recheck() {
    setState(await fetchState());
    if (provider) setModels(await fetchModels(provider));
  }

  async function save() {
    setSaving(true);
    const res = await fetch("/api/assistant", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider || null, model: model.trim() || null }),
    });
    setSaving(false);
    if (!res.ok) return;
    const next: AssistantState = await res.json();
    setState(next);
    if (!inline) setOpen(false);
    onSaved(next);
  }

  const option = state?.providers.find((p) => p.id === provider);
  const anthropic = provider === "anthropic";
  const list = models.status === "ok" ? models.models : [];
  const changed = state ? (provider || null) !== state.saved.provider || (model.trim() || null) !== state.saved.model : false;
  // Every provider but Anthropic needs a model; Anthropic falls back to the app's default.
  const canSave = !provider || anthropic || Boolean(model.trim());

  const form = state && (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="block text-xs text-zinc-400 mb-1">Provider</span>
          <select value={provider} onChange={(e) => chooseProvider(e.target.value)} className={field} aria-label="AI provider">
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
                onChange={(e) => setModel(e.target.value)}
                placeholder={anthropic ? "Leave empty for the app's default" : "The model's name, as the provider lists it"}
                className={field}
                spellCheck={false}
                aria-label="Model"
              />
            ) : (
              <select
                value={model}
                disabled={models.status === "loading"}
                onChange={(e) => (e.target.value === OTHER ? setTyping(true) : setModel(e.target.value))}
                className={field}
                aria-label="Model"
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
      {option && !option.local && !anthropic && (
        <p className="text-[11px] text-zinc-500">Pick a model that supports tool (function) calling; the assistant needs it to read your data.</p>
      )}
      {option?.local && (
        <p className="text-[11px] text-zinc-500">Runs on this computer, so nothing is sent anywhere. Smaller local models often can&apos;t use tools; pick a larger one if answers come back without your numbers.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={save} disabled={saving || !changed || !canSave}>{saving ? "Saving…" : "Use this"}</Button>
        {!inline && <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}
        <button type="button" onClick={recheck} className="text-xs text-violet-400 hover:text-violet-300">Check keys again</button>
      </div>
      <p className="text-[11px] text-zinc-500">
        API keys stay in <code className="text-zinc-400">.env</code> and are never shown here. The figures the assistant needs are sent to the
        provider you choose, except with Ollama or LM Studio.
      </p>
    </div>
  );

  if (inline) return form ?? <p className="text-xs text-zinc-500">Loading…</p>;

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-700 disabled:opacity-50"
      >
        <span className="truncate max-w-[16rem]">{label ?? "Choose a model"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-zinc-500"><path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" /></svg>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          {form ?? <p className="text-xs text-zinc-500">Loading…</p>}
        </div>
      )}
    </div>
  );
}
