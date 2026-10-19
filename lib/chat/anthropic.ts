// The chat assistant on Anthropic's API, using the SDK's tool runner (streamed, with prompt caching).

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import { ProviderError, type ChatEvent, type ChatUsage } from "@/lib/chat/types";

class TruncatedToolInput extends Error {}

export async function runAnthropicChat(opts: {
  model: string;
  system: string; // fixed, so it caches
  context: string; // the brief and today's date
  tools: BetaRunnableTool[];
  history: BetaMessageParam[];
  send: (e: ChatEvent) => void;
}): Promise<{ messages: BetaMessageParam[]; usage: ChatUsage }> {
  const { send } = opts;
  const client = new Anthropic();
  const usage: ChatUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  let runner = client.beta.messages.toolRunner({
    model: opts.model,
    max_tokens: 64000,
    max_iterations: 12,
    stream: true,
    output_config: { effort: "medium" },
    // On a safety decline, the API re-runs the turn on a suitable fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    cache_control: { type: "ephemeral" },
    system: [
      { type: "text", text: opts.system },
      { type: "text", text: opts.context },
    ],
    // Small inputs, but stream them as generated; betaZodTool validates each before it runs.
    tools: opts.tools.map((t) => ({ ...t, eager_input_streaming: true })),
    messages: opts.history,
  });

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        for await (const messageStream of runner) {
          for await (const event of messageStream) {
            if (event.type === "content_block_start" && event.content_block.type === "tool_use") {
              send({ type: "tool", name: event.content_block.name });
            } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", text: event.delta.text });
            }
          }
          const message = await messageStream.finalMessage();
          attempt = 0;
          usage.input += message.usage.input_tokens;
          usage.output += message.usage.output_tokens;
          usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
          usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

          // Never run tools from a turn cut off mid-input, and stop on a refusal.
          const hasToolUse = message.content.some((b) => b.type === "tool_use");
          if (message.stop_reason === "max_tokens" && hasToolUse) throw new TruncatedToolInput("The answer was cut off. Try a narrower question.");
          if (message.stop_reason === "refusal") {
            send({ type: "text", text: "\n\nI can't help with that one." });
            break;
          }
        }
        break;
      } catch (err) {
        // Only an unparseable tool input is retried; the failed turn was never appended.
        if (err instanceof Anthropic.APIError || err instanceof TruncatedToolInput || attempt >= 2) throw err;
        runner = client.beta.messages.toolRunner({ ...runner.params });
      }
    }
  } catch (err) {
    throw new ProviderError(
      err instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env."
      : err instanceof Anthropic.RateLimitError ? "Rate limited by the Anthropic API. Try again in a minute."
      : err instanceof Anthropic.APIError ? `Anthropic API error ${err.status}: ${err.message}`
      : err instanceof Error ? err.message
      : "Something went wrong."
    );
  }
  return { messages: [...runner.params.messages], usage };
}
