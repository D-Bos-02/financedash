import { describe, expect, it } from "vitest";
import { applyRulesToMerchant } from "@/lib/rules";

const rule = (pattern: string, category: string, priority = 0, subCategory: string | null = null, isTransfer = false) => ({
  pattern, category, priority, subCategory, isTransfer,
});

const rules = [
  rule("zelle", "Money Movement"),
  rule("zelle payment to oakview", "Housing", 20, "Rent"),
  rule("acme inc", "Income", 10, "Salary"),
];

describe("applyRulesToMerchant", () => {
  it("matches case-insensitively and prefers the higher priority rule", () => {
    expect(applyRulesToMerchant("Zelle payment to OAKVIEW PROPERTIES JPM99abc", rules)).toEqual({ category: "Housing", subCategory: "Rent", isTransfer: false });
  });

  it("always marks Money Movement as a transfer", () => {
    expect(applyRulesToMerchant("Zelle payment to Bob", rules)).toEqual({ category: "Money Movement", isTransfer: true });
  });

  it("tags the new employer's pay as salary", () => {
    expect(applyRulesToMerchant("ACME INC PAYROLL", rules)?.subCategory).toBe("Salary");
  });

  it("returns null when nothing matches", () => {
    expect(applyRulesToMerchant("Blue Bottle Coffee", rules)).toBeNull();
  });
});
