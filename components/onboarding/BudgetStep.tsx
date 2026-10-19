"use client";

import { Card } from "@/components/ui/Card";
import { NumField, Row } from "@/components/planner/ui";
import type { Household } from "@/components/household/useHousehold";
import { computePay, computePosition, derivePlannerView, type PlannerInputs } from "@/lib/planner";
import { byPriority, goalInputs, summarizeGoal } from "@/lib/goals";
import type { Money } from "@/lib/household";

// A first monthly budget from the income and goals just entered. Nothing has synced yet, so pay is the
// estimates and progress is today's balances. It becomes the Planner's starting point.
export function BudgetStep({ h, money, value, onChange }: {
  h: Household;
  money: Money;
  value: PlannerInputs; // with the suggested lifestyle filled in until the user sets their own
  onChange: (patch: Partial<PlannerInputs>) => void;
}) {
  const { fmt, symbol } = money;
  const now = new Date();
  const pay = computePay([], h.sources, h.members, now);
  const accounts = h.accounts.map((a) => ({ ...a, updatedAt: now, balanceMode: "plaid" }));
  const memberIds = h.members.map((m) => m.id);
  const position = computePosition(accounts, [], memberIds, money.currency);
  const view = derivePlannerView(value, { quotes: {}, actuals: [], pay, position, basis: null, sources: h.sources, members: h.members }, now);
  const active = byPriority(h.goals.filter((g) => g.status === "active"));
  const { goalPositions, goalDebts } = goalInputs(active, accounts, [], memberIds, money.currency);
  const goals = active.map((g) => summarizeGoal(g, { view, position, goalPositions, goalDebts, members: h.members }, now));

  const takeHome = view.income.total;
  const living = value.rent + value.lifestyle;
  const free = takeHome - living - value.retirementMonthly;
  const goalTotal = goals.reduce((s, g) => s + g.plannedMonthly, 0);
  const left = free - goalTotal;

  return (
    <>
      <Card className="space-y-4">
        <p className="text-sm text-zinc-400">
          A starting point: keep living costs to about 80% of take-home pay and put the rest toward goals and retirement.
          Adjust anything; the Planner tracks it against real spending once transactions come in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <NumField label="Rent per month" prefix={symbol} value={value.rent} onChange={(v) => onChange({ rent: v })} step={50} note="0 if you own or don't pay rent" />
          <NumField label="Everything else per month" prefix={symbol} value={value.lifestyle} onChange={(v) => onChange({ lifestyle: v })} step={100}
            note="Food, transport, bills, fun: all spending except rent" />
          <NumField label="Retirement contributions" prefix={symbol} value={value.retirementMonthly} onChange={(v) => onChange({ retirementMonthly: v })} step={50}
            note="From take-home pay, per month" />
        </div>
      </Card>

      <Card>
        <Row label={`Take-home pay${pay.length ? "" : " (no income added)"}`} value={fmt(takeHome)} tone="text-emerald-400" />
        <Row label={`Living costs (${takeHome > 0 ? Math.round((living / takeHome) * 100) : 0}% of pay)`} value={`−${fmt(living)}`} />
        <Row label="Retirement" value={`−${fmt(value.retirementMonthly)}`} />
        <Row label="Free for goals" value={fmt(free)} tone={free >= 0 ? "text-zinc-100" : "text-red-400"} bold />
        {goals.map((g) => (
          <Row
            key={g.goal.id}
            label={g.neededMonthly === null ? `${g.goal.name} (no deadline)` : `${g.goal.name}, by the deadline`}
            value={`−${fmt(g.plannedMonthly)}`}
            tone="text-violet-300"
          />
        ))}
        <Row label={left >= 0 ? "Left to invest" : "Short each month"} value={fmt(Math.abs(left))} tone={left >= 0 ? "text-emerald-400" : "text-red-400"} bold />
        {left < 0 && (
          <p className="text-xs text-amber-400 mt-3">
            Your goals need more than is left over. Push a deadline back, lower a target, or spend less; you can change all of these later.
          </p>
        )}
        {view.income.equityPerYear > 0 && (
          <p className="text-xs text-zinc-500 mt-3">
            Not counted above: about {fmt(view.income.equityPerYear)} a year from equity vests, which the Planner adds in the months they land.
          </p>
        )}
      </Card>
    </>
  );
}
