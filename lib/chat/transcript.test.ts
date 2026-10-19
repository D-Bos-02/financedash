import { describe, expect, it } from "vitest";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { conversationTitle, transcriptToTurns } from "@/lib/chat/transcript";

// A question answered after two tool calls, then a follow-up answered directly.
const transcript = [
  { role: "user", content: "Are we on track for the house?" },
  { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "tool_use", id: "t1", name: "get_plan", input: {} }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }] },
  { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "run_home_plan", input: {} }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "{}" }] },
  { role: "assistant", content: [{ type: "text", text: "Yes, " }, { type: "text", text: "comfortably." }] },
  { role: "user", content: "And for 18 months?" },
  { role: "assistant", content: [{ type: "text", text: "Even more so." }] },
] as BetaMessageParam[];

describe("transcriptToTurns", () => {
  it("shows questions and merges each answer's tool calls and text into one turn", () => {
    expect(transcriptToTurns(transcript)).toEqual([
      { role: "user", text: "Are we on track for the house?", tools: [] },
      { role: "assistant", text: "Yes, comfortably.", tools: ["get_plan", "run_home_plan"] },
      { role: "user", text: "And for 18 months?", tools: [] },
      { role: "assistant", text: "Even more so.", tools: [] },
    ]);
  });
});

describe("conversationTitle", () => {
  it("uses the first question, shortened", () => {
    expect(conversationTitle(transcript)).toBe("Are we on track for the house?");
    expect(conversationTitle([{ role: "user", content: "x".repeat(80) }])).toHaveLength(58);
  });
});

describe("transcriptToTurns with OpenAI-format messages", () => {
  it("shows questions and answers, with the tools used, and skips tool results", () => {
    const turns = transcriptToTurns([
      { role: "user", content: "Are we on track?" },
      { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_goals", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "{...}" },
      { role: "assistant", content: "Yes, mostly." },
    ]);
    expect(turns).toEqual([
      { role: "user", text: "Are we on track?", tools: [] },
      { role: "assistant", text: "Yes, mostly.", tools: ["get_goals"] },
    ]);
  });
});
