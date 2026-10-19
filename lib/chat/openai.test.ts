import { describe, expect, it } from "vitest";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { applyChunk, emptyTurn, readSSE, runToolCall, toOpenAITools } from "@/lib/chat/openai";

describe("readSSE", () => {
  it("returns complete data lines and keeps a partial one for the next chunk", () => {
    const out = readSSE('data: {"a":1}\n\n: keep-alive\ndata: [DONE]\ndata: {"b"');
    expect(out).toEqual({ events: [{ a: 1 }], rest: 'data: {"b"', done: true });
  });
});

describe("applyChunk", () => {
  it("joins streamed text and tool calls that arrive in pieces", () => {
    const turn = emptyTurn();
    expect(applyChunk(turn, { choices: [{ delta: { content: "Let me check" } }] })).toEqual({ text: "Let me check", newTools: [] });
    expect(applyChunk(turn, { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "get_goals", arguments: "" } }] } }] }).newTools).toEqual(["get_goals"]);
    applyChunk(turn, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"x"' } }] } }] });
    applyChunk(turn, { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":1}" } }] }, finish_reason: "tool_calls" }] });
    applyChunk(turn, { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    expect(turn).toEqual({
      text: "Let me check",
      calls: [{ id: "c1", type: "function", function: { name: "get_goals", arguments: '{"x":1}' } }],
      finish: "tool_calls",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  });
});

describe("tools", () => {
  const tool = betaZodTool({
    name: "add",
    description: "Adds two numbers",
    inputSchema: z.object({ a: z.number(), b: z.number().default(1) }),
    run: async ({ a, b }) => String(a + b),
  });

  it("are offered as functions with their JSON schema", () => {
    const [def] = toOpenAITools([tool]);
    expect(def.function.name).toBe("add");
    expect(def.function.description).toBe("Adds two numbers");
    expect(def.function.parameters).toMatchObject({ type: "object", properties: { a: { type: "number" } } });
    expect(def.function.parameters).not.toHaveProperty("$schema");
  });

  it("run with validated arguments, and report bad ones back to the model", async () => {
    const call = (args: string, name = "add") => ({ id: "c", type: "function" as const, function: { name, arguments: args } });
    expect(await runToolCall([tool], call('{"a":2}'))).toBe("3");
    expect(await runToolCall([tool], call('{"a":"two"}'))).toContain("Invalid input for add");
    expect(await runToolCall([tool], call("{not json"))).toContain("Invalid input");
    expect(await runToolCall([tool], call("{}", "nope"))).toContain("Unknown tool");
  });
});
