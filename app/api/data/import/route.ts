import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.version) {
    return Response.json({ error: "Not a valid FinanceDash export file" }, { status: 400 });
  }

  const counts = {
    accounts: 0,
    transactions: 0,
    budgets: 0,
    categoryRules: 0,
    fxRates: 0,
    balanceSnapshots: 0,
    members: 0,
    incomeSources: 0,
    goals: 0,
  };

  type Row = Record<string, unknown>;
  const rows = (key: string) => (body[key] as Row[] | undefined) ?? [];
  const date = (v: unknown) => (v ? new Date(v as string) : null);

  // Members first: accounts, income sources and contributions point at them.
  for (const m of rows("members")) {
    await prisma.member.upsert({
      where: { id: m.id as string },
      update: {},
      create: {
        id: m.id as string,
        name: m.name as string,
        color: m.color as string,
        sortOrder: (m.sortOrder as number) ?? 0,
        createdAt: new Date(m.createdAt as string),
      },
    });
    counts.members++;
  }

  // Version 1 files tag accounts with a free-text owner key. Each key becomes a member (rename it in Settings); "joint" means shared.
  const accounts = (body.accounts as Record<string, unknown>[] | undefined) ?? [];
  const legacyOwner = (acc: Row) =>
    !acc.ownerId && typeof acc.owner === "string" && acc.owner && acc.owner !== "joint" ? `legacy-${acc.owner}` : null;
  for (const acc of accounts) {
    const id = legacyOwner(acc);
    if (!id) continue;
    const existing = await prisma.member.findUnique({ where: { id } });
    if (!existing) {
      await prisma.member.create({ data: { id, name: acc.owner as string, color: "#8b5cf6" } });
      counts.members++;
    }
  }

  // Upsert accounts
  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { id: acc.id as string },
      update: {},
      create: {
        id: acc.id as string,
        name: acc.name as string,
        type: acc.type as string,
        currency: (acc.currency as string) ?? "USD",
        institution: acc.institution as string | undefined,
        balance: (acc.balance as number) ?? 0,
        balanceMode: (acc.balanceMode as string) ?? "manual",
        ownerId: (acc.ownerId as string | null) ?? legacyOwner(acc),
        isActive: (acc.isActive as boolean) ?? true,
        createdAt: new Date(acc.createdAt as string),
        updatedAt: new Date(acc.updatedAt as string),
      },
    });
    counts.accounts++;
  }

  // Upsert transactions
  const transactions = (body.transactions as Record<string, unknown>[] | undefined) ?? [];
  for (const tx of transactions) {
    await prisma.transaction.upsert({
      where: { id: tx.id as string },
      update: {},
      create: {
        id: tx.id as string,
        accountId: tx.accountId as string,
        date: new Date(tx.date as string),
        merchant: tx.merchant as string,
        amount: tx.amount as number,
        currency: tx.currency as string,
        category: tx.category as string,
        subCategory: tx.subCategory as string | undefined,
        notes: tx.notes as string | undefined,
        isTransfer: (tx.isTransfer as boolean) ?? false,
        source: (tx.source as string) ?? "import",
        createdAt: new Date(tx.createdAt as string),
      },
    });
    counts.transactions++;
  }

  // Upsert budgets
  const budgets = (body.budgets as Record<string, unknown>[] | undefined) ?? [];
  for (const b of budgets) {
    await prisma.budget.upsert({
      where: { id: b.id as string },
      update: {},
      create: {
        id: b.id as string,
        category: b.category as string,
        period: (b.period as string) ?? "monthly",
        amount: b.amount as number,
        rollover: (b.rollover as boolean) ?? false,
        activeFrom: new Date(b.activeFrom as string),
        createdAt: new Date(b.createdAt as string),
      },
    });
    counts.budgets++;
  }

  // Upsert category rules
  const rules = (body.categoryRules as Record<string, unknown>[] | undefined) ?? [];
  for (const r of rules) {
    await prisma.categoryRule.upsert({
      where: { id: r.id as string },
      update: {},
      create: {
        id: r.id as string,
        pattern: r.pattern as string,
        category: r.category as string,
        subCategory: r.subCategory as string | undefined,
        priority: (r.priority as number) ?? 0,
        createdAt: new Date(r.createdAt as string),
      },
    });
    counts.categoryRules++;
  }

  // Upsert FX rates
  const fxRates = (body.fxRates as Record<string, unknown>[] | undefined) ?? [];
  for (const fx of fxRates) {
    await prisma.fxRate.upsert({
      where: { id: fx.id as string },
      update: { rate: fx.rate as number },
      create: {
        id: fx.id as string,
        fromCurrency: fx.fromCurrency as string,
        toCurrency: fx.toCurrency as string,
        rate: fx.rate as number,
      },
    });
    counts.fxRates++;
  }

  // Upsert balance snapshots
  const snapshots = (body.balanceSnapshots as Record<string, unknown>[] | undefined) ?? [];
  for (const snap of snapshots) {
    await prisma.balanceSnapshot.upsert({
      where: { id: snap.id as string },
      update: {},
      create: {
        id: snap.id as string,
        accountId: snap.accountId as string,
        date: new Date(snap.date as string),
        balance: snap.balance as number,
        currency: snap.currency as string,
        createdAt: new Date(snap.createdAt as string),
      },
    });
    counts.balanceSnapshots++;
  }

  for (const s of rows("incomeSources")) {
    await prisma.incomeSource.upsert({
      where: { id: s.id as string },
      update: {},
      create: {
        id: s.id as string,
        memberId: (s.memberId as string | null) ?? null,
        name: s.name as string,
        type: s.type as string,
        payFrequency: s.payFrequency as string,
        depositPattern: (s.depositPattern as string | null) ?? null,
        estimateMonthly: (s.estimateMonthly as number) ?? 0,
        isActive: (s.isActive as boolean) ?? true,
        ticker: (s.ticker as string | null) ?? null,
        sharesPerVest: (s.sharesPerVest as number | null) ?? null,
        vestMonths: (s.vestMonths as string | null) ?? null,
        taxPct: (s.taxPct as number | null) ?? null,
        priceFallback: (s.priceFallback as number | null) ?? null,
        priceLive: (s.priceLive as boolean) ?? true,
        createdAt: new Date(s.createdAt as string),
      },
    });
    counts.incomeSources++;
  }

  for (const g of rows("goals")) {
    await prisma.goal.upsert({
      where: { id: g.id as string },
      update: {},
      create: {
        id: g.id as string,
        name: g.name as string,
        template: g.template as string,
        targetAmount: g.targetAmount as number,
        deadline: date(g.deadline),
        priority: (g.priority as number) ?? 0,
        plannedMonthly: (g.plannedMonthly as number | null) ?? null,
        status: (g.status as string) ?? "active",
        details: (g.details as string) ?? "{}",
        createdAt: new Date(g.createdAt as string),
      },
    });
    counts.goals++;
  }

  for (const ga of rows("goalAccounts")) {
    const key = { goalId: ga.goalId as string, accountId: ga.accountId as string };
    await prisma.goalAccount.upsert({
      where: { goalId_accountId: key },
      update: {},
      create: { ...key, share: (ga.share as number) ?? 1 },
    });
  }

  for (const c of rows("goalContributions")) {
    await prisma.goalContribution.upsert({
      where: { id: c.id as string },
      update: {},
      create: {
        id: c.id as string,
        goalId: c.goalId as string,
        memberId: (c.memberId as string | null) ?? null,
        label: c.label as string,
        amount: c.amount as number,
        currency: (c.currency as string | null) ?? null,
        expectedDate: date(c.expectedDate),
        received: (c.received as boolean) ?? false,
        createdAt: new Date(c.createdAt as string),
      },
    });
  }

  // Planner assumptions, merged over what's there so a partial file can't wipe them.
  const planner = body.plannerState as Row | null | undefined;
  if (planner && typeof planner.data === "string") {
    await prisma.plannerState.upsert({
      where: { id: "singleton" },
      update: { data: planner.data },
      create: { id: "singleton", data: planner.data },
    });
  }

  // Restore settings if present. Version 1 files kept baseCurrency in settings; it now lives in profile.
  const settings = body.settings as Row | undefined;
  if (settings?.theme) {
    const data = {
      theme: settings.theme as string,
      aiProvider: (settings.aiProvider as string | null) ?? null,
      aiModel: (settings.aiModel as string | null) ?? null,
    };
    await prisma.settings.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  }
  const profile = (body.profile as Row | null | undefined) ?? (settings?.baseCurrency ? { baseCurrency: settings.baseCurrency } : null);
  if (profile) {
    const data = {
      baseCurrency: (profile.baseCurrency as string) ?? "USD",
      ...(profile.householdType ? { householdType: profile.householdType as string } : {}),
      ...(profile.timeZone ? { timeZone: profile.timeZone as string } : {}),
      ...(profile.locale ? { locale: profile.locale as string } : {}),
      onboardedAt: date(profile.onboardedAt),
    };
    await prisma.profile.upsert({ where: { id: "singleton" }, update: data, create: { id: "singleton", ...data } });
  }

  return Response.json({ imported: counts });
}
