"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";

interface MonthlySpend {
  month: string;
  [category: string]: number | string;
}

interface BudgetCategoryBarProps {
  data: MonthlySpend[];
  categories: string[];
  currency?: string;
  height?: number;
}

const COLORS = [
  "#8b5cf6", "#34d399", "#60a5fa", "#fbbf24",
  "#f87171", "#a78bfa", "#6ee7b7", "#fca5a5",
];

export function BudgetCategoryBar({ data, categories, currency = "USD", height = 240 }: BudgetCategoryBarProps) {
  if (!data.length || !categories.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm" style={{ height }}>
        No budget data for this period.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }} barGap={2}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
        <XAxis dataKey="month" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatCurrency(v, currency, true)}
          width={70}
        />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#d4d4d8" }}
          formatter={(v) => formatCurrency(Number(v ?? 0), currency, true)}
        />
        {categories.map((cat, i) => (
          <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} maxBarSize={40} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
