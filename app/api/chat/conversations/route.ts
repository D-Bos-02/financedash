import { prisma } from "@/lib/prisma";

// Saved chats, most recent first (without their transcripts).
export async function GET() {
  const conversations = await prisma.chatConversation.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, costUsd: true, createdAt: true, updatedAt: true },
  });
  return Response.json(conversations);
}
