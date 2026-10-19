import { prisma } from "@/lib/prisma";
import { isLiability } from "@/lib/categories";
import { loadToBase } from "@/lib/fx";
import { countsTowardNetWorth } from "@/lib/net-worth";
import { startOfMonth, endOfMonth } from "@/lib/formatters";

export async function GET() {
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [accounts, transactions, budgets, recentTxs, toBase] = await Promise.all([
    prisma.account.findMany({ where: { isActive: true } }),
    prisma.transaction.findMany({
      where: { date: { gte: from, lte: to }, isTransfer: false },
      select: { amount: true, category: true },
    }),
    prisma.budget.findMany({ where: { period: "monthly" } }),
    prisma.transaction.findMany({
      orderBy: { date: "desc" },
      take: 10,
      include: { account: { select: { id: true, name: true, currency: true } } },
    }),
    loadToBase(),
  ]);

  // Net worth
  let assets = 0;
  let liabilities = 0;
  for (const acc of accounts) {
    if (!countsTowardNetWorth(acc.type)) continue; // unvested stock is shown separately
    const balance = toBase(acc.balance, acc.currency);
    if (isLiability(acc.type)) liabilities += Math.abs(balance);
    else assets += balance;
  }
  const netWorth = assets - liabilities;

  // Cash flow
  let income = 0;
  let expenses = 0;
  const categoryMap: Record<string, number> = {};
  for (const t of transactions) {
    if (t.amount > 0) income += t.amount;
    else {
      const abs = Math.abs(t.amount);
      expenses += abs;
      categoryMap[t.category] = (categoryMap[t.category] ?? 0) + abs;
    }
  }

  const net = income - expenses;
  const savingsRate = income > 0 ? (net / income) * 100 : 0;

  // Budget alerts (>80% spent)
  const budgetAlerts = budgets
    .map((b) => ({
      category: b.category,
      budgeted: b.amount,
      spent: categoryMap[b.category] ?? 0,
      percent: b.amount > 0 ? ((categoryMap[b.category] ?? 0) / b.amount) * 100 : 0,
    }))
    .filter((b) => b.percent >= 80)
    .sort((a, b) => b.percent - a.percent);

  const spendingByCategory = Object.entries(categoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return Response.json({
    netWorth,
    netWorthChange: 0,
    monthlyIncome: income,
    monthlyExpenses: expenses,
    monthlySavingsRate: savingsRate,
    budgetAlerts,
    recentTransactions: recentTxs,
    spendingByCategory,
  });
}
