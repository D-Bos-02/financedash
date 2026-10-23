import { describe, expect, it } from "vitest";
import {
  DEFAULT_INPUTS,
  computePay,
  computePosition,
  derivePlannerView,
  estimateTaxDrag,
  projectGrowth,
  sanitizeInputs,
  summarizeBasis,
  upcomingVests,
  vestsBefore,
} from "@/lib/planner";
import type { ActualMonth } from "@/lib/actuals";
import { JOINT, type IncomeSource } from "@/lib/household";

const members = [{ id: "m1", name: "Alex", color: "#38bdf8" }, { id: "m2", name: "Sam", color: "#f472b6" }];
const source = (o: Partial<IncomeSource>): IncomeSource => ({
  id: "s", memberId: "m2", name: "Salary", type: "salary", payFrequency: "biweekly", depositPattern: "payroll", estimateMonthly: 0,
  ticker: null, sharesPerVest: 0, vestMonths: [], taxPct: 0, priceFallback: 0, priceLive: true, ...o,
});
const QUARTERLY = [1, 4, 7, 10];

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("sanitizeInputs", () => {
  it("keeps known values of the right type and drops the rest", () => {
    const out = sanitizeInputs({ rent: 6_000, bogus: 1, years: "x", lifestyle: NaN, includeMatch: true });
    expect(out.rent).toBe(6_000);
    expect(out.years).toBe(DEFAULT_INPUTS.years);
    expect(out.lifestyle).toBe(DEFAULT_INPUTS.lifestyle);
    expect(out).not.toHaveProperty("bogus");
    expect(out).not.toHaveProperty("includeMatch");
  });

  it("falls back to defaults for junk", () => {
    expect(sanitizeInputs(null)).toEqual(DEFAULT_INPUTS);
  });
});

describe("computePosition", () => {
  const account = (o: Partial<{ name: string; type: string; currency: string; balance: number; ownerId: string | null; updatedAt: Date; balanceMode: string }>) => ({
    name: "Acct", type: "checking", currency: "USD", balance: 0, ownerId: "m1", updatedAt: now, balanceMode: "plaid", ...o,
  });
  const position = computePosition(
    [
      account({ balance: 1_000 }),
      account({ type: "credit", balance: -300 }),
      account({ type: "investment", currency: "AUD", balance: 10_000, ownerId: null }),
      account({ type: "stock_plan", balance: 5_000, ownerId: "m2" }),
      account({ type: "savings", balance: 2_000, ownerId: "deleted-member" }),
      account({ name: "Euro savings", type: "savings", currency: "EUR", balance: 100, ownerId: "m2" }),
      account({ name: "Old manual", type: "savings", balance: 50, ownerId: "m2", balanceMode: "manual", updatedAt: daysAgo(40) }),
      account({ type: "property", balance: 900_000 }),
    ],
    [{ fromCurrency: "AUD", toCurrency: "USD", rate: 0.7 }],
    ["m1", "m2"],
    "USD"
  );

  it("nets credit cards out of cash", () => {
    expect(position.holdings.m1.cash).toBe(700);
  });

  it("converts currencies and treats shared accounts, and those of a deleted member, as joint", () => {
    expect(position.holdings[JOINT].invested).toBeCloseTo(7_000);
    expect(position.holdings[JOINT].cash).toBe(2_000);
  });

  it("keeps unvested stock separate and leaves property out", () => {
    expect(position.holdings.m2.unvested).toBe(5_000);
    expect(position.holdings.m2.invested).toBe(0);
    expect(position.holdings.m1.invested).toBe(0);
  });

  it("warns about missing FX rates and stale manual balances", () => {
    expect(position.holdings.m2.cash).toBe(50); // EUR account left out
    expect(position.warnings.some((w) => w.includes("Euro savings") && w.includes("EUR to USD"))).toBe(true);
    expect(position.warnings.some((w) => w.includes("Old manual") && w.includes("40 days"))).toBe(true);
  });

  it("converts into the base currency", () => {
    const eur = computePosition([account({ balance: 100, currency: "USD" })], [{ fromCurrency: "USD", toCurrency: "EUR", rate: 0.9 }], ["m1"], "EUR");
    expect(eur.holdings.m1.cash).toBeCloseTo(90);
  });
});

describe("computePay", () => {
  const tx = (memberId: string, merchant: string, amount: number, date: string) => ({ memberId, merchant, amount, date: new Date(`${date}T00:00:00Z`) });
  const at = new Date("2026-10-18T12:00:00Z");

  it("uses the median of the last 3 paydays from the matching source", () => {
    const pay = computePay([
      tx("m2", "ACME PAYROLL", 9_999, "2026-08-01"), // older than the last 3 paydays
      tx("m2", "ACME PAYROLL", 5_000, "2026-09-01"),
      tx("m2", "ACME PAYROLL", 5_100, "2026-09-15"),
      tx("m2", "ACME PAYROLL", 4_900, "2026-09-29"), // same payday, two deposits
      tx("m2", "ACME PAYROLL", 100, "2026-09-29"),
      tx("m1", "ACME PAYROLL", 7_777, "2026-09-30"), // someone else's account
    ], [source({})], members, at);
    expect(pay[0].member).toBe("Sam");
    expect(pay[0].perPaycheck).toBe(5_000);
    expect(pay[0].monthly).toBeCloseTo((5_000 * 26) / 12);
    expect(pay[0].lastPaid).toBe("Sep 29");
    expect(pay[0].basis).toBe("paychecks");
  });

  it("scales by the pay frequency", () => {
    const pay = computePay([tx("m2", "PAYROLL", 4_000, "2026-09-30")], [source({ payFrequency: "monthly" })], members, at);
    expect(pay[0].monthly).toBe(4_000);
  });

  it("falls back to the estimate until a matching deposit arrives", () => {
    const pay = computePay([tx("m2", "PREVIOUS EMPLOYER DEPOSIT", 4_100, "2026-10-14")], [source({ estimateMonthly: 5_000 })], members, at);
    expect(pay[0].perPaycheck).toBeNull();
    expect(pay[0].monthly).toBe(5_000);
    expect(pay[0].basis).toBe("estimate");
  });

  it("averages irregular income over the last 3 months", () => {
    const freelance = source({ type: "freelance", payFrequency: "irregular", depositPattern: "invoice" });
    const pay = computePay([
      tx("m2", "Invoice 12", 3_000, "2026-08-10"),
      tx("m2", "Invoice 13", 6_000, "2026-10-01"),
      tx("m2", "Invoice 9", 9_000, "2026-06-01"), // older than 90 days
    ], [freelance], members, at);
    expect(pay[0].monthly).toBe(3_000);
    expect(pay[0].basis).toBe("average");
  });

  it("matches household income on any account, and leaves equity vests out of pay", () => {
    const pay = computePay(
      [tx("m1", "TENANT RENT", 1_200, "2026-10-01")],
      [source({ memberId: null, name: "Rental", payFrequency: "monthly", depositPattern: "tenant" }), source({ id: "e", type: "equity_vest" })],
      members,
      at
    );
    expect(pay).toHaveLength(1);
    expect(pay[0].member).toBe("Household");
    expect(pay[0].monthly).toBe(1_200);
  });
});

describe("derivePlannerView", () => {
  const position = computePosition([], [], []);
  const month = (rent: number, equityBySource: Record<string, number> = {}): ActualMonth => ({
    key: "", label: "", income: 0, equityIncome: 0, equityBySource, rent, lifestyle: 0, coverage: null,
  });
  const grant = source({ id: "g", type: "equity_vest", ticker: "XYZ", sharesPerVest: 100, taxPct: 50, vestMonths: QUARTERLY, priceFallback: 200 });
  const data = { quotes: { XYZ: { price: 250, asOf: "" } }, pay: [], position, basis: null, members };
  const view = (actuals: ActualMonth[], overrides: Partial<typeof DEFAULT_INPUTS> = {}, sources: IncomeSource[] = []) =>
    derivePlannerView({ ...DEFAULT_INPUTS, ...overrides }, { ...data, actuals, sources });

  it("uses this month's rent once it's (nearly) all paid, otherwise last month's", () => {
    expect(view([month(3_350), month(3_200)]).inputs.rent).toBe(3_200);
    expect(view([month(3_200), month(2_000)]).inputs.rent).toBe(3_200);
    expect(view([month(3_200), month(6_000)]).inputs.rent).toBe(6_000);
  });

  it("uses the saved rent when live rent is off or there's no rent data", () => {
    expect(view([month(3_200), month(3_200)], { rentLive: false, rent: 4_000 }).inputs.rent).toBe(4_000);
    expect(view([month(0), month(0)], { rent: 4_000 }).inputs.rent).toBe(4_000);
  });

  it("values each vest at the live price unless overridden, and keeps it out of monthly pay", () => {
    const live = view([], {}, [grant]);
    expect(live.grants[0].price.value).toBe(250);
    expect(live.grants[0].perVest).toBe(12_500); // 100 x 250 x 50%
    expect(live.income.equityPerYear).toBe(50_000);
    expect(live.income.total).toBe(0); // no pay in this fixture, and vests aren't averaged in
    expect(view([], {}, [{ ...grant, priceLive: false }]).grants[0].price.value).toBe(200);
  });

  it("has no vests without an equity source", () => {
    const none = view([]);
    expect(none.grants).toEqual([]);
    expect(none.lumpAt(1)).toBe(0);
  });

  it("adds vests to the projection only in vest months, skipping this month's once it has landed", () => {
    const oct = new Date("2026-10-18T12:00:00Z");
    const received = derivePlannerView(DEFAULT_INPUTS, { ...data, sources: [grant], actuals: [month(0, { g: 9_400 })] }, oct);
    expect([1, 2, 3, 4, 5, 6, 7].map(received.lumpAt)).toEqual([0, 0, 0, 12_500, 0, 0, 12_500]); // Oct done; Jan, Apr next
    const pending = derivePlannerView(DEFAULT_INPUTS, { ...data, sources: [grant], actuals: [month(0)] }, oct);
    expect(pending.lumpAt(1)).toBe(12_500);
    expect(pending.vests[0].label).toBe("Oct 2026");
  });

  it("adds up several grants with their own schedules", () => {
    const oct = new Date("2026-10-18T12:00:00Z");
    const yearly = { ...grant, id: "y", vestMonths: [3], sharesPerVest: 10, priceLive: false, priceFallback: 100, taxPct: 0 };
    const v = derivePlannerView(DEFAULT_INPUTS, { ...data, sources: [grant, yearly], actuals: [month(0, { g: 1 })] }, oct);
    expect(v.income.equityPerYear).toBe(50_000 + 1_000);
    expect(v.lumpAt(6)).toBe(1_000); // March: the yearly grant only
    expect(v.vests.map((x) => x.label).slice(0, 2)).toEqual(["Jan 2027", "Mar 2027"]);
  });
});

describe("tax drag", () => {
  const at = new Date("2026-10-18T00:00:00Z");

  it("counts cash at zero gain and skips holdings without cost basis", () => {
    expect(
      summarizeBasis([
        { value: 100, costBasis: 80, type: "equity", updatedAt: at },
        { value: 50, costBasis: null, type: "cash", updatedAt: at },
        { value: 30, costBasis: null, type: "equity", updatedAt: at },
      ])
    ).toEqual({ coveredValue: 150, costBasis: 130, asOf: "2026-10-18" });
  });

  it("taxes net gains at the gains rate and the rest at the manual rate", () => {
    // 50 gain x 28% = 14, plus 100 without basis x 5% = 5 -> 19 / 300
    expect(estimateTaxDrag(300, { coveredValue: 200, costBasis: 150, asOf: null }, 28, 5).pct).toBe(6.3);
  });

  it("lets losses offset gains", () => {
    expect(estimateTaxDrag(300, { coveredValue: 200, costBasis: 250, asOf: null }, 28, 5).pct).toBe(1.7);
  });
});

describe("vests", () => {
  const oct = new Date("2026-10-18T12:00:00Z");

  it("lists upcoming quarterly vests (Jan, Apr, Jul, Oct)", () => {
    const vests = upcomingVests(13_500, 12, oct, 9_400, QUARTERLY);
    expect(vests.map((v) => [v.label, v.monthsAway])).toEqual([["Jan 2027", 3], ["Apr 2027", 6], ["Jul 2027", 9]]);
  });

  it("counts this month's vest until its sale lands", () => {
    expect(upcomingVests(13_500, 4, oct, 0, QUARTERLY).map((v) => v.label)).toEqual(["Oct 2026", "Jan 2027"]);
  });

  it("sums vests landing before a deadline, not in the deadline month", () => {
    const vests = upcomingVests(10_000, 24, oct, 9_400, QUARTERLY);
    expect(vestsBefore(vests, 11)).toBe(30_000); // Jan, Apr, Jul
    expect(vestsBefore(vests, 9)).toBe(20_000); // Jul is month 9: not counted
  });
});

describe("projectGrowth", () => {
  it("adds one-off lumps in their month, at the same savings rate", () => {
    const lump = (m: number) => (m === 3 ? 1_000 : 0);
    expect(projectGrowth(0, 1, 0, 0.5, 0, 0, 0, 0, lump).at(-1)?.value).toBe(500);
  });

  it("adds contributions and the match, with a higher contribution during free rent", () => {
    // 0% return: 12 months x (100 + 10 match)
    expect(projectGrowth(1_000, 1, 0, 1, 0, 100, 200, 10).at(-1)?.value).toBe(2_320);
    // 2 free-rent months at 210, then 10 at 110
    expect(projectGrowth(1_000, 1, 0, 1, 2, 100, 200, 10).at(-1)?.value).toBe(2_520);
  });

  it("compounds monthly", () => {
    expect(projectGrowth(1_000, 1, 0.12, 0, 0, 0, 0, 0).at(-1)?.value).toBe(Math.round(1_000 * 1.01 ** 12));
  });
});
