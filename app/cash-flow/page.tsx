"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CashFlowBar } from "@/components/charts/CashFlowBar";
import { SpendingPie } from "@/components/charts/SpendingPie";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { BASE_PATH } from "@/lib/demo/mode";

interface CategorySpend {
  category: string;
  amount: number;
  percent: number;
}

interface CashFlowData {
  income: number;
  expenses: number;
  net: number;
  savingsRate: number;
  prevIncome: number;
  prevExpenses: number;
  monthly: { month: string; income: number; expenses: number }[];
  categoryBreakdown: CategorySpend[];
}

function Stat({
  label,
  value,
  prev,
  currency,
  positive,
}: {
  label: string;
  value: number;
  prev?: number;
  currency: string;
  positive?: boolean;
}) {
  const change = prev !== undefined ? value - prev : undefined;
  const up = change !== undefined && change > 0;
  const isGood = positive !== undefined ? (positive ? up : !up) : up;

  return (
    <Card>
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-zinc-100">{formatCurrency(value, currency, true)}</p>
      {change !== undefined && change !== 0 && (
        <p className={`text-xs mt-1 ${isGood ? "text-emerald-400" : "text-red-400"}`}>
          {up ? "▲" : "▼"} {formatCurrency(Math.abs(change), currency, true)} vs last month
        </p>
      )}
    </Card>
  );
}

export default function CashFlowPage() {
  const router = useRouter();
  // Each result remembers its month, so switching months shows the loading state until the new one lands.
  const [result, setResult] = useState<{ month: string; data: CashFlowData } | null>(null);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // The month's spending in one category, as shown in the pie (transfers left out).
  const transactionsHref = (category: string) =>
    `/transactions?${new URLSearchParams({ category, month, excludeTransfers: "1" })}`;

  const data = result?.month === month ? result.data : null;

  useEffect(() => {
    let alive = true;
    const fetchData = () =>
      fetch(`${BASE_PATH}/api/cash-flow?month=${month}`)
        .then((r) => r.json())
        .then((d: CashFlowData) => { if (alive) setResult({ month, data: d }); });
    fetchData();
    // Re-fetch when the tab regains focus so category changes from other pages show up.
    window.addEventListener("focus", fetchData);
    return () => {
      alive = false;
      window.removeEventListener("focus", fetchData);
    };
  }, [month]);

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const currency = "USD";

  return (
    <div className="px-4 py-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-zinc-100">Cash Flow</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            ←
          </button>
          <span className="text-sm font-medium text-zinc-200 min-w-24 text-center">{month}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            →
          </button>
        </div>
      </div>

      {!data ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-zinc-800 rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat label="Income" value={data.income} prev={data.prevIncome} currency={currency} positive />
            <Stat label="Expenses" value={data.expenses} prev={data.prevExpenses} currency={currency} positive={false} />
            <Card>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Net</p>
              <p className={`text-2xl font-bold ${data.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatCurrency(data.net, currency, true)}
              </p>
            </Card>
            <Card>
              <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">Savings Rate</p>
              <p className={`text-2xl font-bold ${data.savingsRate >= 20 ? "text-emerald-400" : data.savingsRate >= 0 ? "text-amber-400" : "text-red-400"}`}>
                {formatPercent(data.savingsRate, 1)}
              </p>
            </Card>
          </div>

          {/* Spending breakdown */}
          {data.categoryBreakdown.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle>Spending by Category</CardTitle></CardHeader>
                <SpendingPie
                  key={month}
                  data={data.categoryBreakdown.map((c) => ({ category: c.category, amount: c.amount }))}
                  height={220}
                  onSelect={(category) => router.push(transactionsHref(category))}
                />
              </Card>
              <Card>
                <CardHeader><CardTitle>Breakdown</CardTitle></CardHeader>
                <div className="space-y-3">
                  {data.categoryBreakdown.map((c) => (
                    <Link key={c.category} href={transactionsHref(c.category)} className="block group">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-zinc-300 group-hover:text-violet-300">{c.category}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-500">{formatPercent(c.percent, 1)}</span>
                          <span className="text-sm font-medium tabular-nums text-zinc-100">
                            {formatCurrency(c.amount, currency, true)}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full"
                          style={{ width: `${Math.min(c.percent, 100)}%` }}
                        />
                      </div>
                    </Link>
                  ))}
                </div>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>12-Month Income vs Expenses</CardTitle>
            </CardHeader>
            <CashFlowBar data={data.monthly} currency={currency} height={260} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Month-over-Month</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left py-2 text-zinc-500 font-medium">Month</th>
                    <th className="text-right py-2 text-zinc-500 font-medium">Income</th>
                    <th className="text-right py-2 text-zinc-500 font-medium">Expenses</th>
                    <th className="text-right py-2 text-zinc-500 font-medium">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {[...data.monthly].reverse().map((row) => {
                    const net = row.income - row.expenses;
                    return (
                      <tr key={row.month} className="hover:bg-zinc-800/30">
                        <td className="py-2.5 text-zinc-400">{row.month}</td>
                        <td className="py-2.5 text-right text-emerald-400 tabular-nums">
                          {formatCurrency(row.income, currency, true)}
                        </td>
                        <td className="py-2.5 text-right text-red-400 tabular-nums">
                          {formatCurrency(row.expenses, currency, true)}
                        </td>
                        <td className={`py-2.5 text-right tabular-nums font-medium ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {formatCurrency(net, currency, true)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
