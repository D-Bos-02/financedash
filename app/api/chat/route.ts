import { NextRequest } from "next/server";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { loadFinanceData } from "@/lib/finance-data";
import { createTools, householdBrief } from "@/lib/chat/tools";
import { SYSTEM_PROMPT, contextBlock } from "@/lib/chat/prompt";
import { ChatEvent, ChatMessage, ProviderError, TranscriptFormat, usageCostUsd } from "@/lib/chat/types";
import { conversationTitle } from "@/lib/chat/transcript";
import { transcriptFormat } from "@/lib/chat/provider";
import { loadChatSetup } from "@/lib/chat/setup";
import { runAnthropicChat } from "@/lib/chat/anthropic";
import { runOpenAIChat, type OAIMessage } from "@/lib/chat/openai";
import { prisma } from "@/lib/prisma";
import { DEMO } from "@/lib/demo/mode";
import { runDemoChat } from "@/lib/demo/chat";

export const dynamic = "force-dynamic";

// Saves the whole transcript after each answer so the chat can be reopened and continued.
// Returns the conversation id, or null if saving failed (the answer is still shown).
async function saveConversation(id: string | null, messages: ChatMessage[], format: TranscriptFormat, cost: number): Promise<string | null> {
  try {
    const data = JSON.stringify(messages);
    if (id) {
      const updated = await prisma.chatConversation.updateMany({ where: { id }, data: { messages: data, costUsd: { increment: cost } } });
      if (updated.count) return id;
    }
    const created = await prisma.chatConversation.create({ data: { title: conversationTitle(messages), messages: data, format, costUsd: cost } });
    return created.id;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  // The hosted demo has no AI model: it answers set questions with scripted replies.
  const setup = DEMO ? null : await loadChatSetup();
  if (setup && !setup.ok) return Response.json({ error: setup.reason }, { status: 503 });
  const provider = setup?.provider ?? null;
  const format = provider ? transcriptFormat(provider) : "openai";

  const body = await request.json().catch(() => null);
  const history = body?.messages as ChatMessage[] | undefined;
  const conversationId = typeof body?.conversationId === "string" ? body.conversationId : null;
  if (!Array.isArray(history) || !history.length || history[history.length - 1].role !== "user") {
    return Response.json({ error: "messages must end with a user message" }, { status: 400 });
  }
  // A transcript can only be continued by a provider that reads its format.
  if (conversationId) {
    const existing = await prisma.chatConversation.findUnique({ where: { id: conversationId }, select: { format: true } });
    if (existing && existing.format !== format) {
      return Response.json({ error: "This chat was started with a different AI provider. Start a new chat to continue." }, { status: 409 });
    }
  }

  const data = await loadFinanceData();
  const tools = createTools(data);
  const context = contextBlock(householdBrief(data), data.settings.timeZone);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const result = !provider
          ? await runDemoChat({ tools, history: history as OAIMessage[], settings: data.settings, send })
          : provider.kind === "anthropic"
            ? await runAnthropicChat({ model: provider.model, system: SYSTEM_PROMPT, context, tools, history: history as BetaMessageParam[], send })
            : await runOpenAIChat({ provider, system: `${SYSTEM_PROMPT}\n\n${context}`, tools, history: history as OAIMessage[], send });
        // Only Anthropic's prices are known here; other providers show no cost.
        const costUsd = provider?.kind === "anthropic" ? usageCostUsd(result.usage) : null;
        const id = await saveConversation(conversationId, result.messages, format, costUsd ?? 0);
        send({ type: "done", messages: result.messages, usage: result.usage, costUsd, conversationId: id });
      } catch (err) {
        send({ type: "error", message: err instanceof ProviderError || err instanceof Error ? err.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
