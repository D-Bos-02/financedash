import { describe, expect, it } from "vitest";
import { byPriority, claimedByOtherGoals, clearDebt, contributionToBase, goalFromTemplate, goalInputs, linkedAccounts, linkedDebt, monthsWithLumps, otherGoalsMonthly, paymentToClear, suggestLifestyle, summarizeGoal, type GoalContext, type GoalSummary } from "@/lib/goals";
import { HOUSE_DEFAULTS } from "@/lib/home-plan";
import { DEFAULT_INPUTS, computePosition, derivePlannerView } from "@/lib/planner";
import { JOINT, type Goal } from "@/lib/household";

const now = new Date("2026-10-18T12:00:00Z");
const members = [{ id: "m1", name: "Alex", color: "" }];
const account = (id: string, type: string, balance: number) => ({
  id, name: id, type, currency: "USD", balance, ownerId: "m1", updatedAt: now, balanceMode: "plaid",
});
const accounts = [account("savings", "savings", 8_000), account("brokerage", "investment", 10_000)];
const position = computePosition(accounts, [], ["m1"]);

const goal = (o: Partial<Goal>): Goal => ({
  id: "g", name: "Car", template: "car", status: "active", targetAmount: 20_000, deadline: "2027-10-01T00:00:00Z",
  priority: 0, plannedMonthly: null, details: {}, accounts: [], contributions: [], ...o,
});

function ctx(goals: Goal[], inputs = DEFAULT_INPUTS): GoalContext {
  const view = derivePlannerView({ ...inputs, taxDrag: 10 }, { quotes: {}, actuals: [], pay: [], position, basis: null, sources: [], members });
  return {
    view,
    position,
    members,
    goalPositions: Object.fromEntries(goals.map((g) => [g.id, g.accounts.length ? computePosition(linkedAccounts(g, accounts), [], ["m1"]) : null])),
  };
}

describe("linkedAccounts", () => {
  it("scales each linked balance by its share and skips missing accounts", () => {
    const linked = linkedAccounts({ accounts: [{ accountId: "savings", share: 0.25 }, { accountId: "gone", share: 1 }] }, accounts);
    expect(linked.map((a) => [a.id, a.balance])).toEqual([["savings", 2_000]]);
  });
});

describe("summarizeGoal", () => {
  it("spreads what's left over the months to the deadline, with progress from linked accounts", () => {
    const car = goal({
      accounts: [{ accountId: "savings", share: 0.5 }, { accountId: "brokerage", share: 1 }],
      contributions: [{ id: "c", memberId: null, label: "Trade-in", amount: 3_000, currency: null, expectedDate: null, received: false }],
    });
    const s = summarizeGoal(car, ctx([car]), now);
    expect(s.saved).toBe(4_000 + 9_000); // half the savings, plus investments after 10% tax drag
    expect(s.pending).toBe(3_000);
    expect(s.remaining).toBe(4_000);
    expect(s.months).toBe(12);
    expect(s.neededMonthly).toBeCloseTo(4_000 / 12);
    expect(s.plannedMonthly).toBeCloseTo(4_000 / 12);
  });

  it("counts nothing saved when no accounts are linked, and needs nothing per month without a deadline", () => {
    const s = summarizeGoal(goal({ deadline: null }), ctx([goal({})]), now);
    expect(s.saved).toBe(0);
    expect(s.neededMonthly).toBeNull();
    expect(s.plannedMonthly).toBe(0);
  });

  it("uses the goal's own monthly figure when set", () => {
    expect(summarizeGoal(goal({ plannedMonthly: 750 }), ctx([]), now).plannedMonthly).toBe(750);
  });

  it("runs the home purchase maths for a house goal, drawing on every account when none are linked", () => {
    const house = goal({ template: "house", details: { price: 100_000, depPct: 20, closePct: 0, reserve: 0 } });
    const s = summarizeGoal(house, ctx([house]), now);
    expect(s.plan).not.toBeNull();
    expect(s.target).toBe(20_000);
    expect(s.saved).toBe(8_000 + 9_000);
    expect(s.remaining).toBe(3_000);
    expect(s.neededMonthly).toBeCloseTo(250);
    expect(s.plan!.buyers[0].key).toBe("m1");
    expect(position.holdings[JOINT].cash).toBe(0);
  });
});

describe("byPriority", () => {
  it("orders by priority, then name", () => {
    const list = byPriority([goal({ name: "B", priority: 1 }), goal({ name: "Z", priority: 0 }), goal({ name: "A", priority: 1 })]);
    expect(list.map((g) => g.name)).toEqual(["Z", "A", "B"]);
  });
});

describe("goalFromTemplate", () => {
  it("sizes an emergency fund at six months of spending once that's known", () => {
    expect(goalFromTemplate("emergency_fund", 3_100, 0, now).targetAmount).toBe(18_500);
    expect(goalFromTemplate("emergency_fund", 0, 0, now).targetAmount).toBe(10_000);
  });

  it("starts a house goal from the house defaults, with a deadline", () => {
    const house = goalFromTemplate("house", 0, 2, now);
    expect(house.details).toEqual(HOUSE_DEFAULTS);
    expect(house.priority).toBe(2);
    expect(house.deadline).toBe("2027-10-01T00:00:00.000Z");
  });
});

describe("suggestLifestyle", () => {
  it("keeps living costs to 80% of take-home pay", () => {
    expect(suggestLifestyle(5_000, 1_500)).toBe(2_500);
    expect(suggestLifestyle(5_030, 0)).toBe(4_000);
    expect(suggestLifestyle(2_000, 2_500)).toBe(0);
  });
});

describe("debt maths", () => {
  it("works out the payment that clears a balance by a deadline", () => {
    expect(paymentToClear(12_000, 0, 12)).toBe(1_000);
    expect(paymentToClear(10_000, 12, 12)).toBeCloseTo(888.49, 2); // 1% a month
    expect(paymentToClear(0, 20, 12)).toBe(0);
  });

  it("works out how long a payment takes, and the interest on the way", () => {
    expect(clearDebt(12_000, 0, 1_000)).toEqual({ months: 12, interest: 0 });
    const cleared = clearDebt(10_000, 12, 888.49)!;
    expect(cleared.months).toBe(12);
    expect(cleared.interest).toBeCloseTo(661.88, 0);
    expect(clearDebt(10_000, 12, 100)).toBeNull(); // 100 doesn't cover 1% interest
  });

  it("reads what's owed from linked cards and loans only, by share and in the base currency", () => {
    const accts = [
      { id: "card", type: "credit", balance: -2_000, currency: "USD" },
      { id: "loan", type: "loan", balance: 1_000, currency: "EUR" },
      { id: "cash", type: "checking", balance: 5_000, currency: "USD" },
    ];
    const toBase = (v: number, c: string) => (c === "EUR" ? v * 1.1 : v);
    const goal = { accounts: [{ accountId: "card", share: 1 }, { accountId: "loan", share: 0.5 }, { accountId: "cash", share: 1 }] };
    expect(linkedDebt(goal, accts, toBase)).toBeCloseTo(2_550);
    expect(linkedDebt({ accounts: [{ accountId: "cash", share: 1 }] }, accts, toBase)).toBeNull();
  });
});

describe("summarizeGoal for debts", () => {
  const debt = goal({ template: "debt_payoff", name: "Card", targetAmount: 6_000, details: { aprPct: 18 } });

  it("counts paid-off as progress and the payment needed with interest", () => {
    const c = { ...ctx([debt]), goalDebts: { g: 4_000 } };
    const s = summarizeGoal(debt, c, now);
    expect(s.saved).toBe(2_000);
    expect(s.remaining).toBe(4_000);
    expect(s.neededMonthly).toBeCloseTo(paymentToClear(4_000, 18, 12));
    expect(s.status).toBe("on_track");
    expect(s.debt?.owed).toBe(4_000);
    expect(s.debt?.interestAtPlan).toBeGreaterThan(0);
  });

  it("treats the whole target as owed without linked accounts, and flags a payment that's too low", () => {
    const s = summarizeGoal({ ...debt, plannedMonthly: 50 }, ctx([debt]), now);
    expect(s.remaining).toBe(6_000);
    expect(s.monthsAtPlan).toBeNull(); // 50 a month doesn't cover 1.5% interest on 6,000
    expect(s.status).toBe("behind");
  });
});

describe("goal status and time at the planned amount", () => {
  it("is on track, behind, reached, or open-ended", () => {
    const base = ctx([]);
    expect(summarizeGoal(goal({ plannedMonthly: 2_000 }), base, now)).toMatchObject({ status: "on_track", monthsAtPlan: 10 });
    expect(summarizeGoal(goal({ plannedMonthly: 1_000 }), base, now)).toMatchObject({ status: "behind", monthsAtPlan: 20 });
    expect(summarizeGoal(goal({ targetAmount: 0 }), base, now)).toMatchObject({ status: "reached", monthsAtPlan: 0 });
    expect(summarizeGoal(goal({ deadline: null, plannedMonthly: 500 }), base, now)).toMatchObject({ status: "no_deadline", monthsAtPlan: 40 });
    expect(summarizeGoal(goal({ deadline: null }), base, now).monthsAtPlan).toBeNull();
  });
});

describe("goalInputs", () => {
  const acct = (id: string, type: string, balance: number) => ({ ...account(id, type, balance), name: id });
  const all = [acct("savings", "savings", 8_000), acct("brokerage", "investment", 10_000), acct("card", "credit", -1_000), acct("other card", "credit", -300)];
  const emergency = goal({ id: "e", accounts: [{ accountId: "savings", share: 0.75 }] });
  const card = goal({ id: "d", template: "debt_payoff", accounts: [{ accountId: "card", share: 1 }] });
  const house = goal({ id: "h", template: "house" });
  const { goalPositions, goalDebts } = goalInputs([emergency, card, house], all, [], ["m1"], "USD");

  it("gives linked goals their linked share", () => {
    expect(goalPositions.e!.holdings.m1.cash).toBe(6_000);
  });

  it("gives an unlinked house goal only what other goals haven't claimed, net of cards no goal is paying off", () => {
    expect(goalPositions.h!.holdings.m1.cash).toBe(2_000 - 300);
    expect(goalPositions.h!.holdings.m1.invested).toBe(10_000);
  });

  it("reads debts from linked cards and loans", () => {
    expect(goalDebts.d).toBe(1_000);
    expect(goalDebts.e).toBeUndefined();
  });
});

describe("house goals with equity vests", () => {
  it("need nothing per month when vests cover the gap, and finish when the vest lands", () => {
    const grant = { id: "v", memberId: "m1", name: "Stock", type: "equity_vest" as const, payFrequency: "quarterly" as const, depositPattern: null,
      estimateMonthly: 0, ticker: null, sharesPerVest: 100, vestMonths: [1, 4, 7, 10], taxPct: 0, priceFallback: 100, priceLive: false };
    const view = derivePlannerView(DEFAULT_INPUTS, { quotes: {}, actuals: [], pay: [], position, basis: null, sources: [grant], members }, now);
    const house = goal({ template: "house", deadline: "2028-10-01T00:00:00Z", details: { price: 100_000, depPct: 20, closePct: 0, reserve: 0 } });
    const s = summarizeGoal(house, { view, position, goalPositions: {}, members }, now);
    expect(s.remaining).toBeGreaterThan(0);
    expect(s.neededMonthly).toBe(0);
    expect(s.monthsAtPlan).toBe(1); // October is a vest month and its vest hasn't landed yet
    expect(s.status).toBe("on_track");
  });
});

describe("monthsWithLumps", () => {
  it("adds lump sums to monthly savings", () => {
    expect(monthsWithLumps(1_000, 100, () => 0)).toBe(10);
    expect(monthsWithLumps(1_000, 100, (m) => (m === 3 ? 500 : 0))).toBe(5);
    expect(monthsWithLumps(0, 0, () => 0)).toBe(0);
    expect(monthsWithLumps(1_000, 0, () => 0)).toBeNull();
  });
});

describe("other goals against a house", () => {
  const summary = (id: string, o: Partial<GoalSummary>): GoalSummary => ({
    goal: goal({ id }), target: 0, saved: 0, pending: 0, remaining: 1, months: null, neededMonthly: null,
    plannedMonthly: 0, monthsAtPlan: null, status: "on_track", plan: null, debt: null, ...o,
  });

  it("averages what other goals take from pay over the months to the deadline", () => {
    const list = [
      summary("house", { plannedMonthly: 3_000 }),
      summary("car", { plannedMonthly: 600, monthsAtPlan: 6 }), // done halfway through a 12 month plan
      summary("trip", { plannedMonthly: 200 }), // no end in sight: runs the whole time
      summary("bike", { plannedMonthly: 500, status: "reached" }),
    ];
    expect(otherGoalsMonthly(list, "house", 12)).toBe(500);
    expect(otherGoalsMonthly(list, "house", 6)).toBe(800);
  });

  it("counts savings linked to other goals, but not debts", () => {
    const list = [
      summary("house", { saved: 50_000 }),
      summary("car", { saved: 4_000, goal: goal({ id: "car", accounts: [{ accountId: "savings", share: 0.5 }] }) }),
      summary("card", { saved: 1_000, goal: goal({ id: "card", accounts: [{ accountId: "visa", share: 1 }] }), debt: { owed: 0, aprPct: 0, interestAtPlan: null } }),
      summary("trip", { saved: 0 }),
    ];
    expect(claimedByOtherGoals(list, "house")).toBe(4_000);
  });
});

describe("contributions in another currency", () => {
  it("convert at the saved rate, or count at face value without one", () => {
    const toBase = contributionToBase([{ fromCurrency: "GBP", toCurrency: "USD", rate: 1.25 }], "USD");
    expect(toBase(20_000, "GBP")).toBe(25_000);
    expect(toBase(5_000, null)).toBe(5_000);
    expect(toBase(5_000, "USD")).toBe(5_000);
    expect(toBase(1_000, "EUR")).toBe(1_000);
  });

  it("count toward a goal in the base currency", () => {
    const trip = goal({ contributions: [{ id: "c", memberId: null, label: "Gift", amount: 2_000, currency: "GBP", expectedDate: null, received: false }] });
    const toBase = contributionToBase([{ fromCurrency: "GBP", toCurrency: "USD", rate: 1.25 }], "USD");
    expect(summarizeGoal(trip, { ...ctx([trip]), toBase }, now).pending).toBe(2_500);
  });
});
