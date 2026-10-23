"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/formatters";

interface AllocationItem {
  type: string;
  balance: number;
}

const COLORS = [
  "#8b5cf6", "#34d399", "#60a5fa", "#fbbf24",
  "#f87171", "#a78bfa", "#6ee7b7", "#fca5a5",
];

const TYPE_LABELS: Record<string, string> = {
  checking: "Checking",
  savings: "Savings",
  investment: "Investment",
  retirement: "Retirement",
  crypto: "Crypto",
  property: "Property",
  stock_plan: "Unvested stock",
  credit: "Credit",
  loan: "Loan",
  other: "Other",
};

function formatPct(pct: number): string {
  return pct > 0 && pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

export function NetWorthAllocation({
  data,
  currency = "USD",
  height = 220,
}: {
  data: AllocationItem[];
  currency?: string;
  height?: number;
}) {
  const positive = data.filter((d) => d.balance >= 1); // skip empty and near-empty accounts
  if (!positive.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm" style={{ height }}>
        Add accounts with balances to see allocation.
      </div>
    );
  }

  // Shares of total assets, largest first, so colours and the legend line up.
  const total = positive.reduce((s, d) => s + d.balance, 0);
  const slices = positive
    .map((d) => ({ ...d, label: TYPE_LABELS[d.type] ?? d.type, pct: (d.balance / total) * 100 }))
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="w-full sm:w-1/2" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="balance" nameKey="label" cx="50%" cy="50%" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
              {slices.map((s, i) => (
                <Cell key={s.type} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, _name, item) => [
                `${formatCurrency(Number(value ?? 0), currency, true)} · ${formatPct((item?.payload as { pct: number })?.pct ?? 0)}`,
                (item?.payload as { label: string })?.label,
              ]}
              contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#d4d4d8" }}
              itemStyle={{ color: "#d4d4d8" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="w-full sm:w-1/2 space-y-2">
        {slices.map((s, i) => (
          <li key={s.type} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 text-zinc-300 truncate">{s.label}</span>
            <span className="text-zinc-100 font-medium tabular-nums w-10 text-right">{formatPct(s.pct)}</span>
            <span className="text-zinc-500 tabular-nums w-16 text-right">{formatCurrency(s.balance, currency, true)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
