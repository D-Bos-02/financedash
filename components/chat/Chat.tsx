"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/Button";
import { ChatEvent, ChatMessage, WEEKLY_CHECKIN_PROMPT } from "@/lib/chat/types";
import { Turn, transcriptToTurns } from "@/lib/chat/transcript";

const TOOL_LABELS: Record<string, string> = {
  get_accounts: "Checking balances",
  get_holdings: "Reading holdings",
  get_spending: "Adding up spending",
  search_transactions: "Searching transactions",
  get_monthly_actuals: "Reading monthly actuals",
  get_plan: "Reading the plan",
  get_goals: "Checking goals",
  run_home_plan: "Running the home plan",
  project_portfolio: "Projecting the portfolio",
  get_weekly_checkin: "Gathering this week's numbers",
};

const STARTERS = [
  "Are we on track for our goals?",
  "What did we spend on eating out last month?",
  "How has our net worth changed this year?",
  "Where is most of our money going this month?",
];

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

const markdown =
  "text-sm leading-relaxed text-zinc-200 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_li]:my-0.5 [&_strong]:text-zinc-50 [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h2]:mt-3 [&_h3]:mt-3 " +
  "[&_table]:my-3 [&_table]:w-full [&_table]:text-xs [&_th]:text-left [&_th]:font-medium [&_th]:text-zinc-400 [&_th]:pb-1.5 [&_th]:pr-3 " +
  "[&_td]:py-1.5 [&_td]:pr-3 [&_td]:border-t [&_td]:border-zinc-800 [&_td]:tabular-nums [&_code]:text-violet-300 [&_a]:text-violet-400";

function shortDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function History({ conversations, activeId, onDelete }: { conversations: ConversationSummary[]; activeId: string | null; onDelete: (id: string) => void }) {
  if (!conversations.length) return <p className="text-xs text-zinc-600 px-2">Past chats will appear here.</p>;
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => (
        <li key={c.id} className="group flex items-center">
          <Link
            href={`/chat?id=${c.id}`}
            className={`flex-1 min-w-0 rounded-md px-2 py-1.5 text-sm transition-colors ${
              c.id === activeId ? "bg-violet-600/20 text-violet-300" : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            }`}
          >
            <span className="block truncate">{c.title}</span>
            <span className="block text-[10px] text-zinc-600" suppressHydrationWarning>{shortDate(c.updatedAt)}</span>
          </Link>
          <button
            aria-label={`Delete "${c.title}"`}
            onClick={() => onDelete(c.id)}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 px-2 text-zinc-600 hover:text-red-400 transition-opacity"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Chat({
  assistant,
  continuable,
  autoCheckin,
  conversations: initialConversations,
  initial,
}: {
  assistant: { ok: true; name: string } | { ok: false; reason: string }; // the provider in use, or why there isn't one
  continuable: boolean; // false when the open chat was written by a different provider
  autoCheckin: boolean;
  conversations: ConversationSummary[];
  initial: { id: string; messages: ChatMessage[] } | null;
}) {
  const configured = assistant.ok && continuable;
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(initial?.id ?? null);
  const [conversations, setConversations] = useState(initialConversations);
  const [history, setHistory] = useState<ChatMessage[]>(initial?.messages ?? []);
  const [turns, setTurns] = useState<Turn[]>(() => transcriptToTurns(initial?.messages ?? []));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const autoStarted = useRef(false);

  function patchLast(fn: (t: Turn) => Turn) {
    setTurns((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);
  }

  async function refreshConversations() {
    const res = await fetch("/api/chat/conversations").catch(() => null);
    if (res?.ok) setConversations(await res.json());
  }

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", text: question, tools: [] }, { role: "assistant", text: "", tools: [] }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...history, { role: "user", content: question }], conversationId }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        patchLast((t) => ({ ...t, error: body.error ?? `Request failed (${res.status})` }));
        return;
      }

      // Newline-delimited JSON events; a line can span chunks.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "text") patchLast((t) => ({ ...t, text: t.text + event.text }));
          else if (event.type === "tool") patchLast((t) => ({ ...t, tools: [...t.tools, event.name] }));
          else if (event.type === "error") patchLast((t) => ({ ...t, error: event.message }));
          else if (event.type === "done") {
            setHistory(event.messages);
            patchLast((t) => ({ ...t, cost: event.costUsd ?? undefined }));
            if (event.conversationId) {
              setConversationId(event.conversationId);
              // Give the chat its own link without reloading the page.
              window.history.replaceState(null, "", `/chat?id=${event.conversationId}`);
            }
            refreshConversations();
          }
        }
      }
    } catch {
      patchLast((t) => ({ ...t, error: "Lost the connection. Try again." }));
    } finally {
      setBusy(false);
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm("Delete this chat?")) return;
    await fetch(`/api/chat/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) router.push("/chat");
  }

  // Dashboard's "Weekly check-in" link opens /chat?checkin=1 and starts it straight away.
  useEffect(() => {
    if (!autoCheckin || !configured || autoStarted.current) return;
    autoStarted.current = true;
    window.history.replaceState(null, "", "/chat");
    queueMicrotask(() => send(WEEKLY_CHECKIN_PROMPT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (turns.length) bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto lg:grid lg:grid-cols-[200px_1fr] lg:gap-8 min-h-full">
      <aside className="hidden lg:block">
        <div className="sticky top-6 space-y-3">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => router.push("/chat")} disabled={busy}>
            + New chat
          </Button>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide px-2">History</p>
          <div className="max-h-[70vh] overflow-y-auto">
            <History conversations={conversations} activeId={conversationId} onDelete={deleteConversation} />
          </div>
        </div>
      </aside>

      <div className="flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Chat</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Ask about your money. Answers use your live accounts and plan.
              {assistant.ok && (
                <span className="text-zinc-600">
                  {" "}· {assistant.name} · <Link href="/settings#assistant" className="text-violet-400/80 hover:text-violet-300">Change</Link>
                </span>
              )}
            </p>
          </div>
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => router.push("/chat")} disabled={busy} className="lg:hidden">New chat</Button>
          )}
        </div>

        {conversations.length > 0 && (
          <details className="lg:hidden mb-4 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
            <summary className="text-sm text-zinc-400 cursor-pointer">Past chats ({conversations.length})</summary>
            <div className="mt-2">
              <History conversations={conversations} activeId={conversationId} onDelete={deleteConversation} />
            </div>
          </details>
        )}

        {!assistant.ok && (
          <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 mb-4 space-y-1">
            <p>{assistant.reason}</p>
            <p className="text-amber-300/80">
              Chat works with Anthropic, OpenAI, Google Gemini, OpenRouter, or a model on this computer (Ollama, LM Studio).
              Add a key to <code className="text-amber-200">.env</code> (see the AI assistant section of <code className="text-amber-200">.env.example</code>),
              then pick the provider and model in <Link href="/settings#assistant" className="underline hover:text-amber-200">Settings › AI assistant</Link>.
            </p>
          </div>
        )}
        {assistant.ok && !continuable && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400 mb-4">
            This chat was started with a different AI provider, so it can be read but not continued. Start a new chat to ask more.
          </div>
        )}

        <div className="flex-1 space-y-5">
          {turns.length === 0 && (
            <div className="space-y-3">
              <button
                onClick={() => send(WEEKLY_CHECKIN_PROMPT)}
                disabled={!configured || busy}
                className="w-full text-left rounded-xl border border-violet-800/60 bg-violet-600/10 px-4 py-3 hover:bg-violet-600/20 disabled:opacity-50 transition-colors"
              >
                <p className="text-sm font-medium text-violet-300">Weekly check-in</p>
                <p className="text-xs text-zinc-400 mt-0.5">Net worth change, spending vs budget, and your goals vs plan</p>
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    disabled={!configured || busy}
                    className="text-left rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-300 hover:border-zinc-700 disabled:opacity-50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((turn, i) =>
            turn.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-violet-600/20 px-4 py-2 text-sm text-zinc-100 whitespace-pre-wrap">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className="space-y-2">
                {turn.tools.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {[...new Set(turn.tools)].map((name) => (
                      <span key={name} className="text-[11px] rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-400">
                        {TOOL_LABELS[name] ?? name}
                      </span>
                    ))}
                  </div>
                )}
                {turn.text ? (
                  <div className={markdown}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{turn.text}</ReactMarkdown>
                  </div>
                ) : (
                  !turn.error && busy && i === turns.length - 1 && <p className="text-sm text-zinc-500 animate-pulse">Thinking…</p>
                )}
                {turn.error && <p className="text-sm text-red-400">{turn.error}</p>}
                {turn.cost !== undefined && <p className="text-[10px] text-zinc-600 tabular-nums">≈ ${turn.cost.toFixed(3)}</p>}
              </div>
            )
          )}
          <div ref={bottom} />
        </div>

        <form onSubmit={onSubmit} className="sticky bottom-20 lg:bottom-4 mt-6 flex gap-2 bg-zinc-950 pt-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={configured ? "Ask about spending, net worth, your goals…" : assistant.ok ? "Start a new chat to ask more" : "Set up an AI provider to start"}
            disabled={!configured || busy}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500 disabled:opacity-60"
          />
          <Button type="submit" disabled={!configured || busy || !input.trim()}>{busy ? "…" : "Send"}</Button>
        </form>
      </div>
    </div>
  );
}
