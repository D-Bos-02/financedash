import { prisma } from "@/lib/prisma";
import { isLiability } from "@/lib/categories";
import { countsTowardNetWorth, monthlyNetWorth } from "@/lib/net-worth";
import { loadToBase } from "@/lib/fx";
import { startOfMonth, endOfMonth, monthsAgo } from "@/lib/formatters";
import { NetWorthCard } from "@/components/dashboard/NetWorthCard";
import { CashFlowCard } from "@/components/dashboard/CashFlowCard";
import { BudgetAlerts } from "@/components/dashboard/BudgetAlert";
import { TransactionList } from "@/components/transactions/TransactionList";
import { SpendingPie } from "@/components/charts/SpendingPie";
import { NetWorthLine } from "@/components/charts/NetWorthLine";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getDashboardData() {
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);

  const [accounts, transactions, budgets, recentTxs, snapshots, toBase] = await Promise.all([
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
    prisma.balanceSnapshot.findMany({
      where: { date: { gte: monthsAgo(5) } },
      orderBy: { date: "asc" },
      include: { account: { select: { type: true, isActive: true } } },
    }),
    loadToBase(),
  ]);

  let assets = 0;
  let liabilities = 0;
  for (const acc of accounts) {
    if (!countsTowardNetWorth(acc.type)) continue; // unvested stock is shown separately
    const balance = toBase(acc.balance, acc.currency);
    if (isLiability(acc.type)) liabilities += Math.abs(balance);
    else assets += balance;
  }

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
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // Build 6-month net worth sparkline from snapshots
  const nwHistory = monthlyNetWorth(snapshots, toBase);

  return {
    netWorth: assets - liabilities,
    income,
    expenses,
    savingsRate,
    budgetAlerts,
    recentTxs: recentTxs.map((t) => ({
      ...t,
      date: t.date.toISOString(),
      createdAt: t.createdAt.toISOString(),
      account: t.account,
    })),
    spendingByCategory,
    nwHistory,
    hasAccounts: accounts.length > 0,
  };
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  if (!data.hasAccounts) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Welcome to FinanceDash</h1>
          <p className="text-zinc-400 mb-6">Start by adding your accounts to track your finances.</p>
          <Link
            href="/accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-lg transition-colors"
          >
            Add your first account →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-zinc-100">Dashboard</h1>
        <Link href="/chat?checkin=1" className="text-sm font-medium text-violet-400 hover:text-violet-300">Weekly check-in →</Link>
      </div>

      {/* Top summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <NetWorthCard netWorth={data.netWorth} change={0} />
        <CashFlowCard income={data.income} expenses={data.expenses} savingsRate={data.savingsRate} />
      </div>

      {/* Net worth sparkline */}
      {data.nwHistory.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Net Worth Trend</CardTitle>
            <Link href="/net-worth" className="text-xs text-violet-400 hover:text-violet-300">
              Full view →
            </Link>
          </CardHeader>
          <NetWorthLine data={data.nwHistory} sparkline={false} height={160} />
        </Card>
      )}

      {/* Budget alerts */}
      {data.budgetAlerts.length > 0 && (
        <BudgetAlerts alerts={data.budgetAlerts} />
      )}

      {/* Transactions + Spending donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <Link href="/transactions" className="text-xs text-violet-400 hover:text-violet-300">
              View all →
            </Link>
          </CardHeader>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <TransactionList transactions={data.recentTxs as any} compact />
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending This Month</CardTitle>
            <Link href="/cash-flow" className="text-xs text-violet-400 hover:text-violet-300">
              Cash flow →
            </Link>
          </CardHeader>
          <SpendingPie data={data.spendingByCategory} height={200} />
        </Card>
      </div>
    </div>
  );
}
