import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const budgets = await prisma.budget.findMany({ orderBy: { category: "asc" } });
  return Response.json(budgets);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const existing = await prisma.budget.findFirst({
    where: { category: body.category, period: body.period ?? "monthly" },
  });

  const budget = existing
    ? await prisma.budget.update({
        where: { id: existing.id },
        data: { amount: body.amount, rollover: body.rollover ?? existing.rollover },
      })
    : await prisma.budget.create({
        data: {
          category: body.category,
          period: body.period ?? "monthly",
          amount: body.amount,
          rollover: body.rollover ?? false,
        },
      });

  return Response.json(budget, { status: 201 });
}
