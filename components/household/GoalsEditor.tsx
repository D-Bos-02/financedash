"use client";

import { Button } from "@/components/ui/Button";
import { GOAL_TEMPLATES, type Goal } from "@/lib/household";
import { houseDetails } from "@/lib/home-plan";
import { ContributionsEditor } from "./ContributionsEditor";
import type { Household } from "./useHousehold";

const field = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500";
const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));
// Deadlines are picked by month and stored as the 1st of that month (UTC).
const toMonth = (iso: string | null) => (iso ? iso.slice(0, 7) : "");
const fromMonth = (v: string) => (v ? `${v}-01T00:00:00.000Z` : null);

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1">{label}</span>
      {children}
      {note && <span className="block text-[11px] text-zinc-500 mt-1">{note}</span>}
    </label>
  );
}

function GoalCard({ g, h, symbol, first, last }: { g: Goal; h: Household; symbol: string; first: boolean; last: boolean }) {
  const update = (patch: Partial<Goal>) => h.updateGoal(g.id, patch);
  const template = GOAL_TEMPLATES.find((t) => t.value === g.template)?.label ?? g.template;
  const house = g.template === "house" ? houseDetails(g.details) : null;
  const debt = g.template === "debt_payoff";
  // A debt is tracked on cards and loans; anything else on the accounts the money is saved in.
  const linkable = h.accounts.filter((a) => (debt ? a.type === "credit" || a.type === "loan" : !["credit", "loan", "property"].includes(a.type)));
  const share = (accountId: string) => g.accounts.find((a) => a.accountId === accountId)?.share;

  function toggleAccount(accountId: string, on: boolean) {
    update({ accounts: on ? [...g.accounts, { accountId, share: 1 }] : g.accounts.filter((a) => a.accountId !== accountId) });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <input value={g.name} onChange={(e) => update({ name: e.target.value })} className={`${field} flex-1 font-medium`} maxLength={80} aria-label="Goal name" />
        <span className="hidden sm:inline text-xs text-zinc-500 shrink-0">{template}</span>
        {g.status === "achieved" && (
          <>
            <span className="text-[11px] px-2 py-0.5 rounded-full border text-emerald-300 bg-emerald-500/10 border-emerald-500/30 shrink-0">Achieved</span>
            <Button variant="ghost" size="sm" onClick={() => update({ status: "active" })}>Reopen</Button>
          </>
        )}
        <Button variant="ghost" size="sm" disabled={first} onClick={() => h.moveGoal(g.id, -1)} aria-label="Higher priority">↑</Button>
        <Button variant="ghost" size="sm" disabled={last} onClick={() => h.moveGoal(g.id, 1)} aria-label="Lower priority">↓</Button>
        <Button variant="ghost" size="sm" onClick={() => confirm(`Delete the goal "${g.name}"?`) && h.removeGoal(g.id)}>Delete</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {house ? (
          <>
            <Field label={`Home price (${symbol})`}>
              <input type="number" min={0} step={10000} value={house.price} onChange={(e) => update({ details: { ...g.details, price: num(e.target.value) } })} className={field} />
            </Field>
            <Field label="Deposit (%)" note="Closing costs, reserve and mortgage are in the Planner">
              <input type="number" min={0} max={100} value={house.depPct} onChange={(e) => update({ details: { ...g.details, depPct: Math.min(100, num(e.target.value)) } })} className={field} />
            </Field>
          </>
        ) : (
          <>
            <Field label={debt ? `Starting balance (${symbol})` : `Target (${symbol})`} note={debt ? "Progress is how much of it has been paid off" : undefined}>
              <input type="number" min={0} step={500} value={g.targetAmount} onChange={(e) => update({ targetAmount: num(e.target.value) })} className={field} />
            </Field>
            {debt && (
              <Field label="Interest rate (APR %)">
                <input type="number" min={0} step={0.5} value={Number(g.details.aprPct) || 0} onChange={(e) => update({ details: { ...g.details, aprPct: num(e.target.value) } })} className={field} />
              </Field>
            )}
          </>
        )}
        <Field label={house ? "Buy by" : debt ? "Clear by" : "Reach by"} note={g.deadline ? undefined : "No deadline: set a monthly amount in the Planner instead"}>
          <input type="month" value={toMonth(g.deadline)} onChange={(e) => update({ deadline: fromMonth(e.target.value) })} className={field} />
        </Field>
      </div>

      {linkable.length > 0 && (
        <div>
          <span className="block text-xs text-zinc-400 mb-1">{debt ? "Owed on" : "Saved in"}</span>
          <div className="space-y-1">
            {linkable.map((a) => {
              const s = share(a.id);
              return (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <label className="flex items-center gap-2 flex-1 min-w-0 text-zinc-300">
                    <input type="checkbox" checked={s !== undefined} onChange={(e) => toggleAccount(a.id, e.target.checked)} className="accent-violet-500" />
                    <span className="truncate">{a.name}</span>
                  </label>
                  {s !== undefined && (
                    <label className="flex items-center gap-1 text-xs text-zinc-500">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(s * 100)}
                        onChange={(e) => update({ accounts: g.accounts.map((x) => (x.accountId === a.id ? { ...x, share: Math.min(100, num(e.target.value)) / 100 } : x)) })}
                        className="w-16 bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-100 tabular-nums"
                        aria-label={`Share of ${a.name}`}
                      />
                      % of it
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            {house ? "Leave all unticked to count everything you have toward the purchase."
              : debt ? "What's owed is read from these balances. Use a share if only part of a balance belongs to this goal."
              : "Progress is the balance of these accounts. Use a share when one account holds money for several goals."}
          </p>
        </div>
      )}

      <details className="text-sm" open={g.contributions.length > 0}>
        <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">One-off contributions{g.contributions.length ? ` (${g.contributions.length})` : ""}</summary>
        <div className="mt-2">
          <ContributionsEditor contributions={g.contributions} members={h.members} symbol={symbol} onChange={(contributions) => update({ contributions })} />
        </div>
      </details>
    </div>
  );
}

// Goals in priority order (top is funded first), plus templates to add more.
export function GoalsEditor({ h, symbol, monthlySpend = 0 }: { h: Household; symbol: string; monthlySpend?: number }) {
  const goals = [...h.goals].sort((a, b) => a.priority - b.priority);
  return (
    <div className="space-y-4">
      {goals.length === 0 && <p className="text-sm text-zinc-500">No goals yet. Pick one or more below; you can change everything later.</p>}
      {goals.map((g, i) => <GoalCard key={g.id} g={g} h={h} symbol={symbol} first={i === 0} last={i === goals.length - 1} />)}
      <div>
        <p className="text-xs text-zinc-400 mb-2">Add a goal</p>
        <div className="flex flex-wrap gap-2">
          {GOAL_TEMPLATES.map((t) => (
            <Button key={t.value} variant="secondary" size="sm" onClick={() => h.addGoal(t.value, monthlySpend)}>+ {t.label}</Button>
          ))}
        </div>
      </div>
    </div>
  );
}
