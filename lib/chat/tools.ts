// Read-only tools for the chat assistant. The code does the arithmetic; the model explains it.
// Every result carries the dates it's based on, so answers can say how fresh the numbers are.
// Amounts are in the profile's base currency unless a field says otherwise.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadFinanceData } from "@/lib/finance-data";
import { computeActuals } from "@/lib/actuals";
import { houseDetails, monthlyNeeded, runHomePlan } from "@/lib/home-plan";
import { SCENARIOS, projectGrowth, vestsBefore } from "@/lib/planner";
import { byPriority, claimedByOtherGoals, otherGoalsMonthly, summarizeGoal, type GoalSummary } from "@/lib/goals";
import { GOAL_TEMPLATES, makeMoney } from "@/lib/household";
import { countsTowardNetWorth, netWorthAt, signedBalance } from "@/lib/net-worth";
import { loadToBase } from "@/lib/fx";
import { monthsAgo } from "@/lib/formatters";

type FinanceData = Awaited<ReturnType<typeof loadFinanceData>>;

const round = (v: number) => Math.round(v);
const day = (d: Date) => d.toISOString().slice(0, 10);
const json = (v: unknown) => JSON.stringify(v);

// Dates arrive as YYYY-MM-DD; transactions are stored at UTC midnight.
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const SHARED = "shared";

function range(start?: string, end?: string, defaultDays = 30) {
  const to = end ? new Date(`${end}T23:59:59Z`) : new Date();
  const from = start ? new Date(`${start}T00:00:00Z`) : new Date(to.getTime() - defaultDays * 86400000);
  return { from, to };
}

function goalJson(s: GoalSummary, accountName: (id: string) => string, memberName: (id: string | null) => string) {
  return {
    id: s.goal.id,
    name: s.goal.name,
    template: GOAL_TEMPLATES.find((t) => t.value === s.goal.template)?.label ?? s.goal.template,
    priority: s.goal.priority,
    deadline: s.goal.deadline?.slice(0, 10) ?? null,
    months_to_deadline: s.months,
    target: round(s.target),
    saved: round(s.saved),
    contributions_to_come: round(s.pending),
    remaining: round(s.remaining),
    needed_per_month: s.neededMonthly === null ? null : round(s.neededMonthly),
    planned_per_month: round(s.plannedMonthly),
    planned_source: s.goal.plannedMonthly === null ? "what the deadline needs" : "set in the Planner",
    status: s.status,
    months_at_planned_amount: s.monthsAtPlan,
    ...(s.debt && {
      debt: {
        still_owed: round(s.debt.owed),
        paid_off_so_far: round(s.saved),
        apr_pct: s.debt.aprPct,
        interest_at_planned_amount: s.debt.interestAtPlan === null ? null : round(s.debt.interestAtPlan),
        note: s.monthsAtPlan === null && s.plannedMonthly > 0 ? "The planned payment doesn't cover the interest, so the debt never clears." : undefined,
      },
    }),
    funded_from: s.goal.accounts.length
      ? s.goal.accounts.map((a) => ({ account: accountName(a.accountId), share_pct: round(a.share * 100) }))
      : s.goal.template === "house" ? "all accounts (none linked)" : "no accounts linked yet",
    contributions: s.goal.contributions.map((c) => ({ label: c.label, from: memberName(c.memberId), amount: round(c.amount), currency: c.currency ?? "base", received: c.received })),
  };
}

export function createTools(data: FinanceData) {
  const { accounts, position, goalPositions, goalDebts, actuals, pay, view, holdings, members, sources, goals, settings, toBase } = data;
  const currency = settings.baseCurrency;
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? SHARED;
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "archived account";
  const summaries = () => byPriority(goals).map((g) => summarizeGoal(g, { view, position, goalPositions, goalDebts, members, toBase }));
  const houseGoals = goals.filter((g) => g.template === "house");
  const memberNames = [...members.map((m) => m.name), SHARED];

  // A member filter: their name, or "shared" for accounts with no owner.
  const MemberFilter = z.string().optional().describe(`Only accounts owned by this member: one of ${memberNames.map((n) => `"${n}"`).join(", ")}`);
  function ownerWhere(member: string | undefined): { ok: true; where: object } | { ok: false; error: string } {
    if (!member) return { ok: true, where: {} };
    if (member.toLowerCase() === SHARED || member.toLowerCase() === "joint") return { ok: true, where: { account: { ownerId: null } } };
    const m = members.find((x) => x.name.toLowerCase() === member.toLowerCase());
    return m ? { ok: true, where: { account: { ownerId: m.id } } } : { ok: false, error: json({ error: `Unknown member "${member}". Use one of: ${memberNames.join(", ")}` }) };
  }

  const getAccounts = betaZodTool({
    name: "get_accounts",
    description:
      "Current balance of every active account (converted to the base currency), net worth in total and by owner, FX rates, and when each balance was last updated. Use for net worth, balances, cash and investment questions.",
    inputSchema: z.object({}),
    run: async () => {
      const toBase = await loadToBase();
      const rows = accounts.map((a) => ({
        name: a.name,
        institution: a.institution || null,
        type: a.type,
        owner: memberName(a.ownerId),
        currency: a.currency,
        balance_in_account_currency: round(a.balance),
        balance: round(signedBalance(a.type, toBase(a.balance, a.currency))),
        source: a.balanceMode,
        updated: day(a.updatedAt),
      }));
      const counted = rows.filter((r) => countsTowardNetWorth(r.type));
      const byOwner: Record<string, number> = {};
      for (const r of counted) byOwner[r.owner] = (byOwner[r.owner] ?? 0) + r.balance;
      const netWorth = counted.reduce((s, r) => s + r.balance, 0);
      const unvested = rows.filter((r) => !countsTowardNetWorth(r.type)).reduce((s, r) => s + r.balance, 0);
      return json({
        currency,
        net_worth: netWorth,
        unvested_stock_not_counted: unvested,
        net_worth_including_unvested: netWorth + unvested,
        by_owner: byOwner,
        fx_rates: data.fxRates.map((r) => ({ from: r.fromCurrency, to: r.toCurrency, rate: r.rate })),
        balances_as_of: position.asOf,
        warnings: position.warnings,
        accounts: rows,
      });
    },
  });

  const getHoldings = betaZodTool({
    name: "get_holdings",
    description:
      "Brokerage positions from Plaid: each security's value, cost basis and unrealised gain, by account and owner, plus the estimated tax if investments were sold (e.g. for a deposit).",
    inputSchema: z.object({}),
    run: async () => {
      const est = view.taxDrag.estimate;
      return json({
        currency,
        holdings: holdings.map((h) => ({
          account: h.account.name,
          owner: memberName(h.account.ownerId),
          security: h.name,
          ticker: h.ticker,
          type: h.type,
          quantity: h.quantity,
          value: round(h.value),
          cost_basis: h.costBasis === null ? null : round(h.costBasis),
          unrealised_gain: h.costBasis === null ? null : round(h.value - h.costBasis),
        })),
        tax_on_selling: est
          ? {
              effective_pct_in_use: view.inputs.taxDrag,
              source: view.taxDrag.live ? "cost basis estimate" : "manual override",
              estimated_pct_from_cost_basis: est.pct,
              net_unrealised_gain: round(est.gains),
              value_with_cost_basis: round(est.coveredValue),
              value_without_cost_basis: round(est.uncoveredValue),
              rate_on_gains_pct: view.inputs.gainsTaxPct,
              rate_without_basis_pct: est.manualPct,
            }
          : null,
        as_of: est?.asOf ?? null,
        note: "Unvested stock and manually tracked accounts have no holdings detail. Gains are treated as long-term; short-term gains may be taxed higher.",
      });
    },
  });

  const getSpending = betaZodTool({
    name: "get_spending",
    description:
      "Spending totals between two dates, grouped by category, merchant, month or member. Excludes transfers between your own accounts and income; refunds reduce spending. Defaults to the last 30 days.",
    inputSchema: z.object({
      start_date: DateStr.optional().describe("Inclusive start, YYYY-MM-DD"),
      end_date: DateStr.optional().describe("Inclusive end, YYYY-MM-DD"),
      group_by: z.enum(["category", "merchant", "month", "member"]).default("category"),
      category: z.string().optional().describe("Only this category, e.g. 'Food & Dining'"),
      member: MemberFilter,
      top: z.number().int().min(1).max(50).default(15),
    }),
    run: async (input) => {
      const owner = ownerWhere(input.member);
      if (!owner.ok) return owner.error;
      const { from, to } = range(input.start_date, input.end_date);
      const txs = await prisma.transaction.findMany({
        where: {
          date: { gte: from, lte: to },
          isTransfer: false,
          category: input.category ? input.category : { not: "Income" },
          ...owner.where,
        },
        select: { date: true, amount: true, merchant: true, category: true, account: { select: { ownerId: true } } },
      });
      const groups = new Map<string, { total: number; count: number }>();
      for (const t of txs) {
        const key =
          input.group_by === "category" ? t.category
          : input.group_by === "merchant" ? t.merchant
          : input.group_by === "month" ? t.date.toISOString().slice(0, 7)
          : memberName(t.account.ownerId);
        const g = groups.get(key) ?? { total: 0, count: 0 };
        g.total -= t.amount; // spending is negative in the data
        g.count++;
        groups.set(key, g);
      }
      const rows = [...groups.entries()]
        .map(([key, g]) => ({ [input.group_by]: key, spent: round(g.total), transactions: g.count }))
        .sort((a, b) => (input.group_by === "month" ? String(a.month).localeCompare(String(b.month)) : b.spent - a.spent))
        .slice(0, input.group_by === "month" ? undefined : input.top);
      return json({
        period: { start: day(from), end: day(to) },
        total_spent: round(txs.reduce((s, t) => s - t.amount, 0)),
        groups: rows,
        note: "Rent is the Housing category (subcategory Rent). Synced transactions only; amounts are in each account's own currency.",
      });
    },
  });

  const searchTransactions = betaZodTool({
    name: "search_transactions",
    description:
      "Find individual transactions by merchant text, category, member, date range or minimum size. Returns up to 50, newest first. Use to answer 'what was this charge', 'when did we last pay X', or to check a total.",
    inputSchema: z.object({
      query: z.string().optional().describe("Case-insensitive text to match in the merchant description"),
      category: z.string().optional(),
      member: MemberFilter,
      start_date: DateStr.optional(),
      end_date: DateStr.optional(),
      min_abs_amount: z.number().min(0).optional().describe("Only transactions at least this size, in or out"),
      include_transfers: z.boolean().default(false),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async (input) => {
      const owner = ownerWhere(input.member);
      if (!owner.ok) return owner.error;
      const { from, to } = range(input.start_date, input.end_date, 365);
      const txs = await prisma.transaction.findMany({
        where: {
          date: { gte: from, lte: to },
          ...(input.include_transfers ? {} : { isTransfer: false }),
          ...(input.category ? { category: input.category } : {}),
          ...owner.where,
          ...(input.min_abs_amount ? { OR: [{ amount: { gte: input.min_abs_amount } }, { amount: { lte: -input.min_abs_amount } }] } : {}),
        },
        orderBy: { date: "desc" },
        take: 2000,
        select: {
          date: true, merchant: true, amount: true, currency: true, category: true, subCategory: true, isTransfer: true, pending: true,
          account: { select: { name: true, ownerId: true } },
        },
      });
      const q = input.query?.toLowerCase();
      const matched = q ? txs.filter((t) => t.merchant.toLowerCase().includes(q)) : txs;
      return json({
        period: { start: day(from), end: day(to) },
        matches: matched.length,
        total: round(matched.reduce((s, t) => s + t.amount, 0) * 100) / 100,
        transactions: matched.slice(0, input.limit).map((t) => ({
          date: day(t.date),
          merchant: t.merchant,
          amount: t.amount,
          currency: t.currency,
          category: t.subCategory ? `${t.category} › ${t.subCategory}` : t.category,
          transfer: t.isTransfer,
          pending: t.pending,
          account: t.account.name,
          owner: memberName(t.account.ownerId),
        })),
        note: "Negative amounts are money out.",
      });
    },
  });

  const getMonthlyActuals = betaZodTool({
    name: "get_monthly_actuals",
    description:
      "Actual income, rent, lifestyle spending and money left over for each recent calendar month, from transactions. Flags months where someone's history is incomplete. Compare against the plan from get_plan.",
    inputSchema: z.object({ months: z.number().int().min(1).max(12).default(3) }),
    run: async ({ months }) => {
      const [txs, firsts] = await Promise.all([
        prisma.transaction.findMany({
          where: { date: { gte: monthsAgo(months) } },
          select: { date: true, amount: true, merchant: true, category: true, subCategory: true, isTransfer: true, account: { select: { ownerId: true } } },
        }),
        prisma.$queryRaw<{ ownerId: string; first: string }[]>`
          SELECT a.ownerId AS ownerId, MIN(t.date) AS first FROM "Transaction" t
          JOIN Account a ON a.id = t.accountId WHERE a.ownerId IS NOT NULL GROUP BY a.ownerId`,
      ]);
      const rows = computeActuals(
        txs.map(({ account, ...t }) => ({ ...t, memberId: account.ownerId })),
        { firstDates: Object.fromEntries(firsts.map((f) => [f.ownerId, new Date(f.first)])), members, sources },
        months
      );
      return json({
        currency,
        months: rows.map((m) => ({
          month: m.label,
          income: round(m.income),
          of_which_equity_vests: round(m.equityIncome),
          rent: round(m.rent),
          lifestyle: round(m.lifestyle),
          left_over: round(m.income - m.rent - m.lifestyle),
          data_gaps: m.coverage,
        })),
        note: "Equity vests land as lumps in their vest months. Rent paid from the 25th counts toward the next month. The current month is partial.",
      });
    },
  });

  const getPlan = betaZodTool({
    name: "get_plan",
    description:
      "The plan as set in the Planner: members, monthly budget, take-home pay per income source and where each figure comes from (paychecks, average or estimate), equity grants and upcoming vests, a summary of each goal, starting position by owner and data warnings.",
    inputSchema: z.object({}),
    run: async () => {
      const i = view.inputs;
      return json({
        currency,
        household: { type: settings.householdType, members: members.map((m) => m.name) },
        monthly_budget: {
          rent: round(i.rent), rent_source: view.rent.live ? "actual payments" : "manual", lifestyle: i.lifestyle,
          retirement_contributions: i.retirementMonthly, employer_retirement_match: i.matchMonthly,
          goals: summaries().map((s) => ({ goal: s.goal.name, planned_per_month: round(s.plannedMonthly) })),
        },
        take_home_pay_monthly: {
          total: round(view.income.total),
          note: "Regular pay only. Equity vests are not averaged into monthly pay; they arrive as lumps (see equity).",
          sources: pay.map((p) => ({
            member: p.member, source: p.source, monthly: round(p.monthly),
            basis: p.basis === "paychecks" ? `median of last 3 paychecks, ${round(p.perPaycheck ?? 0)} each, latest ${p.lastPaid}`
              : p.basis === "average" ? `average of the last 3 months, latest ${p.lastPaid}` : "estimate (no matching deposit yet)",
          })),
        },
        equity: view.grants.map((g) => ({
          member: g.member, source: g.source.name, ticker: g.source.ticker, vest_months: g.source.vestMonths,
          shares_per_vest: g.source.sharesPerVest, share_price: g.price.value,
          price_source: g.price.live ? `live, ${g.price.quote?.asOf}` : "manual", tax_pct: g.source.taxPct,
          per_vest_after_tax: round(g.perVest), per_year_after_tax: round(g.perYear),
          upcoming: g.vests.slice(0, 4).map((v) => ({ month: v.label, months_away: v.monthsAway, amount: round(v.amount) })),
        })),
        goals: summaries().map((s) => ({ name: s.goal.name, remaining: round(s.remaining), needed_per_month: s.neededMonthly === null ? null : round(s.neededMonthly) })),
        starting_position: {
          investments_incl_retirement: round(view.start.invested), cash_net_of_cards: round(view.start.cash),
          total: round(view.start.total), unvested_stock_not_counted: round(view.start.unvested),
          by_owner: Object.fromEntries(Object.entries(position.holdings).map(([k, h]) => [memberName(k), {
            cash: round(h.cash), invested: round(h.invested), retirement: round(h.retirement), unvested: round(h.unvested),
          }])),
        },
        balances_as_of: position.asOf,
        warnings: position.warnings,
      });
    },
  });

  const getGoals = betaZodTool({
    name: "get_goals",
    description:
      "Every active goal in priority order: target, progress (saved in linked accounts, or paid off for debts), contributions still to come, what's left, deadline, amount needed per month, what the budget plans per month, on-track status and how many months the planned amount takes. Debts include what's owed, the APR and interest at the planned payment. Also the total planned against free cash from pay.",
    inputSchema: z.object({}),
    run: async () => {
      const list = summaries();
      const free = view.income.total - view.inputs.rent - view.inputs.lifestyle - view.inputs.retirementMonthly;
      const planned = list.reduce((s, g) => s + g.plannedMonthly, 0);
      return json({
        currency,
        goals: list.map((s) => goalJson(s, accountName, memberName)),
        total_planned_per_month: round(planned),
        free_cash_per_month_from_pay: round(free),
        left_after_goals: round(free - planned),
        note: goals.length
          ? "House goals include deposit, closing costs and reserve, and subtract equity vests expected before the deadline (use run_home_plan for details). Debt payments needed include interest. status: on_track, behind, reached or no_deadline."
          : "No goals set up yet. They can be added in Settings.",
        balances_as_of: position.asOf,
      });
    },
  });

  const runHomePlanTool = betaZodTool({
    name: "run_home_plan",
    description:
      "Run a home purchase goal with its saved assumptions, optionally overriding any of them for a what-if. Returns cash needed, what's available now, the gap, equity vests expected before each deadline, savings needed per month from pay for each timeframe, what other goals take from pay each month before then, free cash per month from pay now, and the full monthly cost of owning (mortgage, property tax, insurance, HOA, maintenance, mortgage insurance) with free cash per month after buying.",
    inputSchema: z.object({
      goal: z.string().optional().describe(`Which house goal, by name; defaults to the first. One of: ${houseGoals.map((g) => `"${g.name}"`).join(", ")}`),
      price: z.number().positive().optional(),
      deposit_pct: z.number().min(0).max(100).optional(),
      closing_costs_pct: z.number().min(0).max(20).optional(),
      reserve: z.number().min(0).optional().describe("Cash to keep after closing"),
      keep_invested_pct: z.number().min(0).max(100).optional().describe("% of investment portfolios left unsold"),
      tax_drag_pct: z.number().min(0).max(60).optional(),
      mortgage_rate_pct: z.number().min(0).max(20).optional(),
      mortgage_years: z.number().int().min(1).max(40).optional(),
      lifestyle: z.number().min(0).optional().describe("Monthly lifestyle spend"),
      rent: z.number().min(0).optional(),
      property_tax_pct: z.number().min(0).max(5).optional(),
      insurance_monthly: z.number().min(0).optional(),
      hoa_monthly: z.number().min(0).optional(),
      maintenance_pct: z.number().min(0).max(5).optional(),
      months: z.array(z.number().int().min(1).max(120)).max(4).optional().describe("Timeframes to evaluate; defaults to the deadline (plan A) and plan B"),
    }),
    run: async (o) => {
      const goal = o.goal ? houseGoals.find((g) => g.name.toLowerCase() === o.goal!.toLowerCase()) : houseGoals[0];
      if (!goal) return json({ error: `No house goal named "${o.goal}". House goals: ${houseGoals.map((g) => g.name).join(", ")}` });
      const summary = summarizeGoal(goal, { view, position, goalPositions, goalDebts, members, toBase });
      const d = houseDetails(goal.details);
      const i = view.inputs;
      const inputs = {
        ...d,
        price: o.price ?? d.price,
        depPct: o.deposit_pct ?? d.depPct,
        closePct: o.closing_costs_pct ?? d.closePct,
        reserve: o.reserve ?? d.reserve,
        keepPct: o.keep_invested_pct ?? d.keepPct,
        mortgageRate: o.mortgage_rate_pct ?? d.mortgageRate,
        mortgageYears: o.mortgage_years ?? d.mortgageYears,
        propTaxPct: o.property_tax_pct ?? d.propTaxPct,
        insuranceMonthly: o.insurance_monthly ?? d.insuranceMonthly,
        hoaMonthly: o.hoa_monthly ?? d.hoaMonthly,
        maintenancePct: o.maintenance_pct ?? d.maintenancePct,
        taxDrag: o.tax_drag_pct ?? i.taxDrag,
        lifestyle: o.lifestyle ?? i.lifestyle,
        rent: o.rent ?? i.rent,
        retirementMonthly: i.retirementMonthly,
      };
      const contributions = goal.contributions.map((c) => ({ ...c, amount: toBase(c.amount, c.currency) }));
      const plan = runHomePlan(inputs, goalPositions[goal.id] ?? position, view.income.total, members, contributions);
      const months = o.months ?? [summary.months ?? 12, d.fallbackMonths];
      const all = summaries();
      return json({
        currency,
        goal: goal.name,
        assumptions: {
          price: inputs.price, deposit_pct: inputs.depPct, closing_pct: inputs.closePct, reserve: inputs.reserve,
          keep_invested_pct: inputs.keepPct, tax_drag_pct: inputs.taxDrag, mortgage_rate_pct: inputs.mortgageRate,
          mortgage_years: inputs.mortgageYears, rent: round(inputs.rent), lifestyle: inputs.lifestyle,
        },
        cash_needed: {
          deposit: round(plan.deposit), closing: round(plan.closing), reserve_in_cash: round(plan.reserveCash),
          investments_kept_as_reserve: round(plan.keptValue), total: round(plan.totalNeeded),
        },
        available_now: { savings_after_tax_drag: round(plan.savings), contributions_to_come: round(plan.gifts), total: round(plan.availableNow) },
        by_buyer: plan.buyers.map((b) => ({ name: b.name, savings: round(b.savings), contributions_to_come: round(b.gift), unvested_not_counted: round(b.unvested) })),
        gap: round(plan.remainder),
        free_cash_per_month: round(plan.freeCashPerMonth),
        savings_in_accounts_linked_to_other_goals_not_counted: goal.accounts.length ? 0 : round(claimedByOtherGoals(all, goal.id)),
        timeframes: months.map((m) => {
          const vests = vestsBefore(view.vests, m);
          const need = monthlyNeeded(plan, m, vests);
          const others = otherGoalsMonthly(all, goal.id, m);
          return {
            months: m,
            equity_vests_before_deadline: round(vests),
            savings_needed_per_month_from_pay: round(need),
            other_goals_per_month_from_pay: round(others),
            spare_pay_per_month: round(plan.freeCashPerMonth - others - need),
          };
        }),
        mortgage: { loan: round(plan.loan), rate_pct: inputs.mortgageRate, years: inputs.mortgageYears, principal_and_interest_per_month: round(plan.monthlyPayment) },
        after_purchase_monthly: {
          mortgage: round(plan.ownership.principalInterest),
          property_tax: round(plan.ownership.propertyTax),
          insurance: round(plan.ownership.insurance),
          hoa: round(plan.ownership.hoa),
          maintenance: round(plan.ownership.maintenance),
          mortgage_insurance: round(plan.ownership.pmi),
          total_cost_of_owning: round(plan.ownership.total),
          more_than_current_rent_by: round(plan.ownership.vsRent),
          free_cash_per_month_after_buying: round(plan.ownership.freeCashAfter),
          note: "Free cash = take-home less owning costs, lifestyle and retirement contributions. Tax deductions are not included.",
        },
        balances_as_of: position.asOf,
      });
    },
  });

  const projectPortfolio = betaZodTool({
    name: "project_portfolio",
    description:
      "Project the portfolio over a number of years under conservative (6%), base (8%) and aggressive (10%) returns, with the saved budget or overrides. Returns year-by-year values and when 500k and 1M (base currency) are reached in the base case.",
    inputSchema: z.object({
      years: z.number().int().min(1).max(40).optional(),
      rent: z.number().min(0).optional(),
      lifestyle: z.number().min(0).optional(),
      employer_match_monthly: z.number().min(0).optional(),
      free_rent_months: z.number().int().min(0).max(24).optional(),
    }),
    run: async (o) => {
      const i = view.inputs;
      const years = o.years ?? i.years;
      const rent = o.rent ?? i.rent;
      const lifestyle = o.lifestyle ?? i.lifestyle;
      const match = o.employer_match_monthly ?? i.matchMonthly;
      const freeRent = o.free_rent_months ?? i.freeRent;
      const investableFreeRent = view.income.total - lifestyle;
      const monthlyInvestable = investableFreeRent - rent;
      const scenarios = SCENARIOS.map((s) => {
        const data = projectGrowth(view.start.total, years, s.rate, s.savingsRate, freeRent, monthlyInvestable, investableFreeRent, match, view.lumpAt);
        return { name: s.label, annual_return_pct: round(s.rate * 100), share_of_surplus_invested_pct: round(s.savingsRate * 100), by_year: data };
      });
      const base = scenarios[1].by_year;
      return json({
        currency,
        start: round(view.start.total),
        monthly_investable: round(monthlyInvestable),
        assumptions: {
          years, rent: round(rent), lifestyle, employer_match_monthly: match, free_rent_months: freeRent,
          take_home_pay_monthly: round(view.income.total), equity_vests_per_year: round(view.income.equityPerYear),
        },
        scenarios,
        base_case_milestones: {
          reach_500k_year: base.find((d) => d.value >= 500000)?.year ?? null,
          reach_1m_year: base.find((d) => d.value >= 1000000)?.year ?? null,
        },
        note: "Equity vests are added in their vest months. Excludes one-off goal contributions, unvested stock, taxes on gains and fees.",
      });
    },
  });

  const getWeeklyCheckin = betaZodTool({
    name: "get_weekly_checkin",
    description:
      "Everything for the weekly check-in: net worth change over 7 days, last 7 days' spending vs the weekly lifestyle budget, this month so far vs plan, each goal's monthly need vs plan, and data freshness.",
    inputSchema: z.object({}),
    run: async () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 86400000);
      const [toBase, snapshots, weekTxs, items] = await Promise.all([
        loadToBase(),
        prisma.balanceSnapshot.findMany({ include: { account: { select: { type: true, isActive: true } } } }),
        prisma.transaction.findMany({
          where: { date: { gte: weekAgo }, isTransfer: false, category: { not: "Income" } },
          select: { amount: true, category: true, subCategory: true },
        }),
        prisma.plaidItem.findMany({ where: { status: { not: "removed" } }, select: { institutionName: true, status: true, lastSyncedAt: true } }),
      ]);

      const nowWorth = netWorthAt(snapshots, now, toBase);
      const weekAgoWorth = netWorthAt(snapshots, weekAgo, toBase);
      // History is complete from the date the most recently tracked active account got its first balance.
      const firstByAccount = new Map<string, Date>();
      for (const s of snapshots) {
        if (!s.account.isActive || !countsTowardNetWorth(s.account.type)) continue;
        const f = firstByAccount.get(s.accountId);
        if (!f || s.date < f) firstByAccount.set(s.accountId, s.date);
      }
      const historyFrom = [...firstByAccount.values()].reduce<Date | null>((m, d) => (!m || d > m ? d : m), null);

      const rentThisWeek = weekTxs.filter((t) => t.category === "Housing" && t.subCategory === "Rent").reduce((s, t) => s - t.amount, 0);
      const byCategory: Record<string, number> = {};
      for (const t of weekTxs) {
        if (t.category === "Housing" && t.subCategory === "Rent") continue;
        byCategory[t.category] = (byCategory[t.category] ?? 0) - t.amount;
      }
      const weekLifestyle = Object.values(byCategory).reduce((s, v) => s + v, 0);
      const weeklyBudget = (view.inputs.lifestyle * 12) / 52;

      const month = actuals[actuals.length - 1];
      const daysIn = now.getUTCDate();
      const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
      const payThisMonth = (month?.income ?? 0) - (month?.equityIncome ?? 0);
      const list = summaries();

      return json({
        today: day(now),
        currency,
        net_worth: {
          now: nowWorth === null ? null : round(nowWorth),
          seven_days_ago: weekAgoWorth === null ? null : round(weekAgoWorth),
          change: nowWorth !== null && weekAgoWorth !== null ? round(nowWorth - weekAgoWorth) : null,
          note: weekAgoWorth === null
            ? `Full balance history only starts ${historyFrom ? day(historyFrom) : "today"}, so there is no 7-day comparison yet.`
            : "Excludes unvested stock; includes market moves.",
        },
        last_7_days: {
          lifestyle_spent: round(weekLifestyle),
          weekly_lifestyle_budget: round(weeklyBudget),
          over_under: round(weekLifestyle - weeklyBudget),
          rent_paid: round(rentThisWeek),
          top_categories: Object.entries(byCategory).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a).slice(0, 5).map(([c, v]) => ({ category: c, amount: round(v) })),
        },
        month_to_date: {
          month: month?.label,
          day: `${daysIn} of ${daysInMonth}`,
          pay: round(payThisMonth),
          equity_vests: round(month?.equityIncome ?? 0),
          rent: round(month?.rent ?? 0),
          lifestyle: round(month?.lifestyle ?? 0),
          lifestyle_plan_prorated: round((view.inputs.lifestyle * daysIn) / daysInMonth),
          left_over_from_pay: round(payThisMonth - (month?.rent ?? 0) - (month?.lifestyle ?? 0)),
        },
        goals: {
          each: list.map((s) => ({
            goal: s.goal.name,
            remaining: round(s.remaining),
            months_to_deadline: s.months,
            needed_per_month: s.neededMonthly === null ? null : round(s.neededMonthly),
            planned_per_month: round(s.plannedMonthly),
            status: s.status,
          })),
          total_planned_per_month: round(list.reduce((s, g) => s + g.plannedMonthly, 0)),
          free_cash_per_month_from_pay_planned: round(view.income.total - view.inputs.rent - view.inputs.lifestyle - view.inputs.retirementMonthly),
          next_equity_vest: view.vests[0] ? { month: view.vests[0].label, source: view.vests[0].source, amount: round(view.vests[0].amount) } : null,
        },
        freshness: {
          bank_syncs: items.map((i) => ({ institution: i.institutionName, status: i.status, last_synced: i.lastSyncedAt?.toISOString() ?? null })),
          balances_as_of: position.asOf,
          warnings: position.warnings,
        },
      });
    },
  });

  return [
    getAccounts, getHoldings, getSpending, searchTransactions, getMonthlyActuals, getPlan, getGoals,
    ...(houseGoals.length ? [runHomePlanTool] : []),
    projectPortfolio, getWeeklyCheckin,
  ];
}

// A short brief of the household and its goals for the system prompt.
export function householdBrief(data: FinanceData): string {
  const { view, members, settings, goals, position, goalPositions, goalDebts, toBase } = data;
  const { fmt } = makeMoney(settings.baseCurrency, settings.locale);
  const i = view.inputs;
  const who = members.length > 1 ? `A household of ${members.length}: ${members.map((m) => m.name).join(", ")}.`
    : members.length === 1 ? `One person: ${members[0].name}.` : "One person or household (no members set up yet).";
  const goalLines = byPriority(goals).map((g) => {
    const s = summarizeGoal(g, { view, position, goalPositions, goalDebts, members, toBase });
    const when = s.months ? ` in ${s.months} months` : "";
    if (s.plan) {
      const d = houseDetails(g.details);
      return `- ${g.name}: buy a home for about ${fmt(d.price)} with ${d.depPct}% down${when}; ${fmt(s.target)} cash needed, ${fmt(s.remaining)} to go.`;
    }
    if (s.debt) return `- ${g.name}: pay off debt${when}; ${fmt(s.debt.owed)} owed at ${s.debt.aprPct}% APR.`;
    return `- ${g.name}: ${fmt(s.target)} target${when}, ${fmt(s.remaining)} to go.`;
  });
  return [
    who,
    `Base currency: ${settings.baseCurrency}. Time zone: ${settings.timeZone}.`,
    goalLines.length ? `Goals, in priority order:\n${goalLines.join("\n")}` : "No savings goals set up yet.",
    view.grants.length
      ? `Equity: about ${fmt(view.income.equityPerYear)} a year after tax from vests (${view.grants.map((g) => g.source.name).join(", ")}); they're lumps, not monthly income.`
      : "",
    `Monthly: take-home pay about ${fmt(view.income.total)} (regular pay only), rent ${fmt(i.rent)}, lifestyle budget ${fmt(i.lifestyle)}, retirement contributions ${fmt(i.retirementMonthly)}.`,
  ].filter(Boolean).join("\n");
}
