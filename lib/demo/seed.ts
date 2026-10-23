// A fictional household for trying the app out: the hosted demo, README screenshots and `npm run seed:demo`.
// Every name, employer and amount here is made up. Dates are relative to `now`, and the random numbers
// are seeded, so each run on the same day gives the same data.

import type { PrismaClient } from "@/app/generated/prisma/client";
import { HOUSE_DEFAULTS } from "@/lib/home-plan";
import { DEFAULT_INPUTS } from "@/lib/planner";

const MONTHS = 6;

interface Tx {
  accountId: string;
  date: Date;
  merchant: string;
  amount: number;
  category: string;
  subCategory?: string;
  isTransfer?: boolean;
}

// Fills an empty database. Returns how many transactions it added.
export async function seedDemo(prisma: PrismaClient, now = new Date()): Promise<number> {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Small seeded PRNG (mulberry32), so amounts vary but runs are repeatable.
  let seed = 20261019;
  function rand() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) * 100) / 100;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const daysAgo = (n: number) => new Date(today.getTime() - n * 86_400_000);
  const monthStart = (back: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
  const inFuture = (months: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + months, 1));

  // --- Household -------------------------------------------------------------------------------
  await prisma.profile.create({
    data: { householdType: "household", baseCurrency: "USD", timeZone: "America/Chicago", locale: "en-US", onboardedAt: now },
  });
  await prisma.settings.create({ data: { theme: "dark" } });
  const alex = await prisma.member.create({ data: { name: "Alex", color: "#38bdf8", sortOrder: 0 } });
  const sam = await prisma.member.create({ data: { name: "Sam", color: "#f472b6", sortOrder: 1 } });

  // --- Accounts --------------------------------------------------------------------------------
  const account = (name: string, type: string, balance: number, ownerId: string | null, institution: string) =>
    prisma.account.create({ data: { name, type, balance, ownerId, institution, balanceMode: "manual" } });
  const checking = await account("Joint Checking", "checking", 3_400, null, "Maple Credit Union");
  const savings = await account("High-Yield Savings", "savings", 9_800, null, "Harbor Bank");
  const samChecking = await account("Sam Checking", "checking", 1_650, sam.id, "Harbor Bank");
  const brokerage = await account("Alex Brokerage", "investment", 8_200, alex.id, "Summit Investing");
  const k401 = await account("Alex 401(k)", "retirement", 24_500, alex.id, "Summit Investing");
  const ira = await account("Sam IRA", "retirement", 10_800, sam.id, "Summit Investing");
  const stockPlan = await account("Alex Stock Plan", "stock_plan", 6_000, alex.id, "Summit Investing");
  const card = await account("Rewards Visa", "credit", -2_840, null, "Harbor Bank");
  const carLoan = await account("Car Loan", "loan", -11_200, sam.id, "Maple Credit Union");

  // Monthly balance history so net worth has a trend: steady growth toward today's balances.
  const growth: [string, number, number][] = [
    [checking.id, 3_400, 150], [savings.id, 9_800, 600], [samChecking.id, 1_650, 60], [brokerage.id, 8_200, 250],
    [k401.id, 24_500, 600], [ira.id, 10_800, 200], [stockPlan.id, 6_000, 0], [card.id, -2_840, -100], [carLoan.id, -11_200, -390],
  ];
  const snapshots = growth.flatMap(([accountId, balance, perMonth]) =>
    Array.from({ length: MONTHS + 1 }, (_, back) => ({
      accountId,
      date: back === 0 ? today : monthStart(back - 1),
      balance: Math.round((balance - perMonth * back + (back ? between(-120, 120) : 0)) * 100) / 100,
      currency: "USD",
    }))
  );
  await prisma.balanceSnapshot.createMany({ data: snapshots });

  // --- Transactions ----------------------------------------------------------------------------
  const txs: Tx[] = [];
  const firstDay = monthStart(MONTHS - 1);
  const days = Math.round((today.getTime() - firstDay.getTime()) / 86_400_000);

  // Alex: paid every other Friday by a fictional employer.
  const firstFriday = new Date(firstDay);
  while (firstFriday.getUTCDay() !== 5) firstFriday.setUTCDate(firstFriday.getUTCDate() + 1);
  for (let d = new Date(firstFriday); d <= today; d = new Date(d.getTime() + 14 * 86_400_000)) {
    txs.push({ accountId: checking.id, date: d, merchant: "ACME CORP PAYROLL", amount: between(2_880, 2_920), category: "Income", subCategory: "Salary" });
  }

  for (let back = MONTHS - 1; back >= 0; back--) {
    const m = monthStart(back);
    const on = (day: number) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), day));
    const past = (d: Date) => d <= today;
    const add = (t: Tx) => { if (past(t.date)) txs.push(t); };

    // Sam: freelance design invoices, irregular.
    for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
      add({ accountId: samChecking.id, date: on(3 + Math.floor(rand() * 24)), merchant: `STRIPE TRANSFER INVOICE ${1040 + back * 3 + i}`, amount: between(800, 1_700), category: "Income", subCategory: "Freelance" });
    }
    add({ accountId: samChecking.id, date: on(5), merchant: "Transfer to Joint Checking", amount: -1_500, category: "Money Movement", isTransfer: true });
    add({ accountId: checking.id, date: on(5), merchant: "Transfer from Sam Checking", amount: 1_500, category: "Money Movement", isTransfer: true });

    // Fixed costs. Rent is paid a few days early, the way the actuals expect.
    add({ accountId: checking.id, date: on(28), merchant: "OAKVIEW PROPERTIES RENT", amount: -2_150, category: "Housing", subCategory: "Rent" });
    add({ accountId: checking.id, date: on(12), merchant: "Lakeside Electric", amount: -between(85, 160), category: "Utilities" });
    add({ accountId: checking.id, date: on(15), merchant: "Fiberlink Internet", amount: -70, category: "Utilities" });
    add({ accountId: checking.id, date: on(18), merchant: "Maple CU Auto Loan Payment", amount: -410, category: "Transport", subCategory: "Car loan" });
    add({ accountId: card.id, date: on(9), merchant: "Streamflix", amount: -15.49, category: "Subscriptions" });
    add({ accountId: card.id, date: on(21), merchant: "Tunely Music", amount: -10.99, category: "Subscriptions" });
    add({ accountId: card.id, date: on(2), merchant: "Peak Fitness Club", amount: -45, category: "Fitness" });

    // Saving and investing.
    add({ accountId: checking.id, date: on(7), merchant: "Transfer to High-Yield Savings", amount: -1_000, category: "Money Movement", isTransfer: true });
    add({ accountId: savings.id, date: on(7), merchant: "Transfer from Joint Checking", amount: 1_000, category: "Money Movement", isTransfer: true });
    add({ accountId: savings.id, date: on(28), merchant: "Interest Payment", amount: between(80, 95), category: "Income", subCategory: "Interest" });
    add({ accountId: checking.id, date: on(20), merchant: "Summit Investing Transfer", amount: -500, category: "Money Movement", isTransfer: true });

    // Paying the card off (mostly) each month.
    add({ accountId: checking.id, date: on(24), merchant: "Rewards Visa Payment", amount: -1_800, category: "Money Movement", isTransfer: true });
    add({ accountId: card.id, date: on(24), merchant: "Payment - Thank You", amount: 1_800, category: "Money Movement", isTransfer: true });
  }

  // Day-to-day spending on the card, spread across the period.
  const everyday: [string, string, number, number, number][] = [
    // merchant, category, min, max, times per month
    ["Greenleaf Market", "Food & Dining", 45, 160, 6],
    ["Corner Bakery Co", "Food & Dining", 8, 22, 4],
    ["Taqueria Sol", "Food & Dining", 24, 70, 3],
    ["Noodle House", "Food & Dining", 30, 85, 2],
    ["QuickFuel", "Transport", 38, 62, 3],
    ["Metro Transit", "Transport", 2.5, 2.5, 6],
    ["Bramble Home Goods", "Shopping", 20, 140, 1],
    ["Parcel Depot", "Shopping", 15, 90, 2],
    ["Riverside Pharmacy", "Health & Medical", 9, 45, 1],
    ["Lumen Cinemas", "Entertainment", 24, 40, 1],
  ];
  for (const [merchant, category, lo, hi, perMonth] of everyday) {
    const count = Math.round((perMonth * days) / 30);
    for (let i = 0; i < count; i++) txs.push({ accountId: card.id, date: daysAgo(Math.floor(rand() * days)), merchant, amount: -between(lo, hi), category });
  }
  // A couple of one-offs, and a refund.
  txs.push({ accountId: card.id, date: daysAgo(40), merchant: "Skyway Airlines", amount: -486.2, category: "Travel" });
  txs.push({ accountId: card.id, date: daysAgo(38), merchant: "Seaside Inn", amount: -312, category: "Travel" });
  txs.push({ accountId: card.id, date: daysAgo(12), merchant: pick(["Parcel Depot", "Bramble Home Goods"]), amount: 34.99, category: "Shopping" });

  await prisma.transaction.createMany({
    data: txs.map((t) => ({ ...t, currency: "USD", source: "demo", isTransfer: t.isTransfer ?? false })),
  });

  // --- Categorization rules and budgets ----------------------------------------------------------
  const rules: [string, string, string | null, boolean, number][] = [
    ["acme corp payroll", "Income", "Salary", false, 10],
    ["stripe transfer invoice", "Income", "Freelance", false, 10],
    ["oakview properties", "Housing", "Rent", false, 20],
    ["greenleaf market", "Food & Dining", "Groceries", false, 0],
    ["transfer to", "Money Movement", null, true, 0],
    ["transfer from", "Money Movement", null, true, 0],
    ["payment - thank you", "Money Movement", null, true, 5],
  ];
  await prisma.categoryRule.createMany({
    data: rules.map(([pattern, category, subCategory, isTransfer, priority]) => ({ pattern, category, subCategory, isTransfer, priority })),
  });
  const budgets: [string, number][] = [
    ["Food & Dining", 1_100], ["Transport", 650], ["Shopping", 250], ["Entertainment", 120],
    ["Utilities", 240], ["Subscriptions", 40], ["Health & Medical", 80], ["Travel", 200],
  ];
  await prisma.budget.createMany({ data: budgets.map(([category, amount]) => ({ category, amount, activeFrom: monthStart(MONTHS - 1) })) });

  // --- Income sources ---------------------------------------------------------------------------
  await prisma.incomeSource.createMany({
    data: [
      { memberId: alex.id, name: "Salary", type: "salary", payFrequency: "biweekly", depositPattern: "acme corp payroll", estimateMonthly: 6_300 },
      { memberId: sam.id, name: "Design work", type: "freelance", payFrequency: "irregular", depositPattern: "invoice", estimateMonthly: 3_000 },
      {
        // No ticker, so the demo never looks up a real company's share price.
        memberId: alex.id, name: "Stock grant", type: "equity_vest", payFrequency: "quarterly", depositPattern: "stock plan sale",
        sharesPerVest: 25, vestMonths: JSON.stringify([2, 5, 8, 11]), taxPct: 38, priceFallback: 120, priceLive: false,
      },
    ],
  });

  // --- Goals ------------------------------------------------------------------------------------
  await prisma.goal.create({
    data: {
      name: "Emergency fund", template: "emergency_fund", targetAmount: 15_000, deadline: inFuture(10), priority: 0,
      accounts: { create: [{ accountId: savings.id, share: 0.6 }] },
    },
  });
  await prisma.goal.create({
    data: {
      name: "Pay off the card", template: "debt_payoff", targetAmount: 4_000, deadline: inFuture(6), priority: 1,
      details: JSON.stringify({ aprPct: 22.9 }),
      accounts: { create: [{ accountId: card.id, share: 1 }] },
    },
  });
  await prisma.goal.create({
    data: {
      name: "First home", template: "house", targetAmount: 0, deadline: inFuture(30), priority: 2,
      details: JSON.stringify({ ...HOUSE_DEFAULTS, price: 420_000, depPct: 10, reserve: 10_000, mortgageRate: 6.25 }),
      accounts: { create: [{ accountId: savings.id, share: 0.4 }, { accountId: brokerage.id, share: 1 }] },
      contributions: { create: [{ label: "Gift from family", amount: 10_000, memberId: sam.id }] },
    },
  });
  await prisma.goal.create({
    data: { name: "Japan trip", template: "travel", targetAmount: 7_500, deadline: inFuture(14), priority: 3, plannedMonthly: 300 },
  });

  await prisma.plannerState.create({
    data: { id: "singleton", data: JSON.stringify({ ...DEFAULT_INPUTS, rent: 2_150, lifestyle: 3_200, retirementMonthly: 500, matchMonthly: 350 }) },
  });

  return txs.length;
}
