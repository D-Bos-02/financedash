// Monthly actuals from synced transactions, for the planner's plan vs actual view.
// Pure, so the server page passes in rows and the result is plain serializable data.

import { matchesSource, type IncomeSource, type Member } from "@/lib/household";

export interface ActualMonth {
  key: string; // yyyy-mm
  label: string; // "Sep" or "Oct (to 18th)"
  income: number;
  equityIncome: number; // part of income from equity vests, which land as lumps
  equityBySource: Record<string, number>; // by income source id
  rent: number;
  lifestyle: number; // all other spending, net of refunds
  coverage: string | null; // e.g. "Sam from Sep 18"; null when every member has the full month
}

interface TxLike {
  date: Date;
  amount: number;
  category: string;
  subCategory: string | null;
  isTransfer: boolean;
  merchant: string;
  memberId: string | null;
}

const MONTH = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Rent is often paid a few days early, so payments from the 25th count toward the next month.
const RENT_EARLY_DAY = 25;

function rentMonth(d: Date): string {
  const shift = d.getUTCDate() >= RENT_EARLY_DAY ? 1 : 0;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + shift, 1)).toISOString().slice(0, 7);
}

export interface ActualsContext {
  firstDates: Record<string, Date>; // each member's earliest transaction, i.e. when their history starts
  members: Member[];
  sources: IncomeSource[]; // equity sources tell vest income apart from pay
}

export function computeActuals(txs: TxLike[], ctx: ActualsContext, months = 3, now = new Date()): ActualMonth[] {
  const equity = ctx.sources.filter((s) => s.type === "equity_vest");
  const out: ActualMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const current = i === 0;
    const key = start.toISOString().slice(0, 7);

    let income = 0, equityIncome = 0, rent = 0, lifestyle = 0;
    const equityBySource: Record<string, number> = {};
    for (const t of txs) {
      if (t.isTransfer) continue;
      // Only rent itself; furniture and other Housing spend counts as lifestyle.
      if (t.category === "Housing" && t.subCategory === "Rent") {
        if (rentMonth(t.date) === key) rent -= t.amount;
        continue;
      }
      if (t.date < start || t.date >= end) continue;
      if (t.category === "Income") {
        income += t.amount;
        const source = equity.find((s) => matchesSource(t, s));
        if (source) {
          equityIncome += t.amount;
          equityBySource[source.id] = (equityBySource[source.id] ?? 0) + t.amount;
        }
      } else {
        lifestyle -= t.amount; // refunds (positive amounts) reduce spending
      }
    }

    const gaps = ctx.members.filter((m) => ctx.firstDates[m.id]).flatMap((m) => {
      const first = ctx.firstDates[m.id];
      if (first >= end) return [`no ${m.name} data`];
      if (first > start) return [`${m.name} from ${DAY.format(first)}`];
      return [];
    });

    out.push({
      key,
      label: current ? `${MONTH.format(start)} (to ${DAY.format(now)})` : MONTH.format(start),
      income,
      equityIncome,
      equityBySource,
      rent,
      lifestyle,
      coverage: gaps.length ? gaps.join(", ") : null,
    });
  }
  return out;
}
