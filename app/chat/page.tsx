import { prisma } from "@/lib/prisma";
import { Chat } from "@/components/chat/Chat";
import { describeProvider, resolveChatProvider, transcriptFormat } from "@/lib/chat/provider";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · FinanceDash" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { checkin, id } = await searchParams;
  const [conversations, current] = await Promise.all([
    prisma.chatConversation.findMany({ orderBy: { updatedAt: "desc" }, select: { id: true, title: true, updatedAt: true } }),
    typeof id === "string" ? prisma.chatConversation.findUnique({ where: { id } }) : null,
  ]);

  const setup = resolveChatProvider(process.env);
  return (
    <Chat
      // A different conversation (or a new chat) starts from a fresh state.
      key={current?.id ?? "new"}
      assistant={setup.ok ? { ok: true, name: describeProvider(setup.provider) } : { ok: false, reason: setup.reason }}
      continuable={!current || !setup.ok || current.format === transcriptFormat(setup.provider)}
      autoCheckin={checkin === "1"}
      conversations={conversations.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() }))}
      initial={current ? { id: current.id, messages: JSON.parse(current.messages) } : null}
    />
  );
}
