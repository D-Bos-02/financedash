import { describe, expect, it } from "vitest";
import { computeActuals } from "@/lib/actuals";
import type { IncomeSource } from "@/lib/household";

const tx = (date: string, amount: number, category: string, subCategory: string | null = null, isTransfer = false, merchant = "") => ({
  date: new Date(`${date}T00:00:00Z`), amount, category, subCategory, isTransfer, merchant, memberId: "m2",
});

const vests: IncomeSource = {
  id: "g", memberId: "m2", name: "Stock", type: "equity_vest", payFrequency: "quarterly", depositPattern: "broker sale", estimateMonthly: 0,
  ticker: "XYZ", sharesPerVest: 10, vestMonths: [1, 4, 7, 10], taxPct: 40, priceFallback: 100, priceLive: true,
};

describe("computeActuals", () => {
  const months = computeActuals(
    [
      tx("2026-09-08", -5_000, "Housing", "Rent"),
      tx("2026-09-07", -1_000, "Housing"), // furniture: lifestyle, not rent
      tx("2026-09-26", -2_000, "Housing", "Rent"), // paid early: counts toward October
      tx("2026-10-02", -3_000, "Housing", "Rent"),
      tx("2026-10-05", -100, "Food & Dining"),
      tx("2026-10-06", 30, "Other"), // refund
      tx("2026-10-09", 5_000, "Income", "Salary"),
      tx("2026-10-17", 10_000, "Income", null, false, "BROKER SALE PROCEEDS"),
      tx("2026-10-10", -999, "Money Movement", null, true), // transfer: ignored
    ],
    {
      firstDates: { m1: new Date("2025-01-01T00:00:00Z"), m2: new Date("2026-09-18T00:00:00Z") },
      members: [{ id: "m1", name: "Alex", color: "" }, { id: "m2", name: "Sam", color: "" }],
      sources: [vests],
    },
    2,
    new Date("2026-10-18T12:00:00Z")
  );
  const [sep, oct] = months;

  it("labels the months, marking the current one as partial", () => {
    expect(sep.label).toBe("Sep");
    expect(oct.label).toBe("Oct (to Oct 18)");
  });

  it("counts only rent as rent, with early payments in the next month", () => {
    expect(sep.rent).toBe(5_000);
    expect(oct.rent).toBe(5_000);
  });

  it("puts all other spending in lifestyle, net of refunds, and ignores transfers", () => {
    expect(sep.lifestyle).toBe(1_000);
    expect(oct.lifestyle).toBe(70);
  });

  it("totals income and separates equity vests, matched by their source's pattern", () => {
    expect(oct.income).toBe(15_000);
    expect(oct.equityIncome).toBe(10_000);
    expect(oct.equityBySource).toEqual({ g: 10_000 });
  });

  it("flags months where someone's history is incomplete", () => {
    expect(sep.coverage).toBe("Sam from Sep 18");
    expect(oct.coverage).toBeNull();
  });
});
