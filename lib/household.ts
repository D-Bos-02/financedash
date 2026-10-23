// The household as the planner sees it: members, income sources and goals, parsed from their database rows.
// Pure, so client components can import it.

export const JOINT = "joint"; // holdings key for accounts with no owner (shared, or a solo profile)

// Offered first in currency pickers; any ISO 4217 code works.
export const COMMON_CURRENCIES = [
  "USD", "EUR", "GBP", "CAD", "AUD", "NZD", "CHF", "JPY", "SEK", "NOK", "DKK", "PLN", "CZK", "SGD", "HKD", "INR", "BRL", "MXN", "ZAR",
];

// Number and date formats offered in Settings; the browser's own locale is added when it isn't listed.
export const COMMON_LOCALES = [
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "en-CA", label: "English (Canada)" },
  { value: "en-AU", label: "English (Australia)" },
  { value: "en-IE", label: "English (Ireland)" },
  { value: "en-IN", label: "English (India)" },
  { value: "de-DE", label: "Deutsch" },
  { value: "fr-FR", label: "Français" },
  { value: "es-ES", label: "Español" },
  { value: "it-IT", label: "Italiano" },
  { value: "nl-NL", label: "Nederlands" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "sv-SE", label: "Svenska" },
  { value: "ja-JP", label: "日本語" },
];

// Chart colours for members, assigned in order.
export const MEMBER_COLORS = ["#38bdf8", "#f472b6", "#34d399", "#f59e0b", "#a78bfa", "#fb7185"];

export function nextMemberColor(used: string[]): string {
  return MEMBER_COLORS.find((c) => !used.includes(c)) ?? MEMBER_COLORS[used.length % MEMBER_COLORS.length];
}

export const INCOME_TYPES = [
  { value: "salary", label: "Salary" },
  { value: "hourly", label: "Hourly wages" },
  { value: "freelance", label: "Freelance / self-employed" },
  { value: "equity_vest", label: "Equity vests (RSUs)" },
  { value: "other", label: "Other" },
] as const;
export type IncomeType = (typeof INCOME_TYPES)[number]["value"];

export const PAY_FREQUENCIES = [
  { value: "weekly", label: "Weekly", perYear: 52 },
  { value: "biweekly", label: "Every two weeks", perYear: 26 },
  { value: "semimonthly", label: "Twice a month", perYear: 24 },
  { value: "monthly", label: "Monthly", perYear: 12 },
  { value: "quarterly", label: "Quarterly", perYear: 4 },
  { value: "irregular", label: "Irregular", perYear: null },
] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number]["value"];

export const GOAL_TEMPLATES = [
  { value: "emergency_fund", label: "Emergency fund" },
  { value: "house", label: "Home purchase" },
  { value: "car", label: "Car" },
  { value: "bike", label: "Bike" },
  { value: "wedding", label: "Wedding" },
  { value: "travel", label: "Travel" },
  { value: "debt_payoff", label: "Debt payoff" },
  { value: "custom", label: "Custom" },
] as const;
export type GoalTemplate = (typeof GOAL_TEMPLATES)[number]["value"];

export interface Profile {
  householdType: "solo" | "household";
  baseCurrency: string;
  timeZone: string;
  locale: string;
  onboardedAt: string | null; // ISO
}

// An account as the household editors need it (goal links, owner).
export interface AccountSummary {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  ownerId: string | null;
}

// Everything the setup wizard and the household settings edit.
export interface HouseholdData {
  profile: Profile | null;
  members: Member[];
  sources: IncomeSource[];
  goals: Goal[];
  accounts: AccountSummary[];
  plaidConfigured: boolean;
}

export interface Member {
  id: string;
  name: string;
  color: string;
}

export interface IncomeSource {
  id: string;
  memberId: string | null;
  name: string;
  type: IncomeType;
  payFrequency: PayFrequency;
  depositPattern: string | null;
  estimateMonthly: number;
  // Equity vests only
  ticker: string | null;
  sharesPerVest: number;
  vestMonths: number[];
  taxPct: number;
  priceFallback: number;
  priceLive: boolean;
}

export interface GoalContribution {
  id: string;
  memberId: string | null;
  label: string;
  amount: number;
  currency: string | null; // null = the base currency
  expectedDate: string | null; // ISO
  received: boolean;
}

export interface Goal {
  id: string;
  name: string;
  template: GoalTemplate;
  status: string; // active | achieved | archived
  targetAmount: number;
  deadline: string | null; // ISO
  priority: number;
  plannedMonthly: number | null;
  details: Record<string, unknown>;
  accounts: { accountId: string; share: number }[];
  contributions: GoalContribution[];
}

// Vest months are stored as JSON; anything malformed means no vests rather than a crash.
export function parseVestMonths(raw: string | null | undefined): number[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? [...new Set(v.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

function parseDetails(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const oneOf = <T extends string>(list: readonly { value: T }[], v: string, fallback: T): T =>
  list.some((o) => o.value === v) ? (v as T) : fallback;

interface IncomeRow {
  id: string; memberId: string | null; name: string; type: string; payFrequency: string; depositPattern: string | null;
  estimateMonthly: number; ticker: string | null; sharesPerVest: number | null; vestMonths: string | null;
  taxPct: number | null; priceFallback: number | null; priceLive: boolean;
}

export function toIncomeSource(r: IncomeRow): IncomeSource {
  return {
    id: r.id,
    memberId: r.memberId,
    name: r.name,
    type: oneOf(INCOME_TYPES, r.type, "other"),
    payFrequency: oneOf(PAY_FREQUENCIES, r.payFrequency, "monthly"),
    depositPattern: r.depositPattern?.trim() || null,
    estimateMonthly: r.estimateMonthly,
    ticker: r.ticker?.trim().toUpperCase() || null,
    sharesPerVest: r.sharesPerVest ?? 0,
    vestMonths: parseVestMonths(r.vestMonths),
    taxPct: r.taxPct ?? 0,
    priceFallback: r.priceFallback ?? 0,
    priceLive: r.priceLive,
  };
}

// Dates are Date objects from Prisma, or ISO strings once a row has been through JSON (API responses).
type DateLike = Date | string | null;
const iso = (d: DateLike) => (d === null ? null : new Date(d).toISOString());

interface GoalRow {
  id: string; name: string; template: string; status: string; targetAmount: number; deadline: DateLike; priority: number;
  plannedMonthly: number | null; details: string;
  accounts: { accountId: string; share: number }[];
  contributions: { id: string; memberId: string | null; label: string; amount: number; currency: string | null; expectedDate: DateLike; received: boolean }[];
}

export function toGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    name: r.name,
    template: oneOf(GOAL_TEMPLATES, r.template, "custom"),
    status: r.status,
    targetAmount: r.targetAmount,
    deadline: iso(r.deadline),
    priority: r.priority,
    plannedMonthly: r.plannedMonthly,
    details: parseDetails(r.details),
    accounts: r.accounts.map((a) => ({ accountId: a.accountId, share: a.share })),
    contributions: r.contributions.map((c) => ({
      id: c.id, memberId: c.memberId, label: c.label, amount: c.amount, currency: c.currency, received: c.received, expectedDate: iso(c.expectedDate),
    })),
  };
}

// Whole months from now until a deadline, at least 1. A deadline earlier this month still counts as 1.
export function monthsUntil(deadline: string | Date, now = new Date()): number {
  const d = new Date(deadline);
  const months = (d.getUTCFullYear() - now.getUTCFullYear()) * 12 + d.getUTCMonth() - now.getUTCMonth();
  return Math.max(1, months);
}

export function deadlineIn(months: number, now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + Math.max(1, Math.round(months)), 1)).toISOString();
}

interface TxForSource {
  merchant: string;
  subCategory?: string | null;
  memberId: string | null;
}

// A deposit belongs to an income source when its description (or subcategory, e.g. one set by a rule)
// contains the pattern and it lands in that member's own accounts or a shared one (pay often goes into a
// joint account), never another member's. Household income matches any account.
export function matchesSource(t: TxForSource, s: Pick<IncomeSource, "memberId" | "depositPattern">): boolean {
  if (!s.depositPattern) return false;
  if (s.memberId && t.memberId !== null && t.memberId !== s.memberId) return false;
  const p = s.depositPattern.toLowerCase();
  return t.merchant.toLowerCase().includes(p) || (t.subCategory ?? "").toLowerCase().includes(p);
}

// Money in the base currency, e.g. "$1,234" or "€1.234" depending on locale.
export function makeMoney(currency: string, locale = "en-US") {
  const whole = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0, minimumFractionDigits: 0 });
  const compactFmt = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
  const symbol = whole.formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  return {
    currency,
    symbol,
    fmt: (v: number) => whole.format(Math.round(v) || 0),
    compact: (v: number) => (Math.abs(v) >= 1000 ? compactFmt.format(v) : whole.format(Math.round(v) || 0)),
  };
}
export type Money = ReturnType<typeof makeMoney>;
