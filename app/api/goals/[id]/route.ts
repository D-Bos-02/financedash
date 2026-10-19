import { prisma } from "@/lib/prisma";
import { GOAL_INCLUDE, GoalInput, dbError, goalData, parseBody } from "@/lib/household-api";

// Partial update. details, accounts and contributions each replace what's stored when present.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, GoalInput.partial());
  if ("error" in parsed) return parsed.error;
  try {
    return Response.json(await prisma.goal.update({ where: { id }, data: goalData(parsed.data), include: GOAL_INCLUDE }));
  } catch (err) {
    return dbError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.goal.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
