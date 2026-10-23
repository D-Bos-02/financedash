import { prisma } from "@/lib/prisma";
import { getBaseCurrency } from "@/lib/profile";
import { isLiability, ACCOUNT_TYPES } from "@/lib/categories";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { NetWorthLine } from "@/components/charts/NetWorthLine";
import { NetWorthAllocation } from "@/components/charts/NetWorthAllocation";
import { Row } from "@/components/planner/ui";
import { countsTowardNetWorth, monthlyNetWorth } from "@/lib/net-worth";

// Per-person breakdown groups account types into a few plain buckets.
const OWNER_BUCKETS = [
  { label: "Cash", types: ["checking", "savings"] },
  { label: "Investments", types: ["investment", "crypto"] },
  { label: "Retirement", types: ["retirement"] },
  { label: "Property", types: ["property"] },
  { label: "Other", types: ["other"] },
  { label: "Cards and loans", types: ["credit", "loan"] },
];

export const dynamic = "force-dynamic";

const SHARED = "shared";

async function getNetWorthData() {
  const accounts = await prisma.account.findMany({ where: { isActive: true }, orderBy: { type: "asc" } });
  const members = await prisma.member.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true } });
  const fxRates = await prisma.fxRate.findMany();
  const base = await getBaseCurrency();

  function toBase(amount: number, currency: string) {
    if (currency === base) return amount;
    const rate = fxRates.find((r) => r.fromCurrency === currency && r.toCurrency === base);
    return rate ? amount * rate.rate : amount;
  }

  let assets = 0;
  let liabilities = 0;
  let unvested = 0;
  const byType: Record<string, { balance: number; accounts: typeof accounts }> = {};
  const byOwner: Record<string, Record<string, number>> = {};

  for (const acc of accounts) {
    const converted = toBase(acc.balance, acc.currency);
    const bucket = byType[acc.type] ?? { balance: 0, accounts: [] };
    bucket.balance += converted;
    bucket.accounts.push(acc);
    byType[acc.type] = bucket;
    const signed = isLiability(acc.type) ? -Math.abs(converted) : converted;
    if (!countsTowardNetWorth(acc.type)) unvested += converted;
    else if (isLiability(acc.type)) liabilities += Math.abs(converted);
    else assets += converted;
    const key = acc.ownerId ?? SHARED;
    const owner = byOwner[key] ?? {};
    owner[acc.type] = (owner[acc.type] ?? 0) + signed;
    byOwner[key] = owner;
  }

  const snapshots = await prisma.balanceSnapshot.findMany({
    orderBy: { date: "asc" },
    include: { account: { select: { type: true, isActive: true } } },
  });

  const allocationData = Object.entries(byType).filter(([type]) => countsTowardNetWorth(type)).map(([type, group]) => ({
    type,
    balance: group.balance,
  }));

  return {
    netWorth: assets - liabilities,
    assets,
    liabilities,
    unvested,
    base,
    byType,
    byOwner,
    // Per-person cards only help when there's more than one owner to compare.
    owners: [...members.map((m) => ({ value: m.id, label: m.name })), { value: SHARED, label: "Shared" }].filter((o) => byOwner[o.value]),
    allocationData,
    history: monthlyNetWorth(snapshots, toBase),
  };
}

export default async function NetWorthPage() {
  const data = await getNetWorthData();
  const typeLabel = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-zinc-100">Net Worth</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Net Worth</p>
          <p className="text-2xl font-bold text-zinc-100">{formatCurrency(data.netWorth, data.base, true)}</p>
          {data.unvested > 0 && <p className="text-xs text-zinc-500 mt-1">Excludes unvested stock</p>}
        </Card>
        <Card>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Assets</p>
          <p className="text-2xl font-bold text-emerald-400">{formatCurrency(data.assets, data.base, true)}</p>
        </Card>
        <Card>
          <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Liabilities</p>
          <p className="text-2xl font-bold text-red-400">{formatCurrency(data.liabilities, data.base, true)}</p>
        </Card>
        {data.unvested > 0 && (
          <Card className="border-dashed">
            <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Unvested stock</p>
            <p className="text-2xl font-bold text-zinc-400">{formatCurrency(data.unvested, data.base, true)}</p>
            <p className="text-xs text-zinc-500 mt-1">
              Not counted until it vests · {formatCurrency(data.netWorth + data.unvested, data.base, true)} including it
            </p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.owners.length > 1 && data.owners.map((o) => {
            const types = data.byOwner[o.value];
            const total = Object.entries(types).reduce((s, [t, v]) => s + (countsTowardNetWorth(t) ? v : 0), 0);
            const ownerUnvested = types["stock_plan"] ?? 0;
            return (
              <Card key={o.value}>
                <div className="flex items-baseline justify-between mb-1">
                  <CardTitle>{o.label}</CardTitle>
                  <span className="text-lg font-semibold text-zinc-100 tabular-nums">{formatCurrency(total, data.base, true)}</span>
                </div>
                {OWNER_BUCKETS.map((b) => {
                  const value = b.types.reduce((s, t) => s + (types[t] ?? 0), 0);
                  if (Math.round(value) === 0) return null;
                  return (
                    <Row
                      key={b.label}
                      label={b.label}
                      value={formatCurrency(value, data.base, true)}
                      tone={value < 0 ? "text-red-400" : "text-zinc-100"}
                    />
                  );
                })}
                {Math.round(ownerUnvested) !== 0 && (
                  <Row label="Unvested stock (not counted)" value={formatCurrency(ownerUnvested, data.base, true)} tone="text-zinc-500" />
                )}
              </Card>
            );
          })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>History</CardTitle></CardHeader>
          <NetWorthLine data={data.history} currency={data.base} height={220} />
        </Card>
        <Card>
          <CardHeader><CardTitle>Asset Allocation</CardTitle></CardHeader>
          <NetWorthAllocation data={data.allocationData} currency={data.base} height={220} />
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>By Account Type</CardTitle></CardHeader>
        <div className="space-y-5">
          {Object.entries(data.byType).map(([type, group]) => {
            const total = data.assets + data.liabilities;
            const pct = total > 0 ? (Math.abs(group.balance) / total) * 100 : 0;
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-zinc-300">{typeLabel(type)}</span>
                  <span className={`text-sm font-semibold tabular-nums ${isLiability(type) ? "text-red-400" : "text-zinc-100"}`}>
                    {formatCurrency(group.balance, data.base, true)}
                  </span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                  <div
                    className={`h-full rounded-full ${isLiability(type) ? "bg-red-500" : "bg-violet-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="space-y-1 pl-2">
                  {group.accounts.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400">{acc.name}</span>
                        {acc.currency !== data.base && <Badge variant="blue">{acc.currency}</Badge>}
                      </div>
                      <span className="text-zinc-400 tabular-nums">{formatCurrency(acc.balance, acc.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
