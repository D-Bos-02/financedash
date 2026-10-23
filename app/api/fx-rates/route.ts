import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const rates = await prisma.fxRate.findMany({ orderBy: { fromCurrency: "asc" } });
  return Response.json(rates);
}

export async function POST(request: NextRequest) {
  const { fromCurrency, toCurrency, rate } = await request.json();
  if (!fromCurrency || !toCurrency || typeof rate !== "number") {
    return Response.json({ error: "fromCurrency, toCurrency, and rate are required" }, { status: 400 });
  }
  if (fromCurrency === toCurrency) {
    return Response.json({ error: "fromCurrency and toCurrency must differ" }, { status: 400 });
  }

  const existing = await prisma.fxRate.findFirst({
    where: { fromCurrency, toCurrency },
  });

  const fxRate = existing
    ? await prisma.fxRate.update({ where: { id: existing.id }, data: { rate } })
    : await prisma.fxRate.create({ data: { fromCurrency, toCurrency, rate } });

  return Response.json(fxRate, { status: existing ? 200 : 201 });
}
