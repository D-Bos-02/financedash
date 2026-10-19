"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { NumField, SectionLabel, Stat } from "./ui";
import type { TabProps } from "./PortfolioPlanner";
import type { ActualMonth } from "@/lib/actuals";

const TYPES = {
  expenses: { label: "Expenses", color: "#f87171" },
  retirement: { label: "Retirement", color: "#34d399" },
  goals: { label: "Goals", color: "#a78bfa" },
  invest: { label: "Invest", color: "#38bdf8" },
} as const;

type BudgetType = keyof typeof TYPES;

export function BudgetTab({ inputs, update, updateGoal, income, actuals, rent: rentInfo, vests, grants, goals, money }: TabProps) {
  const { fmt, symbol } = money;
  const { rent, lifestyle, retirementMonthly, matchMonthly } = inputs;
  const goalTotal = goals.reduce((s, g) => s + g.plannedMonthly, 0);
  const leftover = income.total - rent - lifestyle - retirementMonthly - goalTotal;
  const saved = income.total - rent - lifestyle;
  const pctOf = (v: number) => (income.total > 0 ? (v / income.total) * 100 : 0);
  const hasVests = grants.length > 0;

  const rows: { key: string; category: string; amount: number; type: BudgetType; note: string }[] = [
    { key: "rent", category: "Rent", amount: rent, type: "expenses", note: rent ? "Current lease" : "None" },
    { key: "lifestyle", category: "Lifestyle and expenses", amount: lifestyle, type: "expenses", note: "Everything except rent" },
    { key: "retirement", category: "Retirement contributions", amount: retirementMonthly, type: "retirement", note: retirementMonthly ? "From take-home pay" : "Not started yet" },
    ...goals.map((g) => ({
      key: g.goal.id,
      category: g.goal.name,
      amount: g.plannedMonthly,
      type: "goals" as const,
      note: g.neededMonthly === null ? "No deadline" : `${fmt(g.neededMonthly)}/mo needed by the deadline`,
    })),
    { key: "remaining", category: "Remaining", amount: Math.max(0, leftover), type: "invest", note: "Invest, or add to a goal" },
  ];

  const byType = (Object.keys(TYPES) as BudgetType[]).map((type) => ({
    type,
    ...TYPES[type],
    amount: rows.filter((r) => r.type === type).reduce((s, r) => s + r.amount, 0),
  }));

  const payOf = (m: ActualMonth) => m.income - m.equityIncome;
  const actualRows = [
    { label: "Take-home pay", plan: income.total, actual: payOf },
    { label: "Rent", plan: rent, actual: (m: ActualMonth) => m.rent },
    { label: "Lifestyle", plan: lifestyle, actual: (m: ActualMonth) => m.lifestyle },
  ];

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Editable assumptions</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NumField
            label="Rent"
            prefix={symbol}
            value={rent}
            onChange={(v) => update({ rent: v, rentLive: false })}
            step={100}
            note={
              rentInfo.live ? (
                <span className="text-emerald-400">Actual rent from your transactions. Type to override.</span>
              ) : rentInfo.actual ? (
                <button type="button" onClick={() => update({ rentLive: true })} className="text-violet-400 hover:text-violet-300">
                  Manual. Use actual {fmt(rentInfo.actual)}
                </button>
              ) : (
                "No rent found in transactions (Housing › Rent), using this figure"
              )
            }
          />
          <NumField label="Lifestyle and expenses" prefix={symbol} value={lifestyle} onChange={(v) => update({ lifestyle: v })} step={250} note="Everything except rent. Set this to your real spending." />
          <NumField label="Retirement contributions per month" prefix={symbol} value={retirementMonthly} onChange={(v) => update({ retirementMonthly: v })} step={100}
            note="Paid from take-home pay, for the whole household" />
          {goals.map((g) => (
            <NumField
              key={g.goal.id}
              label={`${g.goal.name} per month`}
              prefix={symbol}
              value={Math.round(g.plannedMonthly)}
              onChange={(v) => updateGoal(g.goal.id, { plannedMonthly: v })}
              step={250}
              note={
                g.goal.plannedMonthly === null ? (
                  "What the deadline needs. Type to set your own."
                ) : g.neededMonthly !== null ? (
                  <button type="button" onClick={() => updateGoal(g.goal.id, { plannedMonthly: null })} className="text-violet-400 hover:text-violet-300">
                    Use what&apos;s needed ({fmt(g.neededMonthly)})
                  </button>
                ) : (
                  "No deadline set"
                )
              }
            />
          ))}
        </div>
      </section>

      <div className={`grid grid-cols-1 sm:grid-cols-2 ${hasVests ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
        <Card><Stat label="Monthly take-home" value={fmt(income.total)} sub={hasVests ? "Regular pay, after tax. Vests are separate." : "Regular pay, after tax"} /></Card>
        <Card><Stat label="Spending" value={fmt(rent + lifestyle)} tone="text-red-400" sub="Rent + lifestyle" /></Card>
        <Card><Stat label="Saved and invested" value={fmt(saved)} tone="text-emerald-400" sub={`${pctOf(saved).toFixed(0)}% of take-home pay`} /></Card>
        {hasVests && (
          <Card>
            <p className="text-xs text-zinc-400 mb-1">Equity vests</p>
            <p className="text-xl font-semibold tabular-nums text-violet-300">~{fmt(income.equityPerYear)}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">a year, after tax</p>
            {vests[0] && <p className="text-[11px] text-zinc-500">Next: {vests[0].label}, ~{fmt(vests[0].amount)}</p>}
          </Card>
        )}
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Plan vs actual</SectionLabel>
          <Link href="/cash-flow" className="text-xs text-violet-400 hover:text-violet-300">Cash flow →</Link>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-sm tabular-nums min-w-[480px]">
            <thead>
              <tr className="text-xs text-zinc-400 text-right align-bottom">
                <th className="text-left font-normal pb-2"></th>
                <th className="font-medium pb-2 pl-4 text-violet-400">Plan</th>
                {actuals.map((m) => (
                  <th key={m.key} className="font-normal pb-2 pl-4">
                    <span className="text-zinc-300">{m.label}</span>
                    {m.coverage && <span className="block text-[10px] text-amber-400/80">{m.coverage}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {actualRows.map((row) => (
                <tr key={row.label}>
                  <td className="py-2 text-zinc-400">{row.label}</td>
                  <td className="py-2 pl-4 text-right text-zinc-100">{fmt(row.plan)}</td>
                  {actuals.map((m) => (
                    <td key={m.key} className="py-2 pl-4 text-right text-zinc-300">{fmt(row.actual(m))}</td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 text-zinc-300">Left over from pay</td>
                <td className={`py-2 pl-4 text-right ${saved >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(saved)}</td>
                {actuals.map((m) => {
                  const left = payOf(m) - m.rent - m.lifestyle;
                  return <td key={m.key} className={`py-2 pl-4 text-right ${left >= 0 ? "text-emerald-400" : "text-red-400"}`}>{fmt(left)}</td>;
                })}
              </tr>
              {hasVests && (
                <tr>
                  <td className="py-2 text-zinc-400">+ Equity vests</td>
                  <td className="py-2 pl-4 text-right text-violet-300 text-xs">~{fmt(income.equityPerYear)} a year</td>
                  {actuals.map((m) => (
                    <td key={m.key} className="py-2 pl-4 text-right text-violet-300">{m.equityIncome ? fmt(m.equityIncome) : <span className="text-zinc-600">–</span>}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
          Actuals come from synced transactions, leaving out transfers between your own accounts.
          {hasVests && " Equity vests are shown on their own, since they land as lumps."}
          {" "}Lifestyle is all other spending, net of refunds. Sync on the Accounts page to refresh.
        </p>
      </Card>

      <Card>
        <SectionLabel>Monthly allocation</SectionLabel>
        <div className="space-y-3">
          {rows.map((row) => {
            const pct = Math.max(0, pctOf(row.amount));
            const { color } = TYPES[row.type];
            return (
              <div key={row.key}>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="text-sm text-zinc-200 truncate">{row.category}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <span className="hidden sm:inline text-xs text-zinc-500">{row.note}</span>
                    <span className="text-sm font-medium tabular-nums w-20 text-right" style={{ color }}>{fmt(row.amount)}</span>
                    <span className="text-xs text-zinc-500 tabular-nums w-9 text-right">{pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full opacity-80" style={{ background: color, width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-zinc-800 mt-5 pt-4 flex justify-between items-center">
          <span className="text-sm text-zinc-400">{leftover < 0 ? "Over budget by" : "Total accounted for"}</span>
          <span className={`font-semibold tabular-nums ${leftover < 0 ? "text-red-400" : "text-zinc-100"}`}>
            {leftover < 0 ? fmt(-leftover) : fmt(income.total)}
          </span>
        </div>
      </Card>

      <Card>
        <SectionLabel>By category</SectionLabel>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {byType.map((b) => (
            <div key={b.type} className="rounded-lg border border-zinc-800 bg-zinc-800/40 px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide mb-1" style={{ color: b.color }}>{b.label}</p>
              <p className="text-lg font-semibold text-zinc-100 tabular-nums">{fmt(b.amount)}</p>
              <p className="text-[11px] text-zinc-500">{pctOf(b.amount).toFixed(0)}% of take-home</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Priority order</SectionLabel>
        <ol className="space-y-3">
          {priorities({ goals, hasVests, matchMonthly, monthlySpend: rent + lifestyle, fmt }).map((item, i) => (
            <li key={item.title} className="flex gap-3 items-start">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 border"
                style={{ color: item.color, borderColor: item.color + "60", background: item.color + "1a" }}
              >
                {i + 1}
              </span>
              <div>
                <p className="text-sm text-zinc-200">{item.title}</p>
                <p className="text-xs text-zinc-500">{item.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

// A common order for where spare money goes, with the household's own goals in their priority order.
function priorities({ goals, hasVests, matchMonthly, monthlySpend, fmt }: {
  goals: TabProps["goals"]; hasVests: boolean; matchMonthly: number; monthlySpend: number; fmt: (v: number) => string;
}) {
  const hasEmergencyFund = goals.some((g) => g.goal.template === "emergency_fund");
  return [
    {
      title: "Capture any employer retirement match",
      detail: matchMonthly > 0 ? `Your plan counts ${fmt(matchMonthly)} a month of match` : "If your employer matches contributions, get the full match first",
      color: TYPES.retirement.color,
    },
    ...(hasEmergencyFund ? [] : [{
      title: "Build an emergency fund",
      detail: `Commonly 3 to 6 months of spending: ${fmt(monthlySpend * 3)} to ${fmt(monthlySpend * 6)}. Add it as a goal to track it.`,
      color: TYPES.goals.color,
    }]),
    ...goals.map((g) => ({
      title: g.debt ? `Pay off ${g.goal.name}` : `Fund ${g.goal.name}`,
      detail: g.neededMonthly === null ? `${fmt(g.remaining)} to go, no deadline` : `${fmt(g.remaining)} to go: ${fmt(g.neededMonthly)} a month over ${g.months} months`,
      color: TYPES.goals.color,
    })),
    { title: "Contribute to retirement accounts", detail: "Tax-advantaged accounts first, up to the limits where you live", color: TYPES.retirement.color },
    ...(hasVests ? [{
      title: "Set aside the tax gap as each vest lands",
      detail: "If your employer withholds less than the tax you'll owe, keep the difference in a separate account",
      color: "#f59e0b",
    }] : []),
    { title: "Invest what remains", detail: "A taxable brokerage account once the goals above are on track", color: TYPES.invest.color },
  ];
}
