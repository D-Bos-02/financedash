import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { OAIMessage } from "@/lib/chat/openai";

// A saved transcript, in the format of the provider that wrote it.
export type ChatMessage = BetaMessageParam | OAIMessage;
export type TranscriptFormat = "anthropic" | "openai";

// An error to show the person as is (bad key, provider unreachable, ...).
export class ProviderError extends Error {}

// Events streamed from /api/chat to the browser, one JSON object per line.
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string }
  | { type: "done"; messages: ChatMessage[]; usage: ChatUsage; costUsd: number | null; conversationId: string | null }
  | { type: "error"; message: string };

export interface ChatUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// Claude Opus 5.5 list prices per million tokens; a 5-minute cache write costs 1.25x input.
// Other providers' prices aren't known here, so their cost isn't shown.
export function usageCostUsd(u: ChatUsage): number {
  return (u.input * 4 + u.output * 20 + u.cacheRead * 0.2 + u.cacheWrite * 5) / 1_000_000;
}

export const WEEKLY_CHECKIN_PROMPT = "Run my weekly check-in.";
