// Server-side loader for everything the planner and the chat assistant read.

import { prisma } from "@/lib/prisma";
import { computePay, computePosition, derivePlannerView, sanitizeInputs, summarizeBasis } from "@/lib/planner";
import { getQuote, type Quote } from "@/lib/quote";
import { computeActuals } from "@/lib/actuals";
import { monthsAgo } from "@/lib/formatters";
import { toGoal, toIncomeSource } from "@/lib/household";
import { goalInputs } from "@/lib/goals";
import { DEFAULT_BASE_CURRENCY } from "@/lib/profile";

export async function loadFinanceData() {
  const [profile, members, sourceRows, goalRows, accounts, fxRates, state, txs, firsts, holdings] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.member.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, color: true } }),
    prisma.incomeSource.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.goal.findMany({
      where: { status: "active" },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
      include: { accounts: true, contributions: { orderBy: { createdAt: "asc" } } },
    }),
    prisma.account.findMany({ where: { isActive: true } }),
    prisma.fxRate.findMany(),
    prisma.plannerState.findUnique({ where: { id: "singleton" } }),
    prisma.transaction.findMany({
      where: { date: { gte: monthsAgo(3) } },
      select: { date: true, amount: true, merchant: true, category: true, subCategory: true, isTransfer: true, account: { select: { ownerId: true } } },
    }),
    // When each member's transaction history starts, to flag months with partial data.
    prisma.$queryRaw<{ ownerId: string; first: string }[]>`
      SELECT a.ownerId AS ownerId, MIN(t.date) AS first FROM "Transaction" t
      JOIN Account a ON a.id = t.accountId WHERE a.ownerId IS NOT NULL GROUP BY a.ownerId`,
    prisma.holding.findMany({
      where: { account: { isActive: true, type: "investment" } },
      include: { account: { select: { name: true, ownerId: true } } },
    }),
  ]);

  const baseCurrency = profile?.baseCurrency ?? DEFAULT_BASE_CURRENCY;
  const settings = { baseCurrency, timeZone: profile?.timeZone ?? "UTC", locale: profile?.locale ?? "en-US", householdType: profile?.householdType ?? "solo" };
  const sources = sourceRows.map(toIncomeSource);
  const goals = goalRows.map(toGoal);
  const memberIds = members.map((m) => m.id);

  const tickers = [...new Set(sources.flatMap((s) => (s.type === "equity_vest" && s.ticker && s.priceLive ? [s.ticker] : [])))];
  const quotes: Record<string, Quote | null> = Object.fromEntries(
    await Promise.all(tickers.map(async (t) => [t, await getQuote(t)] as const))
  );

  const withMember = txs.map(({ account, ...t }) => ({ ...t, memberId: account.ownerId }));
  const position = computePosition(accounts, fxRates, memberIds, baseCurrency);
  const { goalPositions, goalDebts } = goalInputs(goals, accounts, fxRates, memberIds, baseCurrency);
  const actuals = computeActuals(withMember, {
    firstDates: Object.fromEntries(firsts.map((f) => [f.ownerId, new Date(f.first)])),
    members,
    sources,
  });
  const pay = computePay(withMember.filter((t) => t.category === "Income" && !t.isTransfer), sources, members);
  const savedInputs = sanitizeInputs(state ? JSON.parse(state.data) : {});
  const basis = summarizeBasis(holdings);

  return {
    settings,
    members,
    sources,
    goals,
    accounts,
    fxRates,
    position,
    goalPositions,
    goalDebts,
    quotes,
    actuals,
    pay,
    savedInputs,
    holdings,
    basis,
    view: derivePlannerView(savedInputs, { quotes, actuals, pay, position, basis, sources, members }),
  };
}
