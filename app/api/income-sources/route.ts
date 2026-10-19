import { prisma } from "@/lib/prisma";
import { IncomeSourceInput, dbError, incomeSourceData, parseBody } from "@/lib/household-api";

export async function GET() {
  return Response.json(await prisma.incomeSource.findMany({ orderBy: { createdAt: "asc" } }));
}

export async function POST(request: Request) {
  const schema = IncomeSourceInput.partial().required({ name: true, type: true, payFrequency: true });
  const parsed = await parseBody(request, schema);
  if ("error" in parsed) return parsed.error;
  const { name, type, payFrequency } = parsed.data;
  try {
    const source = await prisma.incomeSource.create({ data: { ...incomeSourceData(parsed.data), name, type, payFrequency } });
    return Response.json(source, { status: 201 });
  } catch (err) {
    return dbError(err);
  }
}
