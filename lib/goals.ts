// Progress and monthly need for every goal. The house template uses the full home purchase maths and
// debt payoff uses amortisation; the others work out what's left ÷ months remaining, with progress from
// the accounts linked to the goal.

import { deadlineIn, monthsUntil, type Goal, type GoalTemplate, type Member } from "@/lib/household";
import { HOUSE_DEFAULTS, houseDetails, monthlyNeeded, runHomePlan, type HomePlan } from "@/lib/home-plan";
import { computePosition, rateToBase, totalHoldings, vestsBefore, type PlannerPosition, type PlannerView } from "@/lib/planner";

export const DEFAULT_HOUSE_MONTHS = 12; // plan A when a house goal has no deadline yet

// Accounts funding a goal, each balance scaled by the share of it set aside for the goal.
export function linkedAccounts<A extends { id: string; balance: number }>(goal: Pick<Goal, "accounts">, accounts: A[]): A[] {
  return goal.accounts.flatMap((link) => {
    const acc = accounts.find((a) => a.id === link.accountId);
    return acc ? [{ ...acc, balance: acc.balance * link.share }] : [];
  });
}

interface AccountForGoals {
  id: string; name: string; type: string; currency: string; balance: number; ownerId: string | null; updatedAt: Date; balanceMode: string;
}

// What each goal has to work with. Linked goals see their linked accounts (by share). A house goal with
// nothing linked sees everything other goals haven't claimed, so the same savings aren't counted twice
// and a card a debt goal is paying off isn't charged to the house as well; other cards still net out of
// its cash. Debt goals read what's owed on their links.
export function goalInputs(goals: Goal[], accounts: AccountForGoals[], fxRates: { fromCurrency: string; toCurrency: string; rate: number }[], memberIds: string[], base: string) {
  const claimed = new Map<string, number>();
  for (const g of goals) for (const l of g.accounts) claimed.set(l.accountId, (claimed.get(l.accountId) ?? 0) + l.share);
  const unclaimed = accounts.map((a) => ({ ...a, balance: a.balance * Math.max(0, 1 - (claimed.get(a.id) ?? 0)) }));
  const rateOf = rateToBase(fxRates, base);
  // Debts in a currency without a saved rate count at face value, like the rest of the app.
  const toBase = (v: number, c: string) => v * (rateOf(c) ?? 1);

  const goalPositions: Record<string, PlannerPosition | null> = {};
  const goalDebts: Record<string, number | null> = {};
  for (const g of goals) {
    goalPositions[g.id] = g.accounts.length
      ? computePosition(linkedAccounts(g, accounts), fxRates, memberIds, base)
      : g.template === "house" ? computePosition(unclaimed, fxRates, memberIds, base) : null;
    if (g.template === "debt_payoff") goalDebts[g.id] = linkedDebt(g, accounts, toBase);
  }
  return { goalPositions, goalDebts };
}

export type GoalStatus = "reached" | "on_track" | "behind" | "no_deadline";

export interface GoalSummary {
  goal: Goal;
  target: number;
  saved: number; // linked cash plus investments after tax drag; for debts, how much has been paid off
  pending: number; // one-off contributions still to come
  remaining: number;
  months: number | null; // until the deadline
  neededMonthly: number | null; // null without a deadline
  plannedMonthly: number; // what the budget sets aside: the goal's own figure, else what's needed
  monthsAtPlan: number | null; // how long the planned amount takes; null if it never gets there
  status: GoalStatus;
  plan: HomePlan | null; // house goals only
  debt: { owed: number; aprPct: number; interestAtPlan: number | null } | null; // debt payoff goals only
}

export interface GoalContext {
  view: PlannerView;
  position: PlannerPosition; // the whole household
  goalPositions: Record<string, PlannerPosition | null>; // what each goal can count (see goalInputs); null when nothing
  goalDebts?: Record<string, number | null>; // owed on each debt goal's linked cards and loans; null when none are linked
  members: Pick<Member, "id" | "name">[];
  toBase?: (amount: number, currency: string | null) => number; // for contributions in another currency
}

// Converts a contribution to the base currency at the saved rate; without a rate it counts at face value.
export function contributionToBase(fxRates: { fromCurrency: string; toCurrency: string; rate: number }[], base: string) {
  const rateOf = rateToBase(fxRates, base);
  return (amount: number, currency: string | null) => (currency && currency !== base ? amount * (rateOf(currency) ?? 1) : amount);
}

// Monthly payment that clears `balance` in `months` at an annual rate (standard amortisation).
export function paymentToClear(balance: number, aprPct: number, months: number): number {
  if (balance <= 0) return 0;
  const n = Math.max(1, months);
  const r = aprPct / 100 / 12;
  return r > 0 ? (balance * r) / (1 - Math.pow(1 + r, -n)) : balance / n;
}

// Months until `balance` is cleared paying `payment` a month, and the interest paid on the way.
// null when the payment doesn't cover the interest, so the debt never clears.
export function clearDebt(balance: number, aprPct: number, payment: number): { months: number; interest: number } | null {
  if (balance <= 0) return { months: 0, interest: 0 };
  const r = aprPct / 100 / 12;
  if (payment <= balance * r || payment <= 0) return null;
  const exact = r > 0 ? -Math.log(1 - (balance * r) / payment) / Math.log(1 + r) : balance / payment;
  return { months: Math.ceil(exact - 1e-9), interest: Math.max(0, payment * exact - balance) };
}

// Amount owed on a debt goal's linked cards and loans (balances may be stored negative), in the base currency.
export function linkedDebt<A extends { id: string; type: string; balance: number; currency: string }>(
  goal: Pick<Goal, "accounts">,
  accounts: A[],
  toBase: (amount: number, currency: string) => number
): number | null {
  const debts = linkedAccounts(goal, accounts).filter((a) => a.type === "credit" || a.type === "loan");
  return debts.length ? debts.reduce((s, a) => s + Math.abs(toBase(a.balance, a.currency)), 0) : null;
}

function statusOf(remaining: number, needed: number | null, planned: number): GoalStatus {
  if (remaining <= 0.5) return "reached";
  if (needed === null) return "no_deadline";
  return planned + 0.5 >= needed ? "on_track" : "behind";
}

// Months until `remaining` is covered by `monthly` savings plus lump sums (e.g. equity vests) landing on the
// way; lumpAt(m) is the lump in month m, 1 = this month. Matches monthlyNeeded, which counts the same lumps.
// null if it isn't covered within 50 years.
export function monthsWithLumps(remaining: number, monthly: number, lumpAt: (m: number) => number): number | null {
  if (remaining <= 0) return 0;
  let covered = 0;
  for (let m = 1; m <= 600; m++) {
    covered += monthly + lumpAt(m);
    if (covered >= remaining - 0.5) return m;
  }
  return null;
}

export function summarizeGoal(goal: Goal, ctx: GoalContext, now = new Date()): GoalSummary {
  const { view } = ctx;
  const contributions = ctx.toBase ? goal.contributions.map((c) => ({ ...c, amount: ctx.toBase!(c.amount, c.currency) })) : goal.contributions;
  const pending = contributions.filter((c) => !c.received).reduce((s, c) => s + c.amount, 0);
  const deadlineMonths = goal.deadline ? monthsUntil(goal.deadline, now) : null;
  const atPlan = (remaining: number, planned: number) => (remaining <= 0 ? 0 : planned > 0 ? Math.ceil(remaining / planned) : null);

  if (goal.template === "house") {
    // Without goalInputs, a house goal falls back to the whole household pot.
    const position = ctx.goalPositions[goal.id] ?? ctx.position;
    const { rent, lifestyle, retirementMonthly, taxDrag } = view.inputs;
    const plan = runHomePlan({ ...houseDetails(goal.details), rent, lifestyle, retirementMonthly, taxDrag }, position, view.income.total, ctx.members, contributions);
    const months = deadlineMonths ?? DEFAULT_HOUSE_MONTHS;
    const need = monthlyNeeded(plan, months, vestsBefore(view.vests, months));
    const remaining = Math.max(0, plan.remainder);
    const planned = goal.plannedMonthly ?? need;
    return {
      goal, target: plan.totalNeeded, saved: plan.savings, pending: plan.gifts, remaining,
      months, neededMonthly: need, plannedMonthly: planned, monthsAtPlan: monthsWithLumps(remaining, planned, view.lumpAt),
      status: statusOf(remaining, need, planned), plan, debt: null,
    };
  }

  if (goal.template === "debt_payoff") {
    // Progress is what's been paid off since the starting balance (the target). Without linked
    // cards or loans there's nothing to read, so the whole target counts as still owed.
    const aprPct = Number(goal.details.aprPct) || 0;
    const owed = ctx.goalDebts?.[goal.id] ?? goal.targetAmount;
    const target = Math.max(goal.targetAmount, owed);
    const remaining = Math.max(0, owed - pending);
    const need = deadlineMonths ? paymentToClear(remaining, aprPct, deadlineMonths) : null;
    const planned = goal.plannedMonthly ?? need ?? 0;
    const cleared = clearDebt(remaining, aprPct, planned);
    return {
      goal, target, saved: target - owed, pending, remaining,
      months: deadlineMonths, neededMonthly: need, plannedMonthly: planned, monthsAtPlan: cleared?.months ?? null,
      status: statusOf(remaining, need, planned), plan: null,
      debt: { owed, aprPct, interestAtPlan: cleared?.interest ?? null },
    };
  }

  const position = ctx.goalPositions[goal.id];
  const h = position ? totalHoldings(position) : null;
  const saved = h ? h.cash + h.invested * (1 - view.inputs.taxDrag / 100) : 0;
  const remaining = Math.max(0, goal.targetAmount - saved - pending);
  const need = deadlineMonths ? remaining / deadlineMonths : null;
  const planned = goal.plannedMonthly ?? need ?? 0;
  return {
    goal, target: goal.targetAmount, saved, pending, remaining,
    months: deadlineMonths, neededMonthly: need, plannedMonthly: planned, monthsAtPlan: atPlan(remaining, planned),
    status: statusOf(remaining, need, planned), plan: null, debt: null,
  };
}

// What other goals take from pay each month while a house goal is saved for over `months`: each one's
// planned amount for as long as it runs before then (until it's reached at that amount, else the whole
// time), averaged over the months. Reached goals take nothing.
export function otherGoalsMonthly(summaries: GoalSummary[], houseId: string, months: number): number {
  const n = Math.max(1, months);
  const total = summaries
    .filter((s) => s.goal.id !== houseId && s.status !== "reached")
    .reduce((sum, s) => sum + s.plannedMonthly * Math.min(n, s.monthsAtPlan ?? n), 0);
  return total / n;
}

// Savings already in accounts linked to other goals, which an unlinked house goal leaves out.
export function claimedByOtherGoals(summaries: GoalSummary[], houseId: string): number {
  return summaries.filter((s) => s.goal.id !== houseId && s.goal.accounts.length > 0 && !s.debt).reduce((sum, s) => sum + s.saved, 0);
}

// Active goals in funding order.
export function byPriority<G extends Pick<Goal, "priority" | "name">>(goals: G[]): G[] {
  return [...goals].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

// Starting values when a goal is created from a template; all editable. Amounts are in the base currency.
const TEMPLATE_STARTS: Record<GoalTemplate, { name: string; target: number; months: number }> = {
  emergency_fund: { name: "Emergency fund", target: 10000, months: 12 },
  house: { name: "Home", target: 0, months: DEFAULT_HOUSE_MONTHS },
  car: { name: "Car", target: 20000, months: 18 },
  bike: { name: "Bike", target: 2500, months: 6 },
  wedding: { name: "Wedding", target: 25000, months: 18 },
  travel: { name: "Travel", target: 5000, months: 9 },
  debt_payoff: { name: "Pay off debt", target: 10000, months: 24 },
  custom: { name: "Savings goal", target: 5000, months: 12 },
};

// A new goal from a template. An emergency fund aims for six months of spending once that's known;
// a house goal's target comes from its details, so it starts with the house defaults instead.
export function goalFromTemplate(template: GoalTemplate, monthlySpend: number, priority: number, now = new Date()) {
  const start = TEMPLATE_STARTS[template];
  const target = template === "emergency_fund" && monthlySpend > 0 ? Math.round((monthlySpend * 6) / 500) * 500 : start.target;
  return {
    name: start.name,
    template,
    targetAmount: target,
    deadline: deadlineIn(start.months, now),
    priority,
    details: template === "house" ? { ...HOUSE_DEFAULTS } : {},
  };
}

// Rule-of-thumb lifestyle budget: living costs (rent + everything else) at most 80% of take-home pay,
// leaving at least 20% for goals and retirement. Rounded down to 50.
export function suggestLifestyle(takeHome: number, rent: number): number {
  return Math.max(0, Math.floor((takeHome * 0.8 - rent) / 50) * 50);
}
