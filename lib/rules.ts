import type { CategoryRule } from "@/app/generated/prisma/client";
import { MONEY_MOVEMENT } from "@/lib/categories";

export interface RawRow {
  merchant: string;
  category?: string;
}

type RuleFields = Pick<CategoryRule, "pattern" | "category" | "subCategory" | "isTransfer" | "priority">;

export function applyRules(rows: RawRow[], rules: RuleFields[]): RawRow[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);

  return rows.map((row) => {
    if (row.category && row.category !== "Other") return row;
    const merchant = row.merchant.toLowerCase();
    for (const rule of sorted) {
      if (merchant.includes(rule.pattern.toLowerCase())) {
        return {
          ...row,
          category: rule.category,
          ...(rule.subCategory ? { subCategory: rule.subCategory } : {}),
        };
      }
    }
    return row;
  });
}

export function applyRulesToMerchant(
  merchant: string,
  rules: RuleFields[]
): { category: string; subCategory?: string; isTransfer: boolean } | null {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const m = merchant.toLowerCase();
  for (const rule of sorted) {
    if (m.includes(rule.pattern.toLowerCase())) {
      return {
        category: rule.category,
        isTransfer: rule.isTransfer || rule.category === MONEY_MOVEMENT,
        ...(rule.subCategory ? { subCategory: rule.subCategory } : {}),
      };
    }
  }
  return null;
}
