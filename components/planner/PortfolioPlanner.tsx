"use client";

import { useState } from "react";
import Link from "next/link";
import { BasisSummary, DEFAULT_INPUTS, Pay, PlannerInputs, PlannerPosition, PlannerView, derivePlannerView } from "@/lib/planner";
import { makeMoney, type Goal, type IncomeSource, type Member, type Money } from "@/lib/household";
import { byPriority, summarizeGoal, type GoalSummary } from "@/lib/goals";
import { Button } from "@/components/ui/Button";
import { useAutosave } from "@/components/household/useAutosave";
import type { Quote } from "@/lib/quote";
import type { ActualMonth } from "@/lib/actuals";
import { ProjectionTab } from "./ProjectionTab";
import { BudgetTab } from "./BudgetTab";
import { HomePurchaseTab } from "./HomePurchaseTab";
import { GoalsTab } from "./GoalsTab";

// Each tab gets the planner view (values in use) plus the raw data and the update functions.
export type TabProps = PlannerView & {
  update: (patch: Partial<PlannerInputs>) => void;
  updateSource: (id: string, patch: Partial<IncomeSource>) => void;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  pay: Pay[];
  position: PlannerPosition;
  actuals: ActualMonth[];
  members: Member[];
  goals: GoalSummary[];
  money: Money;
};

export function PortfolioPlanner({
  settings,
  members,
  initialSources,
  initialGoals,
  goalPositions,
  goalDebts,
  position,
  quotes,
  actuals,
  pay,
  basis,
  initialInputs,
}: {
  settings: { baseCurrency: string; locale: string };
  members: Member[];
  initialSources: IncomeSource[];
  initialGoals: Goal[];
  goalPositions: Record<string, PlannerPosition | null>;
  goalDebts: Record<string, number | null>;
  position: PlannerPosition;
  quotes: Record<string, Quote | null>;
  actuals: ActualMonth[];
  pay: Pay[];
  basis: BasisSummary | null;
  initialInputs: PlannerInputs;
}) {
  const [inputs, setInputs] = useState(initialInputs);
  const [sources, setSources] = useState(initialSources);
  const [goals, setGoals] = useState(initialGoals);
  const [tab, setTab] = useState("projection");
  const { state: saveState, save } = useAutosave();
  const money = makeMoney(settings.baseCurrency, settings.locale);

  function update(patch: Partial<PlannerInputs>) {
    const next = { ...inputs, ...patch };
    setInputs(next);
    save("/api/planner", next, true);
  }

  function updateSource(id: string, patch: Partial<IncomeSource>) {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    save(`/api/income-sources/${id}`, patch);
  }

  function updateGoal(id: string, patch: Partial<Goal>) {
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    save(`/api/goals/${id}`, patch);
  }

  function reset() {
    if (confirm("Reset the household assumptions (rent, lifestyle, projection) to their defaults? Goals and income are kept.")) update(DEFAULT_INPUTS);
  }

  // Tabs see the values in use (live rent, share prices and tax drag); edits still go to the saved inputs.
  const view = derivePlannerView(inputs, { quotes, actuals, pay, position, basis, sources, members });
  // Achieved and archived goals drop out of the plan.
  const summaries = byPriority(goals.filter((g) => g.status === "active")).map((g) => summarizeGoal(g, { view, position, goalPositions, goalDebts, members }));
  const props: TabProps = { ...view, update, updateSource, updateGoal, pay, position, actuals, members, goals: summaries, money };
  const { income, start } = view;
  const houses = summaries.filter((s) => s.plan);
  const tabs = [
    { key: "projection", label: "Projection" },
    { key: "budget", label: "Monthly Budget" },
    { key: "goals", label: "Goals" },
    ...houses.map((s) => ({ key: s.goal.id, label: s.goal.name })),
  ];
  const house = houses.find((s) => s.goal.id === tab);
  const vestText = income.equityPerYear > 0 ? ` + vests ~${money.compact(income.equityPerYear)}/yr` : "";

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Planner</h1>
          <p className="text-sm text-zinc-400 mt-1 tabular-nums">
            Starting base {money.compact(start.total)} · Take-home {money.compact(income.total)}/mo{vestText}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${saveState === "error" ? "text-red-400" : "text-zinc-500"}`}>
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved"}
          </span>
          <Button variant="ghost" size="sm" onClick={reset}>Reset</Button>
        </div>
      </div>

      {(position.warnings.length > 0 || sources.length === 0) && (
        <div className="rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300 space-y-1">
          {sources.length === 0 && (
            <p>No income sources yet, so take-home pay is zero. Add them in <Link href="/settings" className="underline">Settings</Link>.</p>
          )}
          {position.warnings.map((w) => <p key={w}>{w}</p>)}
        </div>
      )}

      <div className="inline-flex p-1 rounded-lg bg-zinc-900 border border-zinc-800 max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.key ? "bg-violet-600/20 text-violet-400" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projection" && <ProjectionTab {...props} />}
      {tab === "budget" && <BudgetTab {...props} />}
      {tab === "goals" && <GoalsTab {...props} openTab={setTab} />}
      {house && <HomePurchaseTab {...props} summary={house} />}

      <p className="text-[11px] text-zinc-600 leading-relaxed">
        {pay.length > 0 && <>Take-home: {pay.map((p) => payNote(p, money)).join("; ")}. </>}
        One-off contributions (gifts, bonuses) count only toward their goal, not the projection. Equity vests use the share
        price and tax rate set for each grant. Does not include tax drag or fees.
      </p>
    </div>
  );
}

export function payNote(p: Pay, money: Money): string {
  const who = `${p.member} (${p.source})`;
  if (p.basis === "paychecks") return `${who} ${money.fmt(p.perPaycheck ?? 0)} per paycheck, median of the last 3, latest ${p.lastPaid}`;
  if (p.basis === "average") return `${who} ${money.fmt(p.monthly)}/mo, averaged over the last 3 months`;
  return `${who} estimated at ${money.fmt(p.monthly)}/mo until a matching deposit syncs`;
}
