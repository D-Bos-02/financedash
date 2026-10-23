import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/formatters";
import { BudgetAlert as BudgetAlertType } from "@/types";

interface BudgetAlertsProps {
  alerts: BudgetAlertType[];
  currency?: string;
}

export function BudgetAlerts({ alerts, currency = "USD" }: BudgetAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget Alerts</CardTitle>
        <span className="text-xs text-amber-400">{alerts.length} at risk</span>
      </CardHeader>
      <div className="space-y-3">
        {alerts.map((alert) => {
          const color =
            alert.percent >= 100 ? "bg-red-500" : alert.percent >= 75 ? "bg-amber-500" : "bg-emerald-500";
          const textColor =
            alert.percent >= 100 ? "text-red-400" : alert.percent >= 75 ? "text-amber-400" : "text-emerald-400";
          return (
            <div key={alert.category}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-sm text-zinc-300">{alert.category}</span>
                <span className={`text-xs font-medium ${textColor}`}>
                  {formatCurrency(alert.spent, currency, true)} / {formatCurrency(alert.budgeted, currency, true)}
                </span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${color}`}
                  style={{ width: `${Math.min(alert.percent, 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
