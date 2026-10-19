import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await prisma.chatConversation.findUnique({ where: { id } });
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...c, messages: JSON.parse(c.messages) });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.chatConversation.deleteMany({ where: { id } });
  return Response.json({ success: true });
}
