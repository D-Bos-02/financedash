import { prisma } from "@/lib/prisma";
import { MemberInput, dbError, parseBody } from "@/lib/household-api";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, MemberInput.partial());
  if ("error" in parsed) return parsed.error;
  try {
    return Response.json(await prisma.member.update({ where: { id }, data: parsed.data }));
  } catch (err) {
    return dbError(err);
  }
}

// Their accounts become shared and their income sources are removed.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.member.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
