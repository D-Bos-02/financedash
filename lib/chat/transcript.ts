// Turn a saved API transcript back into what the chat shows: the questions, and each answer's
// text plus the tools it used. Tool results and thinking are part of the transcript but not shown.
// Reads both formats: Anthropic's content blocks and OpenAI-compatible messages with tool_calls.

import type { ChatMessage } from "@/lib/chat/types";

export interface Turn {
  role: "user" | "assistant";
  text: string;
  tools: string[];
  error?: string;
  cost?: number;
}

export function transcriptToTurns(messages: ChatMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "tool") continue; // an OpenAI-format tool result
    if (m.role === "user") {
      // Tool results come back as user messages; only typed questions start a new turn.
      const text = typeof m.content === "string" ? m.content : m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
      if (text) turns.push({ role: "user", text, tools: [] });
      continue;
    }
    // One answer can span several assistant messages (tool calls, then the reply): merge them.
    let turn = turns[turns.length - 1];
    if (!turn || turn.role !== "assistant") {
      turn = { role: "assistant", text: "", tools: [] };
      turns.push(turn);
    }
    if ("tool_calls" in m && m.tool_calls) turn.tools.push(...m.tool_calls.map((c) => c.function.name));
    if (m.content === null) continue;
    const blocks = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
    for (const b of blocks) {
      if (b.type === "text") turn.text += b.text;
      else if (b.type === "tool_use") turn.tools.push(b.name);
    }
  }
  return turns;
}

// The first question, shortened, names the conversation.
export function conversationTitle(messages: ChatMessage[]): string {
  const first = transcriptToTurns(messages).find((t) => t.role === "user")?.text ?? "New chat";
  const oneLine = first.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}…` : oneLine;
}
