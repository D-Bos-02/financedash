"use client";

import { Button } from "@/components/ui/Button";
import { COMMON_CURRENCIES, type GoalContribution, type Member } from "@/lib/household";

const field = "bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500";

// One-off money toward a goal (gifts, bonuses, a sale). The whole list is saved on each change.
// A contribution in another currency (a gift from family abroad) converts at the FX rate saved in Settings.
export function ContributionsEditor({ contributions, members, base, onChange }: {
  contributions: GoalContribution[];
  members: Pick<Member, "id" | "name">[];
  base: string;
  onChange: (next: GoalContribution[]) => void;
}) {
  const edit = (i: number, patch: Partial<GoalContribution>) => onChange(contributions.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div>
      {contributions.length === 0 && <p className="text-sm text-zinc-500 mb-3">Gifts from family, a bonus, a sale: money still to come that goes toward this goal.</p>}
      <div className="space-y-2">
        {contributions.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2">
            <input value={c.label} onChange={(e) => edit(i, { label: e.target.value })} className={`flex-1 min-w-32 ${field}`} aria-label="Contribution" />
            {members.length > 1 && (
              <select value={c.memberId ?? ""} onChange={(e) => edit(i, { memberId: e.target.value || null })} className={field} aria-label="From">
                <option value="">Household</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            )}
            <select value={c.currency ?? base} onChange={(e) => edit(i, { currency: e.target.value === base ? null : e.target.value })} className={field} aria-label="Currency">
              {[...new Set([base, ...COMMON_CURRENCIES, ...(c.currency ? [c.currency] : [])])].map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <input
              type="number"
              min={0}
              step={1000}
              value={c.amount}
              onChange={(e) => edit(i, { amount: Number(e.target.value) || 0 })}
              className={`w-28 tabular-nums ${field}`}
              aria-label="Amount"
            />
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <input type="checkbox" checked={c.received} onChange={(e) => edit(i, { received: e.target.checked })} className="accent-violet-500" />
              Received
            </label>
            <Button variant="ghost" size="sm" onClick={() => onChange(contributions.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        ))}
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="mt-3"
        onClick={() => onChange([...contributions, { id: crypto.randomUUID(), memberId: null, label: "Gift", amount: 0, currency: null, expectedDate: null, received: false }])}
      >
        + Add contribution
      </Button>
      {contributions.length > 0 && (
        <p className="text-[11px] text-zinc-500 mt-2">
          Once money has arrived in your accounts, tick Received so it isn&apos;t counted twice. Other currencies convert at the FX rates in Settings.
        </p>
      )}
    </div>
  );
}
