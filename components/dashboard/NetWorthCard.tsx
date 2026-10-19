import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/formatters";

interface NetWorthCardProps {
  netWorth: number;
  change: number;
  currency?: string;
}

export function NetWorthCard({ netWorth, change, currency = "USD" }: NetWorthCardProps) {
  const positive = change >= 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Net Worth</CardTitle>
        {change !== 0 && (
          <span className={`text-xs font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}>
            {positive ? "+" : ""}{formatCurrency(change, currency, true)} MoM
          </span>
        )}
      </CardHeader>
      <p className="text-3xl font-bold text-zinc-100">{formatCurrency(netWorth, currency, true)}</p>
    </Card>
  );
}
