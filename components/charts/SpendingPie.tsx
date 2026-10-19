"use client";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";

interface CategorySpend {
  category: string;
  amount: number;
}

interface SpendingPieProps {
  data: CategorySpend[];
  currency?: string;
  height?: number;
  onSelect?: (category: string) => void; // makes slices and legend entries clickable
}

const COLORS = [
  "#8b5cf6", "#34d399", "#f87171", "#fbbf24", "#60a5fa",
  "#a78bfa", "#6ee7b7", "#fca5a5", "#fde68a", "#93c5fd",
];

function CustomTooltip({
  active,
  payload,
  currency,
  clickable,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { percent: number } }[];
  currency: string;
  clickable?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <p className="font-medium text-zinc-100">{payload[0].name}</p>
      <p className="text-zinc-300 tabular-nums">{formatCurrency(payload[0].value, currency, true)}</p>
      <p className="text-zinc-500 text-xs">{(payload[0].payload.percent * 100).toFixed(1)}%</p>
      {clickable && <p className="text-violet-400 text-xs mt-1">Click to see transactions</p>}
    </div>
  );
}

export function SpendingPie({ data, currency = "USD", height = 220, onSelect }: SpendingPieProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm" style={{ height }}>
        No spending data yet.
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.amount, 0);
  const withPercent = data.map((d) => ({ ...d, percent: total > 0 ? d.amount / total : 0 }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={withPercent}
          dataKey="amount"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius="55%"
          outerRadius="80%"
          paddingAngle={2}
          onClick={onSelect ? (entry) => onSelect((entry as unknown as CategorySpend).category) : undefined}
          style={onSelect ? { cursor: "pointer" } : undefined}
        >
          {withPercent.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip currency={currency} clickable={Boolean(onSelect)} />} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          onClick={onSelect ? (entry) => onSelect(String(entry.value)) : undefined}
          wrapperStyle={onSelect ? { cursor: "pointer" } : undefined}
          formatter={(value) => (
            <span className="text-zinc-400 text-xs">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
