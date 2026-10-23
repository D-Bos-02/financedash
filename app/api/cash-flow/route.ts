import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentMonthKey, monthRangeUtc } from "@/lib/formatters";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const monthParam = sp.get("month");

  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : currentMonthKey();
  const [y, m] = month.split("-").map(Number);
  const { from, to } = monthRangeUtc(month);
  const { from: prevFrom, to: prevTo } = monthRangeUtc(currentMonthKey(new Date(Date.UTC(y, m - 2, 1))));
  const { from: yearFrom } = monthRangeUtc(currentMonthKey(new Date(Date.UTC(y, m - 12, 1))));

  const [current, prev, monthly] = await Promise.all([
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: to }, isTransfer: false },
      select: { amount: true, category: true },
    }),
    prisma.transaction.findMany({
      where: { date: { gte: prevFrom, lte: prevTo }, isTransfer: false },
      select: { amount: true },
    }),
    // Last 12 months
    prisma.transaction.findMany({
      where: {
        date: { gte: yearFrom, lte: to },
        isTransfer: false,
      },
      select: { date: true, amount: true },
    }),
  ]);

  function summarise(txs: { amount: number }[]) {
    let income = 0;
    let expenses = 0;
    for (const t of txs) {
      if (t.amount > 0) income += t.amount;
      else expenses += Math.abs(t.amount);
    }
    return { income, expenses };
  }

  const { income, expenses } = summarise(current);
  const { income: prevIncome, expenses: prevExpenses } = summarise(prev);

  // Category breakdown for the selected month (expenses only)
  const categoryMap: Record<string, number> = {};
  for (const t of current) {
    if (t.amount < 0) {
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + Math.abs(t.amount);
    }
  }
  const categoryBreakdown = Object.entries(categoryMap)
    .map(([category, amount]) => ({
      category,
      amount,
      percent: expenses > 0 ? (amount / expenses) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  const monthlyMap: Record<string, { income: number; expenses: number }> = {};
  for (const t of monthly) {
    const key = t.date.toISOString().slice(0, 7);
    if (!monthlyMap[key]) monthlyMap[key] = { income: 0, expenses: 0 };
    if (t.amount > 0) monthlyMap[key].income += t.amount;
    else monthlyMap[key].expenses += Math.abs(t.amount);
  }

  const monthlyArr = Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  return Response.json({
    income,
    expenses,
    net,
    savingsRate,
    prevIncome,
    prevExpenses,
    monthly: monthlyArr,
    categoryBreakdown,
  });
}
