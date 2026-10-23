export const DEFAULT_CATEGORIES = [
  "Housing",
  "Food & Dining",
  "Transport",
  "Health & Medical",
  "Fitness",
  "Shopping",
  "Entertainment",
  "Utilities",
  "Subscriptions",
  "Travel",
  "Income",
  "Money Movement",
  "Investment",
  "Tax",
  "Other",
] as const;

export type Category = (typeof DEFAULT_CATEGORIES)[number];

// Money moving between your own accounts (card payments, savings, brokerage).
// Always flagged isTransfer so it nets out of income and spending.
export const MONEY_MOVEMENT = "Money Movement";

export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" },
  { value: "retirement", label: "Retirement" },
  { value: "stock_plan", label: "Stock plan (unvested)" },
  { value: "crypto", label: "Crypto" },
  { value: "property", label: "Property" },
  { value: "credit", label: "Credit Card" },
  { value: "loan", label: "Loan" },
  { value: "other", label: "Other" },
] as const;

export const LIABILITY_TYPES = ["credit", "loan"];

export function isLiability(type: string): boolean {
  return LIABILITY_TYPES.includes(type);
}
