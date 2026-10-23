import { describe, expect, it } from "vitest";
import { countsTowardNetWorth, monthlyNetWorth, netWorthAt, signedBalance } from "@/lib/net-worth";

const snap = (accountId: string, date: string, balance: number, type = "checking", isActive = true, currency = "USD") => ({
  accountId, date: new Date(`${date}T00:00:00Z`), balance, currency, account: { type, isActive },
});

const snapshots = [
  snap("chk", "2026-09-30", 900),
  snap("chk", "2026-10-01", 1_000),
  snap("chk", "2026-10-15", 1_500),
  snap("card", "2026-10-10", 200, "credit"),
  snap("old", "2026-10-05", 99_999, "savings", false),
];

describe("net worth", () => {
  it("counts everything except unvested stock", () => {
    expect(countsTowardNetWorth("stock_plan")).toBe(false);
    expect(countsTowardNetWorth("investment")).toBe(true);
  });

  it("counts liabilities as negative whatever their sign", () => {
    expect(signedBalance("credit", 200)).toBe(-200);
    expect(signedBalance("loan", -200)).toBe(-200);
    expect(signedBalance("savings", 200)).toBe(200);
  });

  it("uses each account's latest balance in the month, not every daily snapshot", () => {
    expect(monthlyNetWorth(snapshots)).toEqual([
      { date: "2026-09", netWorth: 900 },
      { date: "2026-10", netWorth: 1_300 },
    ]);
  });

  it("skips archived accounts", () => {
    expect(monthlyNetWorth(snapshots).some((m) => m.netWorth > 50_000)).toBe(false);
  });

  it("converts currencies", () => {
    expect(monthlyNetWorth([snap("aud", "2026-10-01", 1_000, "savings", true, "AUD")], (a, c) => (c === "AUD" ? a * 0.7 : a))).toEqual([
      { date: "2026-10", netWorth: 700 },
    ]);
  });

  it("leaves unvested stock out of history and past-date net worth", () => {
    const withStock = [...snapshots, snap("rsu", "2026-09-01", 250_000, "stock_plan")];
    expect(monthlyNetWorth(withStock)).toEqual(monthlyNetWorth(snapshots));
    expect(netWorthAt(withStock, new Date("2026-10-12T00:00:00Z"))).toBe(800);
  });

  it("gives net worth on a past date only when every account was already tracked", () => {
    expect(netWorthAt(snapshots, new Date("2026-10-12T00:00:00Z"))).toBe(800);
    expect(netWorthAt(snapshots, new Date("2026-10-05T00:00:00Z"))).toBeNull(); // the card had no balance yet
  });
});
