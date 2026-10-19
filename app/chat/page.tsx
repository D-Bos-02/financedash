import { prisma } from "@/lib/prisma";
import { Chat } from "@/components/chat/Chat";
import { describeProvider, transcriptFormat } from "@/lib/chat/provider";
import { loadChatSetup } from "@/lib/chat/setup";
import { DEMO } from "@/lib/demo/mode";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · FinanceDash" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { checkin, id } = await searchParams;
  const [conversations, current] = await Promise.all([
    prisma.chatConversation.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, updatedAt: true } }),
    typeof id === "string" ? prisma.chatConversation.findUnique({ where: { id } }) : null,
  ]);

  // The hosted demo answers with scripted replies (lib/demo/chat.ts), saved in the OpenAI-compatible format.
  const setup = DEMO
    ? { ok: true as const, name: "Demo · scripted answers", format: "openai" as const }
    : await loadChatSetup().then((s) => (s.ok ? { ok: true as const, name: describeProvider(s.provider), format: transcriptFormat(s.provider) } : s));
  return (
    <Chat
      // A different conversation (or a new chat) starts from a fresh state.
      key={current?.id ?? "new"}
      assistant={setup}
      continuable={!current || !setup.ok || current.format === setup.format}
      autoCheckin={checkin === "1"}
      conversations={conversations.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
      initial={current ? { id: current.id, messages: JSON.parse(current.messages), format: current.format === "openai" ? "openai" : "anthropic" } : null}
    />
  );
}
