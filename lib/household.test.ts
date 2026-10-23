import { describe, expect, it } from "vitest";
import { MEMBER_COLORS, makeMoney, matchesSource, monthsUntil, nextMemberColor, parseVestMonths, toGoal } from "@/lib/household";

describe("parseVestMonths", () => {
  it("keeps valid months, sorted and unique", () => {
    expect(parseVestMonths("[10, 1, 4, 4, 13, 0, 2.5]")).toEqual([1, 4, 10]);
  });

  it("treats junk as no vests", () => {
    expect(parseVestMonths("not json")).toEqual([]);
    expect(parseVestMonths('{"a":1}')).toEqual([]);
    expect(parseVestMonths(null)).toEqual([]);
  });
});

describe("matchesSource", () => {
  const source = { memberId: "m1", depositPattern: "Payroll" };

  it("matches the pattern in the merchant or subcategory, case-insensitively", () => {
    expect(matchesSource({ merchant: "ACME PAYROLL", memberId: "m1" }, source)).toBe(true);
    expect(matchesSource({ merchant: "Transfer", subCategory: "Payroll", memberId: "m1" }, source)).toBe(true);
    expect(matchesSource({ merchant: "Refund", memberId: "m1" }, source)).toBe(false);
  });

  it("matches the member's own or shared accounts, never another member's", () => {
    expect(matchesSource({ merchant: "ACME PAYROLL", memberId: "m2" }, source)).toBe(false);
    expect(matchesSource({ merchant: "ACME PAYROLL", memberId: null }, source)).toBe(true); // paid into a joint account
    expect(matchesSource({ merchant: "ACME PAYROLL", memberId: null }, { ...source, memberId: null })).toBe(true);
  });

  it("never matches without a pattern", () => {
    expect(matchesSource({ merchant: "anything", memberId: "m1" }, { ...source, depositPattern: null })).toBe(false);
  });
});

describe("monthsUntil", () => {
  const now = new Date("2026-10-18T12:00:00Z");

  it("counts calendar months, at least 1", () => {
    expect(monthsUntil("2027-10-01T00:00:00Z", now)).toBe(12);
    expect(monthsUntil("2026-10-30T00:00:00Z", now)).toBe(1);
    expect(monthsUntil("2025-01-01T00:00:00Z", now)).toBe(1);
  });
});

describe("makeMoney", () => {
  it("formats whole amounts in the base currency", () => {
    const usd = makeMoney("USD");
    expect(usd.fmt(1234.6)).toBe("$1,235");
    expect(usd.fmt(-50)).toBe("-$50");
    expect(usd.compact(1_500_000)).toBe("$1.5M");
    expect(usd.symbol).toBe("$");
    expect(makeMoney("EUR", "de-DE").fmt(1234)).toBe("1.234\u00a0€"); // Intl puts a non-breaking space before the symbol
  });
});

describe("toGoal", () => {
  it("accepts dates as Date objects or ISO strings", () => {
    const row = { id: "g", name: "Car", template: "car", status: "active", targetAmount: 1, priority: 0, plannedMonthly: null, details: "{bad", accounts: [], contributions: [] };
    expect(toGoal({ ...row, deadline: new Date("2027-01-01T00:00:00Z") }).deadline).toBe("2027-01-01T00:00:00.000Z");
    expect(toGoal({ ...row, deadline: "2027-01-01T00:00:00.000Z" }).deadline).toBe("2027-01-01T00:00:00.000Z");
    expect(toGoal({ ...row, deadline: null, template: "yacht" })).toMatchObject({ deadline: null, template: "custom", details: {} });
  });
});

describe("nextMemberColor", () => {
  it("picks the first unused colour", () => {
    expect(nextMemberColor([])).toBe(MEMBER_COLORS[0]);
    expect(nextMemberColor([MEMBER_COLORS[0]])).toBe(MEMBER_COLORS[1]);
  });
});
