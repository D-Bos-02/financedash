// Planner model: income from the household's income sources, saved inputs, and the position built from live accounts.
// Pure functions only, so both the server page and the client component can import this file.

import type { Quote } from "@/lib/quote";
import type { ActualMonth } from "@/lib/actuals";
import { JOINT, PAY_FREQUENCIES, matchesSource, type IncomeSource, type Member } from "@/lib/household";

export interface Vest {
  key: string; // YYYY-MM
  label: string; // "Jan 2027"
  monthsAway: number; // 0 = this month
  amount: number; // after tax
  source: string; // income source name
}

// Vests over the next `horizon` months. This month's vest counts until its sale has landed.
export function upcomingVests(perVest: number, horizon: number, now: Date, receivedThisMonth: number, vestMonths: number[], source = ""): Vest[] {
  const vests: Vest[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    if (!vestMonths.includes(d.getUTCMonth() + 1)) continue;
    if (i === 0 && receivedThisMonth > 0) continue;
    vests.push({
      key: d.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(d),
      monthsAway: i,
      amount: perVest,
      source,
    });
  }
  return vests;
}

// Vest money expected before a deadline `months` away (a vest landing in the deadline month isn't counted).
export function vestsBefore(vests: Vest[], months: number): number {
  return vests.filter((v) => v.monthsAway < months).reduce((s, v) => s + v.amount, 0);
}
const STALE_MANUAL_DAYS = 30;
const IRREGULAR_WINDOW_DAYS = 90;

export interface Pay {
  sourceId: string;
  memberId: string | null;
  member: string; // member name, or "Household"
  source: string; // income source name, e.g. "Salary"
  monthly: number;
  perPaycheck: number | null; // median of the last 3 paydays, for regular pay
  lastPaid: string | null;
  basis: "paychecks" | "average" | "estimate";
}

interface IncomeTxLike {
  date: Date;
  amount: number;
  merchant: string;
  subCategory?: string | null;
  memberId: string | null;
}

// Regular pay: median of the last 3 paydays, times paydays per year. Irregular pay: the last 90 days' deposits, averaged
// per month. Either falls back to the estimate until a matching deposit exists. Equity vests are lumps, not pay.
export function computePay(incomeTxs: IncomeTxLike[], sources: IncomeSource[], members: Member[], now = new Date()): Pay[] {
  return sources
    .filter((s) => s.type !== "equity_vest")
    .map((s) => {
      const base = {
        sourceId: s.id,
        memberId: s.memberId,
        member: members.find((m) => m.id === s.memberId)?.name ?? "Household",
        source: s.name,
      };
      const estimate: Pay = { ...base, monthly: s.estimateMonthly, perPaycheck: null, lastPaid: null, basis: "estimate" };
      const deposits = incomeTxs.filter((t) => t.amount > 0 && matchesSource(t, s));
      if (!deposits.length) return estimate;

      // Sum deposits per payday (a payday can arrive as more than one deposit).
      const byDay = new Map<string, number>();
      for (const t of deposits) {
        const day = t.date.toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + t.amount);
      }
      const days = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a));
      const lastPaid = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(days[0][0]));

      const perYear = PAY_FREQUENCIES.find((f) => f.value === s.payFrequency)?.perYear ?? null;
      if (perYear === null) {
        const since = now.getTime() - IRREGULAR_WINDOW_DAYS * 86_400_000;
        const total = deposits.filter((t) => t.date.getTime() >= since).reduce((sum, t) => sum + t.amount, 0);
        if (!total) return estimate;
        return { ...base, monthly: total / 3, perPaycheck: null, lastPaid, basis: "average" };
      }
      const sorted = days.slice(0, 3).map(([, v]) => v).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { ...base, monthly: (median * perYear) / 12, perPaycheck: median, lastPaid, basis: "paychecks" };
    });
}

export const SCENARIOS = [
  { label: "Conservative", rate: 0.06, color: "#38bdf8", savingsRate: 0.55 },
  { label: "Base", rate: 0.08, color: "#8b5cf6", savingsRate: 0.65 },
  { label: "Aggressive", rate: 0.1, color: "#f59e0b", savingsRate: 0.75 },
] as const;

// Household-wide assumptions. Goal-specific inputs live on each Goal, equity assumptions on each income source.
export const DEFAULT_INPUTS = {
  // Projection
  years: 5,
  freeRent: 0,
  rent: 0, // used when rentLive is off or there's no rent in the transactions
  rentLive: true, // use the latest actual rent from transactions
  matchMonthly: 0, // employer retirement match
  // Budget
  lifestyle: 2000, // everything except rent
  retirementMonthly: 0, // own retirement contributions from take-home pay (IRA, pension top-ups, ...)
  // Selling investments, e.g. for a deposit
  taxDrag: 5, // % lost to tax when selling, for investments without cost basis (or when taxDragLive is off)
  taxDragLive: true, // estimate from Plaid cost basis where available
  gainsTaxPct: 20, // tax rate on capital gains
};

export type PlannerInputs = typeof DEFAULT_INPUTS;

// Merge saved JSON over the defaults, keeping only known keys of the right type.
export function sanitizeInputs(raw: unknown): PlannerInputs {
  return sanitizeAgainst(DEFAULT_INPUTS, raw);
}

export function sanitizeAgainst<T extends Record<string, number | boolean | string>>(defaults: T, raw: unknown): T {
  const out = { ...defaults };
  if (!raw || typeof raw !== "object") return out;
  const src = raw as Record<string, unknown>;
  for (const key of Object.keys(defaults) as (keyof T)[]) {
    const v = src[key as string];
    if (typeof v === typeof defaults[key] && (typeof v !== "number" || Number.isFinite(v))) {
      (out as Record<string, unknown>)[key as string] = v;
    }
  }
  return out;
}

export interface Holdings {
  cash: number; // checking + savings, less credit card balances
  invested: number; // brokerage + crypto
  retirement: number; // counted in the projection, not available for goals
  unvested: number; // stock plan; future vests are counted as income instead
}

export interface PlannerPosition {
  holdings: Record<string, Holdings>; // by member id, plus JOINT for shared accounts
  asOf: string | null;
  warnings: string[];
}

interface AccountLike {
  name: string;
  type: string;
  currency: string;
  balance: number;
  ownerId: string | null;
  updatedAt: Date;
  balanceMode: string;
}

interface FxLike {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
}

const emptyHoldings = (): Holdings => ({ cash: 0, invested: 0, retirement: 0, unvested: 0 });

// Rate from a currency into the base currency, or null when no rate has been saved.
export function rateToBase(fxRates: FxLike[], base: string) {
  return (currency: string) =>
    currency === base ? 1 : fxRates.find((r) => r.fromCurrency === currency && r.toCurrency === base)?.rate ?? null;
}

export function computePosition(accounts: AccountLike[], fxRates: FxLike[], memberIds: string[], base = "USD"): PlannerPosition {
  const rateOf = rateToBase(fxRates, base);

  const holdings: Record<string, Holdings> = Object.fromEntries([...memberIds, JOINT].map((k) => [k, emptyHoldings()]));
  const warnings: string[] = [];
  let latest: Date | null = null;

  for (const acc of accounts) {
    const rate = rateOf(acc.currency);
    if (rate === null) {
      warnings.push(`${acc.name} is left out: add a ${acc.currency} to ${base} rate in Settings.`);
      continue;
    }
    const value = acc.balance * rate;
    // Accounts of a member who no longer exists count as shared.
    const h = holdings[acc.ownerId && memberIds.includes(acc.ownerId) ? acc.ownerId : JOINT];

    if (acc.type === "checking" || acc.type === "savings") h.cash += value;
    else if (acc.type === "credit") h.cash -= Math.abs(value);
    else if (acc.type === "investment" || acc.type === "crypto") h.invested += value;
    else if (acc.type === "retirement") h.retirement += value;
    else if (acc.type === "stock_plan") h.unvested += value;
    else continue; // property, loans and other accounts sit outside the plan

    if (!latest || acc.updatedAt > latest) latest = acc.updatedAt;

    const days = Math.floor((Date.now() - acc.updatedAt.getTime()) / 86400000);
    if (acc.balanceMode === "manual" && days > STALE_MANUAL_DAYS) {
      warnings.push(`${acc.name} was last updated ${days} days ago. Update its balance on the Accounts page.`);
    }
  }

  return {
    holdings,
    asOf: latest
      ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(latest)
      : null,
    warnings,
  };
}

export function totalHoldings(position: PlannerPosition): Holdings {
  return Object.values(position.holdings).reduce(
    (t, h) => ({ cash: t.cash + h.cash, invested: t.invested + h.invested, retirement: t.retirement + h.retirement, unvested: t.unvested + h.unvested }),
    emptyHoldings()
  );
}

export function projectGrowth(
  start: number,
  years: number,
  annualRate: number,
  savingsRate: number,
  freeRentMonths: number,
  monthlyInvestable: number,
  investableFreeRent: number,
  matchMonthly: number,
  lumpAt: (month: number) => number = () => 0 // one-off cash in a month (1 = first month), e.g. an equity vest
) {
  const monthlyRate = annualRate / 12;
  const contribFree = investableFreeRent * savingsRate + matchMonthly;
  const contribRent = monthlyInvestable * savingsRate + matchMonthly;

  let portfolio = start;
  const data = [{ year: 0, value: Math.round(portfolio) }];

  for (let m = 1; m <= years * 12; m++) {
    const contribution = (m <= freeRentMonths ? contribFree : contribRent) + lumpAt(m) * savingsRate;
    portfolio = portfolio * (1 + monthlyRate) + contribution;
    if (m % 12 === 0) data.push({ year: m / 12, value: Math.round(portfolio) });
  }
  return data;
}

// Cost basis of brokerage holdings from Plaid.
export interface BasisSummary {
  coveredValue: number; // value of holdings with a known cost basis (cash counts, at zero gain)
  costBasis: number;
  asOf: string | null;
}

interface HoldingLike {
  value: number;
  costBasis: number | null;
  type: string | null;
  updatedAt: Date;
}

export function summarizeBasis(holdings: HoldingLike[]): BasisSummary | null {
  let coveredValue = 0, costBasis = 0;
  let latest: Date | null = null;
  for (const h of holdings) {
    const basis = h.costBasis ?? (h.type === "cash" ? h.value : null);
    if (basis === null) continue;
    coveredValue += h.value;
    costBasis += basis;
    if (!latest || h.updatedAt > latest) latest = h.updatedAt;
  }
  if (!holdings.length) return null;
  return { coveredValue, costBasis, asOf: latest ? latest.toISOString().slice(0, 10) : null };
}

export interface TaxDragEstimate {
  pct: number; // effective % of investments lost to tax if sold
  gains: number; // net unrealised gain on holdings with cost basis
  coveredValue: number;
  uncoveredValue: number; // taxed at the manual rate (e.g. a manual account with no holdings detail)
  manualPct: number;
  asOf: string | null;
}

// Tax on selling: net gains on known-basis holdings at the gains rate, plus the manual rate on everything else.
export function estimateTaxDrag(totalInvested: number, basis: BasisSummary, gainsTaxPct: number, manualPct: number): TaxDragEstimate {
  const gains = basis.coveredValue - basis.costBasis;
  const uncoveredValue = Math.max(0, totalInvested - basis.coveredValue);
  const tax = (Math.max(0, gains) * gainsTaxPct) / 100 + (uncoveredValue * manualPct) / 100;
  return {
    pct: totalInvested > 0 ? Math.round((tax / totalInvested) * 1000) / 10 : 0,
    gains,
    coveredValue: basis.coveredValue,
    uncoveredValue,
    manualPct,
    asOf: basis.asOf,
  };
}

// One equity income source with its price and upcoming vests.
export interface Grant {
  source: IncomeSource;
  member: string;
  price: { value: number; live: boolean; quote: Quote | null };
  perVest: number; // after tax
  perYear: number;
  vests: Vest[]; // next 24 months
}

export interface PlannerView {
  inputs: PlannerInputs; // values in use: live rent and tax drag substituted where switched on
  // Monthly take-home is regular pay only; equity arrives as lumps in vest months (see vests).
  income: { total: number; equityPerYear: number };
  grants: Grant[];
  vests: Vest[]; // every grant's vests over the next 24 months, soonest first
  lumpAt: (month: number) => number; // for projections: vest money landing in month m (1 = this month)
  rent: { live: boolean; actual: number | null };
  taxDrag: { live: boolean; estimate: TaxDragEstimate | null };
  start: { invested: number; cash: number; total: number; unvested: number };
}

export interface PlannerData {
  quotes: Record<string, Quote | null>; // by ticker
  actuals: ActualMonth[];
  pay: Pay[];
  position: PlannerPosition;
  basis: BasisSummary | null;
  sources: IncomeSource[];
  members: Member[];
}

function deriveGrant(s: IncomeSource, data: PlannerData, now: Date): Grant {
  const quote = s.ticker ? data.quotes[s.ticker] ?? null : null;
  const live = s.priceLive && quote !== null;
  const price = { value: live ? quote.price : s.priceFallback, live, quote };
  const perVest = s.sharesPerVest * price.value * (1 - s.taxPct / 100);
  const received = data.actuals[data.actuals.length - 1]?.equityBySource[s.id] ?? 0;
  return {
    source: s,
    member: data.members.find((m) => m.id === s.memberId)?.name ?? "Household",
    price,
    perVest,
    perYear: perVest * s.vestMonths.length,
    vests: upcomingVests(perVest, 24, now, received, s.vestMonths, s.name),
  };
}

// Vest money landing in projection month m (1 = this month); this month's only while its sale is still pending.
function grantLumpAt(g: Grant, m: number, now: Date): number {
  const month = ((now.getUTCMonth() + m - 1) % 12) + 1;
  if (!g.source.vestMonths.includes(month)) return 0;
  return m === 1 && g.vests[0]?.monthsAway !== 0 ? 0 : g.perVest;
}

// Combine saved inputs with live data, exactly as the planner shows it.
export function derivePlannerView(inputs: PlannerInputs, data: PlannerData, now = new Date()): PlannerView {
  const { actuals, pay, position, basis } = data;
  const grants = data.sources.filter((s) => s.type === "equity_vest").map((s) => deriveGrant(s, data, now));
  const lumpAt = (m: number) => grants.reduce((sum, g) => sum + grantLumpAt(g, m, now), 0);
  const vests = grants.flatMap((g) => g.vests).sort((a, b) => a.monthsAway - b.monthsAway);
  const total = pay.reduce((s, p) => s + p.monthly, 0);

  // Latest actual rent: this month's if it looks fully paid (within 10% of last month's), else last month's.
  const [prevMonth, thisMonth] = actuals.slice(-2).map((m) => m.rent);
  const actualRent = (thisMonth && thisMonth >= 0.9 * (prevMonth ?? 0) ? thisMonth : prevMonth) || null;
  const rentInUse = inputs.rentLive && actualRent !== null ? actualRent : null;

  const all = totalHoldings(position);
  const invested = all.invested + all.retirement;

  // Tax drag applies to the brokerage investments a goal may sell.
  const estimate = basis ? estimateTaxDrag(all.invested, basis, inputs.gainsTaxPct, inputs.taxDrag) : null;
  const dragLive = inputs.taxDragLive && estimate !== null;

  return {
    inputs: { ...inputs, rent: rentInUse ?? inputs.rent, taxDrag: dragLive ? estimate.pct : inputs.taxDrag },
    taxDrag: { live: dragLive, estimate },
    income: { total, equityPerYear: grants.reduce((s, g) => s + g.perYear, 0) },
    grants,
    vests,
    lumpAt,
    rent: { live: rentInUse !== null, actual: actualRent },
    start: { invested, cash: all.cash, total: invested + all.cash, unvested: all.unvested },
  };
}
