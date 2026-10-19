import { prisma } from "@/lib/prisma";
import { IncomeSourceInput, dbError, incomeSourceData, parseBody } from "@/lib/household-api";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseBody(request, IncomeSourceInput.partial());
  if ("error" in parsed) return parsed.error;
  try {
    return Response.json(await prisma.incomeSource.update({ where: { id }, data: incomeSourceData(parsed.data) }));
  } catch (err) {
    return dbError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await prisma.incomeSource.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (err) {
    return dbError(err);
  }
}
