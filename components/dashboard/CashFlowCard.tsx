import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency, formatPercent } from "@/lib/formatters";

interface CashFlowCardProps {
  income: number;
  expenses: number;
  savingsRate: number;
  currency?: string;
}

export function CashFlowCard({ income, expenses, savingsRate, currency = "USD" }: CashFlowCardProps) {
  const net = income - expenses;
  const positive = net >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>This Month</CardTitle>
        <span className={`text-xs font-medium ${positive ? "text-emerald-400" : "text-red-400"}`}>
          {formatPercent(savingsRate)} saved
        </span>
      </CardHeader>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-xs text-zinc-500 mb-1">Income</p>
          <p className="text-lg font-semibold text-emerald-400">{formatCurrency(income, currency, true)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Expenses</p>
          <p className="text-lg font-semibold text-red-400">{formatCurrency(expenses, currency, true)}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500 mb-1">Net</p>
          <p className={`text-lg font-semibold ${positive ? "text-emerald-400" : "text-red-400"}`}>
            {formatCurrency(net, currency, true)}
          </p>
        </div>
      </div>
    </Card>
  );
}
