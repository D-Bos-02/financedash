// The chat assistant on any OpenAI-compatible chat completions API (OpenAI, Gemini, OpenRouter, Ollama,
// LM Studio, ...), called with fetch so no extra SDK is needed. Same tools and prompt as the Anthropic path;
// the code does the arithmetic, the model explains it.

import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { ProviderError, type ChatEvent, type ChatUsage } from "@/lib/chat/types";
import type { ChatProvider } from "@/lib/chat/provider";

export interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type OAIMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

const MAX_ROUNDS = 12;

// --- Streaming ------------------------------------------------------------------------------------

// Splits a server-sent-events stream into the JSON payload of each `data:` line. Returns the
// payloads found and whatever partial line is left for the next chunk.
export function readSSE(buffer: string): { events: unknown[]; rest: string; done: boolean } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const events: unknown[] = [];
  let done = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (data === "[DONE]") { done = true; continue; }
    try { events.push(JSON.parse(data)); } catch { /* a keep-alive or malformed line */ }
  }
  return { events, rest, done };
}

interface Turn {
  text: string;
  calls: OAIToolCall[];
  finish: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number } | null;
}

export const emptyTurn = (): Turn => ({ text: "", calls: [], finish: null, usage: null });

interface StreamChunk {
  choices?: {
    delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] };
    finish_reason?: string | null;
  }[];
  usage?: Turn["usage"];
}

// Folds one streamed chunk into the turn so far. Tool calls arrive in pieces, keyed by index.
// Returns the text and newly named tools in this chunk, for streaming to the browser.
export function applyChunk(turn: Turn, chunk: StreamChunk): { text: string; newTools: string[] } {
  if (chunk.usage) turn.usage = chunk.usage;
  const choice = chunk.choices?.[0];
  if (!choice) return { text: "", newTools: [] };
  const text = choice.delta?.content ?? "";
  turn.text += text;
  const newTools: string[] = [];
  for (const [i, d] of (choice.delta?.tool_calls ?? []).entries()) {
    const index = d.index ?? i;
    let call = turn.calls[index];
    if (!call) {
      call = turn.calls[index] = { id: "", type: "function", function: { name: "", arguments: "" } };
    }
    if (d.id) call.id = d.id;
    // The name arrives once, in the call's first piece.
    if (d.function?.name && !call.function.name) {
      call.function.name = d.function.name;
      newTools.push(d.function.name);
    }
    if (d.function?.arguments) call.function.arguments += d.function.arguments;
  }
  if (choice.finish_reason) turn.finish = choice.finish_reason;
  return { text, newTools };
}

// --- Tools ----------------------------------------------------------------------------------------

export function toOpenAITools(tools: BetaRunnableTool[]) {
  return tools.map((t) => {
    const { $schema: _, ...parameters } = ("input_schema" in t ? t.input_schema : {}) as Record<string, unknown>; // eslint-disable-line @typescript-eslint/no-unused-vars
    return { type: "function" as const, function: { name: t.name, description: "description" in t ? t.description : "", parameters } };
  });
}

// Runs one tool call. Bad arguments come back as an error message, so the model can correct itself.
export async function runToolCall(tools: BetaRunnableTool[], call: OAIToolCall): Promise<string> {
  const tool = tools.find((t) => t.name === call.function.name);
  if (!tool) return JSON.stringify({ error: `Unknown tool ${call.function.name}` });
  try {
    const args = call.function.arguments.trim() ? JSON.parse(call.function.arguments) : {};
    const out = await tool.run(tool.parse(args));
    return typeof out === "string" ? out : out.map((b) => ("text" in b ? b.text : "")).join("\n");
  } catch (err) {
    return JSON.stringify({ error: `Invalid input for ${call.function.name}: ${err instanceof Error ? err.message : String(err)}` });
  }
}

// --- Loop -----------------------------------------------------------------------------------------

async function request(p: Extract<ChatProvider, { kind: "openai" }>, body: object, withUsage: boolean): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}) },
      body: JSON.stringify({ ...body, stream: true, ...(withUsage ? { stream_options: { include_usage: true } } : {}) }),
    });
  } catch {
    throw new ProviderError(`Couldn't reach ${p.label} at ${p.baseUrl}. ${p.baseUrl.includes("127.0.0.1") ? "Is it running?" : "Check LLM_BASE_URL and your connection."}`);
  }
  if (res.ok) return res;
  const detail = (await res.text().catch(() => "")).slice(0, 300);
  // Some servers don't accept stream_options; ask again without it (usage just isn't reported).
  if (withUsage && res.status === 400 && /stream_options/i.test(detail)) return request(p, body, false);
  if (res.status === 401 || res.status === 403) throw new ProviderError(`${p.label} rejected the API key. Check it in .env.`);
  if (res.status === 404) throw new ProviderError(`${p.label} doesn't know model "${p.model}" (or the address is wrong). Check LLM_MODEL and LLM_BASE_URL.`);
  if (res.status === 429) throw new ProviderError(`Rate limited by ${p.label}. Try again in a minute.`);
  throw new ProviderError(`${p.label} error ${res.status}: ${detail || res.statusText}`);
}

export async function runOpenAIChat(opts: {
  provider: Extract<ChatProvider, { kind: "openai" }>;
  system: string;
  tools: BetaRunnableTool[];
  history: OAIMessage[];
  send: (e: ChatEvent) => void;
}): Promise<{ messages: OAIMessage[]; usage: ChatUsage }> {
  const { provider, system, tools, send } = opts;
  const messages = [...opts.history];
  const usage: ChatUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const toolDefs = toOpenAITools(tools);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await request(provider, { model: provider.model, messages: [{ role: "system", content: system }, ...messages], tools: toolDefs }, true);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const turn = emptyTurn();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const parsed = readSSE(buffer + decoder.decode(value, { stream: true }));
      buffer = parsed.rest;
      for (const chunk of parsed.events) {
        const { text, newTools } = applyChunk(turn, chunk as StreamChunk);
        if (text) send({ type: "text", text });
        for (const name of newTools) send({ type: "tool", name });
      }
    }
    usage.input += turn.usage?.prompt_tokens ?? 0;
    usage.output += turn.usage?.completion_tokens ?? 0;

    const calls = turn.calls.filter((c) => c.function.name).map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}` }));
    if (!calls.length) {
      messages.push({ role: "assistant", content: turn.text });
      return { messages, usage };
    }
    // Never run tools from a reply cut off mid-arguments.
    if (turn.finish === "length") throw new ProviderError("The answer was cut off. Try a narrower question.");
    messages.push({ role: "assistant", content: turn.text || null, tool_calls: calls });
    for (const call of calls) messages.push({ role: "tool", tool_call_id: call.id, content: await runToolCall(tools, call) });
  }
  throw new ProviderError("The assistant used too many steps without finishing. Try a narrower question.");
}
