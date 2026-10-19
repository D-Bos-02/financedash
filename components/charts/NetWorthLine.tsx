"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { formatCurrency, formatMonth } from "@/lib/formatters";

interface DataPoint {
  date: string;
  netWorth: number;
}

interface NetWorthLineProps {
  data: DataPoint[];
  currency?: string;
  height?: number;
  sparkline?: boolean;
}

function CustomTooltip({ active, payload, currency }: { active?: boolean; payload?: { value: number }[]; currency: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <span className="font-semibold text-zinc-100">{formatCurrency(payload[0].value, currency, true)}</span>
    </div>
  );
}

export function NetWorthLine({ data, currency = "USD", height = 220, sparkline = false }: NetWorthLineProps) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-zinc-600 text-sm" style={{ height }}>
        No history yet — balances will appear here after updates.
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: formatMonth(d.date + "-01"),
  }));

  const min = Math.min(...data.map((d) => d.netWorth));
  const max = Math.max(...data.map((d) => d.netWorth));
  const padding = (max - min) * 0.1 || 1000;

  if (sparkline) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={formatted} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line type="monotone" dataKey="netWorth" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formatted} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
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
          domain={[min - padding, max + padding]}
          width={70}
        />
        <Tooltip content={<CustomTooltip currency={currency} />} cursor={{ stroke: "#52525b" }} />
        {min < 0 && <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />}
        <Line
          type="monotone"
          dataKey="netWorth"
          stroke="#8b5cf6"
          strokeWidth={2.5}
          dot={{ fill: "#8b5cf6", r: 3, strokeWidth: 0 }}
          activeDot={{ fill: "#a78bfa", r: 5, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
