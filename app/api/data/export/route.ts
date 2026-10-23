import { prisma } from "@/lib/prisma";

export async function GET() {
  const [
    accounts, transactions, budgets, rules, fxRates, settings, snapshots,
    profile, members, incomeSources, goals, goalAccounts, goalContributions, plannerState,
  ] = await Promise.all([
    prisma.account.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.transaction.findMany({ orderBy: { date: "asc" } }),
    prisma.budget.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.categoryRule.findMany({ orderBy: { priority: "desc" } }),
    prisma.fxRate.findMany(),
    prisma.settings.findUnique({ where: { id: "singleton" } }),
    prisma.balanceSnapshot.findMany({ orderBy: { date: "asc" } }),
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.member.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.incomeSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.goal.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.goalAccount.findMany(),
    prisma.goalContribution.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.plannerState.findUnique({ where: { id: "singleton" } }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 2, // 2 adds profile, members, income sources, goals and planner state; accounts carry ownerId
    accounts,
    transactions,
    budgets,
    categoryRules: rules,
    fxRates,
    balanceSnapshots: snapshots,
    settings,
    profile,
    members,
    incomeSources,
    goals,
    goalAccounts,
    goalContributions,
    plannerState,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="financedash-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
