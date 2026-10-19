import { isLiability } from "@/lib/categories";

// Unvested stock can't be spent until it vests: it's shown on its own, never in net worth.
export function countsTowardNetWorth(type: string): boolean {
  return type !== "stock_plan";
}

export function signedBalance(type: string, amount: number): number {
  return isLiability(type) ? -Math.abs(amount) : amount;
}

interface SnapshotLike {
  accountId: string;
  date: Date;
  balance: number;
  currency: string;
  account: { type: string; isActive: boolean };
}

// Month-end net worth: each active account's latest snapshot in the month, summed (unvested stock excluded).
export function monthlyNetWorth(
  snapshots: SnapshotLike[],
  toBase: (amount: number, currency: string) => number = (a) => a
): { date: string; netWorth: number }[] {
  const latest = new Map<string, SnapshotLike>(); // `${month}|${accountId}` -> snapshot
  for (const snap of snapshots) {
    if (!snap.account.isActive || !countsTowardNetWorth(snap.account.type)) continue;
    const key = `${snap.date.toISOString().slice(0, 7)}|${snap.accountId}`;
    const prev = latest.get(key);
    if (!prev || snap.date >= prev.date) latest.set(key, snap);
  }

  const byMonth: Record<string, number> = {};
  for (const [key, snap] of latest) {
    const month = key.slice(0, 7);
    byMonth[month] = (byMonth[month] ?? 0) + signedBalance(snap.account.type, toBase(snap.balance, snap.currency));
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, netWorth]) => ({ date, netWorth }));
}

// Net worth on a given date: each active account's latest snapshot on or before it.
// Returns null unless every active account with history has a snapshot that old,
// so a comparison never mixes accounts that weren't tracked yet.
export function netWorthAt(
  snapshots: SnapshotLike[],
  date: Date,
  toBase: (amount: number, currency: string) => number = (a) => a
): number | null {
  const latest = new Map<string, SnapshotLike>();
  const tracked = new Set<string>();
  for (const snap of snapshots) {
    if (!snap.account.isActive || !countsTowardNetWorth(snap.account.type)) continue;
    tracked.add(snap.accountId);
    if (snap.date > date) continue;
    const prev = latest.get(snap.accountId);
    if (!prev || snap.date >= prev.date) latest.set(snap.accountId, snap);
  }
  if (!latest.size || latest.size < tracked.size) return null;
  let total = 0;
  for (const snap of latest.values()) total += signedBalance(snap.account.type, toBase(snap.balance, snap.currency));
  return total;
}
