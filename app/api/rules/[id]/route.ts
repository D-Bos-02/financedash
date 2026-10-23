import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.categoryRule.delete({ where: { id } });
  return Response.json({ success: true });
}
