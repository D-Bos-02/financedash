import { describe, expect, it } from "vitest";
import { HOUSE_DEFAULTS, houseDetails, monthlyNeeded, runHomePlan, type HomePlanInputs } from "@/lib/home-plan";
import type { PlannerPosition } from "@/lib/planner";
import { JOINT } from "@/lib/household";

const position: PlannerPosition = {
  holdings: {
    m1: { cash: 10_000, invested: 100_000, retirement: 0, unvested: 0 },
    m2: { cash: 20_000, invested: 50_000, retirement: 0, unvested: 100_000 },
    [JOINT]: { cash: 10_000, invested: 40_000, retirement: 0, unvested: 0 },
  },
  asOf: null,
  warnings: [],
};

const members = [{ id: "m1", name: "Alex" }, { id: "m2", name: "Sam" }];
const gifts = [
  { memberId: "m1", amount: 10_000, received: false },
  { memberId: "m2", amount: 10_000, received: false },
];

const inputs: HomePlanInputs = {
  price: 1_000_000, depPct: 20, closePct: 2, reserve: 50_000, taxDrag: 10, mortgageRate: 6, mortgageYears: 30,
  keepPct: 0, fallbackMonths: 18, rent: 5_000, lifestyle: 4_000, retirementMonthly: 1_000,
  propTaxPct: 1.2, insuranceMonthly: 200, hoaMonthly: 0, maintenancePct: 1, pmiPct: 0.5,
};

describe("runHomePlan", () => {
  const plan = runHomePlan(inputs, position, 20_000, members, gifts);

  it("adds up the cash needed", () => {
    expect(plan.deposit).toBe(200_000);
    expect(plan.closing).toBe(20_000);
    expect(plan.reserveCash).toBe(50_000);
    expect(plan.totalNeeded).toBe(270_000);
  });

  it("pools both people's savings (joint split 50/50, investments after tax drag) and both gifts", () => {
    // Alex: cash 10k + 5k joint; invested (100k + 20k joint) x 0.9 = 108k -> 123k
    // Sam: cash 20k + 5k joint; invested (50k + 20k joint) x 0.9 = 63k -> 88k
    expect(plan.buyers.map((b) => b.savings)).toEqual([123_000, 88_000]);
    expect(plan.gifts).toBe(20_000); // 10k + 10k
    expect(plan.savings).toBe(211_000);
    expect(plan.availableNow).toBe(231_000);
    expect(plan.remainder).toBe(39_000);
  });

  it("leaves unvested stock out of the savings", () => {
    expect(plan.buyers.find((b) => b.key === "m2")?.unvested).toBe(100_000);
    expect(plan.savings).toBe(211_000);
  });

  it("works out the mortgage and the monthly cost of owning", () => {
    expect(plan.loan).toBe(800_000);
    expect(plan.monthlyPayment).toBeCloseTo(4_796.4, 1); // 30yr at 6%
    expect(plan.ownership.propertyTax).toBeCloseTo(1_000);
    expect(plan.ownership.maintenance).toBeCloseTo(833.33, 2);
    expect(plan.ownership.pmi).toBe(0);
    expect(plan.ownership.total).toBeCloseTo(6_829.73, 1);
    expect(plan.ownership.vsRent).toBeCloseTo(1_829.73, 1);
  });

  it("compares free cash before and after buying", () => {
    expect(plan.freeCashPerMonth).toBe(10_000); // 20k - 5k rent - 4k lifestyle - 1k retirement
    expect(plan.ownership.freeCashAfter).toBeCloseTo(8_170.27, 1);
  });

  it("counts kept investments as the reserve and sells less", () => {
    const kept = runHomePlan({ ...inputs, keepPct: 50 }, position, 20_000, members, gifts);
    expect(kept.keptValue).toBe(95_000); // half of 190k invested
    expect(kept.reserveCash).toBe(0);
    expect(kept.totalNeeded).toBe(220_000);
    expect(kept.savings).toBe(125_500); // 25k + 31.5k + 15k + 54k
    expect(kept.remainder).toBe(74_500);
  });

  it("adds mortgage insurance only below 20% down", () => {
    expect(runHomePlan({ ...inputs, depPct: 10 }, position, 20_000, members, gifts).ownership.pmi).toBeCloseTo(375); // 900k x 0.5% / 12
  });

  it("spreads the gap over the timeframe, and needs nothing when there's a surplus", () => {
    expect(monthlyNeeded(plan, 12)).toBe(3_250);
    expect(monthlyNeeded(plan, 12, 27_000)).toBe(1_000); // equity vests before the deadline cover most of the gap
    expect(monthlyNeeded(plan, 12, 50_000)).toBe(0);
    expect(monthlyNeeded(runHomePlan({ ...inputs, price: 100_000 }, position, 20_000, members, gifts), 12)).toBe(0);
  });
});

describe("runHomePlan with other households", () => {
  it("splits shared accounts equally between three people", () => {
    const three = [...members, { id: "m3", name: "Kai" }];
    const plan = runHomePlan({ ...inputs, taxDrag: 0 }, position, 20_000, three, []);
    expect(plan.buyers).toHaveLength(3);
    for (const b of plan.buyers) expect(b.jointShare).toBeCloseTo(50_000 / 3);
    expect(plan.savings).toBeCloseTo(230_000); // the whole pot, however it's split
  });

  it("gives a solo profile with no members the whole pot", () => {
    const solo: PlannerPosition = { holdings: { [JOINT]: { cash: 30_000, invested: 0, retirement: 0, unvested: 0 } }, asOf: null, warnings: [] };
    const plan = runHomePlan(inputs, solo, 8_000, [], [{ memberId: null, amount: 5_000, received: false }]);
    expect(plan.buyers).toHaveLength(1);
    expect(plan.savings).toBe(30_000);
    expect(plan.gifts).toBe(5_000);
  });

  it("counts only contributions still to come", () => {
    const plan = runHomePlan(inputs, position, 20_000, members, [{ memberId: "m1", amount: 10_000, received: true }, gifts[1]]);
    expect(plan.gifts).toBe(10_000);
    expect(plan.buyers[0].gift).toBe(0);
  });

  it("uses the mortgage term", () => {
    expect(runHomePlan({ ...inputs, mortgageYears: 15 }, position, 20_000, members, gifts).monthlyPayment).toBeCloseTo(6_750.85, 1);
  });
});

describe("houseDetails", () => {
  it("fills in defaults and drops junk", () => {
    expect(houseDetails({ price: 400_000, depPct: "x", other: 1 })).toEqual({ ...HOUSE_DEFAULTS, price: 400_000 });
  });
});
