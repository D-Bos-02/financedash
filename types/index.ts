export type AccountType =
  | "checking"
  | "savings"
  | "investment"
  | "retirement"
  | "stock_plan"
  | "crypto"
  | "property"
  | "credit"
  | "loan"
  | "other";

export type BalanceMode = "manual" | "derived" | "plaid";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  institution?: string | null;
  balance: number;
  balanceMode: BalanceMode;
  ownerId?: string | null; // a Member; null = shared
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: string;
  merchant: string;
  amount: number;
  currency: string;
  category: string;
  subCategory?: string | null;
  notes?: string | null;
  isTransfer: boolean;
  source: string;
  createdAt: string;
  account?: Pick<Account, "id" | "name" | "currency">;
}

export interface Budget {
  id: string;
  category: string;
  period: "monthly" | "annual";
  amount: number;
  rollover: boolean;
  activeFrom: string;
  createdAt: string;
}

export interface BalanceSnapshot {
  id: string;
  accountId: string;
  date: string;
  balance: number;
  currency: string;
}

export interface FxRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  updatedAt: string;
}

export interface Settings {
  id: string;
  baseCurrency: string;
  theme: string;
}

export interface DashboardData {
  netWorth: number;
  netWorthChange: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlySavingsRate: number;
  budgetAlerts: BudgetAlert[];
  recentTransactions: Transaction[];
  spendingByCategory: CategorySpend[];
}

export interface BudgetAlert {
  category: string;
  budgeted: number;
  spent: number;
  percent: number;
}

export interface CategorySpend {
  category: string;
  amount: number;
}

export interface NetWorthData {
  current: number;
  assets: number;
  liabilities: number;
  byType: { type: string; balance: number }[];
  history: { date: string; netWorth: number }[];
}

export interface CashFlowData {
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  prevIncome: number;
  prevExpenses: number;
  monthly: { month: string; income: number; expenses: number }[];
}
