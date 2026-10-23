"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { GOAL_TEMPLATES } from "@/lib/household";
import type { GoalStatus, GoalSummary } from "@/lib/goals";
import { Row, SectionLabel, Stat, tone } from "./ui";
import type { TabProps } from "./PortfolioPlanner";

const STATUS: Record<GoalStatus, { label: string; className: string }> = {
  reached: { label: "Reached", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  on_track: { label: "On track", className: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  behind: { label: "Behind", className: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
  no_deadline: { label: "No deadline", className: "text-zinc-300 bg-zinc-800 border-zinc-700" },
};

const field = "w-28 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-zinc-100 tabular-nums focus:outline-none focus:border-violet-500";
const monthLabel = (monthsFromNow: number, now = new Date()) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthsFromNow, 1))
  );

function GoalCard({ s, money, updateGoal, openTab }: { s: GoalSummary; money: TabProps["money"]; updateGoal: TabProps["updateGoal"]; openTab: (key: string) => void }) {
  const { goal } = s;
  const { fmt } = money;
  const debt = s.debt;
  const pct = s.target > 0 ? Math.min(100, (s.saved / s.target) * 100) : 100;
  const pendingPct = s.target > 0 ? Math.min(100 - pct, (s.pending / s.target) * 100) : 0;
  const template = GOAL_TEMPLATES.find((t) => t.value === goal.template)?.label ?? goal.template;
  const status = STATUS[s.status];

  const atPlan =
    s.status === "reached" ? "Done"
    : s.monthsAtPlan === null
      ? debt && s.plannedMonthly > 0 ? "Never at this amount: it doesn't cover the interest" : "Set a monthly amount to see when"
    : `${monthLabel(s.monthsAtPlan)} (${s.monthsAtPlan} month${s.monthsAtPlan === 1 ? "" : "s"})`;

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100 truncate">{goal.name}</p>
          <p className="text-[11px] text-zinc-500">{template}</p>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
      </div>

      <div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
          <div className="h-full bg-violet-500/35" style={{ width: `${pendingPct}%` }} />
        </div>
        <p className="text-[11px] text-zinc-500 mt-1 tabular-nums">
          {fmt(s.saved)} of {fmt(s.target)} {debt ? "paid off" : "saved"}
          {s.pending > 0 && ` · ${fmt(s.pending)} to come`}
        </p>
      </div>

      <div>
        {debt ? (
          <>
            <Row label="Still owed" value={fmt(debt.owed)} />
            <div className="flex justify-between items-center gap-3 py-2 border-b border-zinc-800">
              <span className="text-xs text-zinc-400">Interest rate (APR)</span>
              <span className="flex items-center gap-1 text-xs text-zinc-500">
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={debt.aprPct}
                  onChange={(e) => updateGoal(goal.id, { details: { ...goal.details, aprPct: Math.max(0, Number(e.target.value) || 0) } })}
                  className={field}
                  aria-label="Interest rate"
                />
                %
              </span>
            </div>
          </>
        ) : (
          <Row label="Left to save" value={fmt(s.remaining)} tone={s.remaining > 0 ? "text-zinc-100" : "text-emerald-400"} />
        )}
        <Row
          label={s.months === null ? "Deadline" : "Needed per month"}
          value={s.neededMonthly === null ? "None set" : `${fmt(s.neededMonthly)} for ${s.months} months`}
          tone={s.neededMonthly === null ? "text-zinc-500" : "text-amber-400"}
        />
        <div className="flex justify-between items-center gap-3 py-2 border-b border-zinc-800">
          <span className="text-xs text-zinc-400">
            Planned per month
            {goal.plannedMonthly !== null && s.neededMonthly !== null && (
              <button type="button" onClick={() => updateGoal(goal.id, { plannedMonthly: null })} className="ml-2 text-violet-400 hover:text-violet-300">
                use needed
              </button>
            )}
          </span>
          <input
            type="number"
            min={0}
            step={50}
            value={Math.round(s.plannedMonthly)}
            onChange={(e) => updateGoal(goal.id, { plannedMonthly: Math.max(0, Number(e.target.value) || 0) })}
            className={field}
            aria-label={`Planned per month for ${goal.name}`}
          />
        </div>
        <Row label={debt ? "Paid off at that rate" : "Reached at that rate"} value={atPlan} tone={tone(s.monthsAtPlan !== null)} />
        {debt && debt.interestAtPlan !== null && debt.interestAtPlan > 0 && s.status !== "reached" && (
          <Row label="Interest on the way" value={fmt(debt.interestAtPlan)} tone="text-zinc-400" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {s.plan && <Button variant="secondary" size="sm" onClick={() => openTab(goal.id)}>Open home plan →</Button>}
        {s.status === "reached" && (
          <Button size="sm" onClick={() => updateGoal(goal.id, { status: "achieved" })}>Mark achieved</Button>
        )}
        {goal.accounts.length === 0 && !s.plan && s.status !== "reached" && (
          <p className="text-[11px] text-zinc-500">
            {debt ? "Link the card or loan in Settings to track what's paid off." : "Link the accounts it's saved in (Settings) to track progress."}
          </p>
        )}
      </div>
    </Card>
  );
}

// Every goal at a glance: progress, whether the plan gets there in time, and when it finishes at the planned amount.
export function GoalsTab({ goals, inputs, income, money, updateGoal, openTab }: TabProps & { openTab: (key: string) => void }) {
  const { fmt } = money;
  const free = income.total - inputs.rent - inputs.lifestyle - inputs.retirementMonthly;
  const planned = goals.reduce((s, g) => s + g.plannedMonthly, 0);
  const behind = goals.filter((g) => g.status === "behind").length;

  if (!goals.length) {
    return (
      <Card>
        <p className="text-sm text-zinc-400">
          No goals yet. Add an emergency fund, a home, a car, paying off a card, or anything else in{" "}
          <Link href="/settings" className="text-violet-400 hover:text-violet-300">Settings</Link>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Free for goals each month" value={fmt(free)} tone={tone(free >= 0)} sub="Take-home less rent, lifestyle and retirement" /></Card>
        <Card><Stat label="Planned for goals" value={fmt(planned)} tone="text-violet-300" sub={`${goals.length} goal${goals.length === 1 ? "" : "s"}`} /></Card>
        <Card>
          <Stat
            label={free - planned >= 0 ? "Left over" : "Short each month"}
            value={fmt(Math.abs(free - planned))}
            tone={tone(free - planned >= 0)}
            sub={behind ? `${behind} goal${behind === 1 ? " is" : "s are"} behind its deadline` : "Every goal with a deadline is on track"}
          />
        </Card>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>In priority order</SectionLabel>
          <Link href="/settings" className="text-xs text-violet-400 hover:text-violet-300">Add or edit goals →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((s) => <GoalCard key={s.goal.id} s={s} money={money} updateGoal={updateGoal} openTab={openTab} />)}
        </div>
        <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
          Progress comes from the accounts linked to each goal (a home with none linked counts everything you have). Debts count
          what&apos;s been paid off since the starting balance, read from the linked cards and loans. Home goals subtract equity vests
          expected before the deadline.
        </p>
      </section>
    </div>
  );
}
