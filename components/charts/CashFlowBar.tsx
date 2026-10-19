"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

interface CashFlowBarProps {
  data: MonthlyData[];
  currency?: string;
  height?: number;
}

function CustomTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { color: string; name: string; value: number }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const net = (payload.find((p) => p.name === "income")?.value ?? 0) -
              (payload.find((p) => p.name === "expenses")?.value ?? 0);
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm space-y-1 min-w-36">
      <p className="text-zinc-400 text-xs mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }} className="capitalize">{p.name}</span>
          <span className="text-zinc-100 tabular-nums">{formatCurrency(p.value, currency, true)}</span>
        </div>
      ))}
      <div className="flex justify-between gap-4 border-t border-zinc-700 pt-1 mt-1">
        <span className="text-zinc-400">Net</span>
        <span className={`tabular-nums font-medium ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
          {formatCurrency(net, currency, true)}
        </span>
      </div>
    </div>
  );
}

export function CashFlowBar({ data, currency = "USD", height = 240 }: CashFlowBarProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm" style={{ height }}>
        No cash flow data yet.
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: d.month.slice(0, 7),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency, true)}
          width={70}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ fill: "#27272a" }} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#71717a", paddingTop: 8 }}
          formatter={(value) => <span className="capitalize text-zinc-400">{value}</span>}
        />
        <Bar dataKey="income" name="income" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={32} />
        <Bar dataKey="expenses" name="expenses" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={32} />
      </BarChart>
    </ResponsiveContainer>
  );
}
