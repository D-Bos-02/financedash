"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { INCOME_TYPES, PAY_FREQUENCIES, type IncomeSource, type IncomeType } from "@/lib/household";
import type { Household } from "./useHousehold";

const field = "w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-violet-500";
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function Field({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-zinc-400 mb-1">{label}</span>
      {children}
      {note && <span className="block text-[11px] text-zinc-500 mt-1">{note}</span>}
    </label>
  );
}

const num = (v: string) => (v === "" ? 0 : Math.max(0, Number(v) || 0));

function SourceCard({ s, h, symbol }: { s: IncomeSource; h: Household; symbol: string }) {
  const update = (patch: Partial<IncomeSource>) => h.updateSource(s.id, patch);
  const equity = s.type === "equity_vest";

  function setType(type: IncomeType) {
    // Switching to equity needs a vest schedule; switching away keeps the old one harmlessly.
    if (type === "equity_vest" && !s.vestMonths.length) update({ type, payFrequency: "quarterly", vestMonths: [3, 6, 9, 12] });
    else update({ type });
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Name">
          <input value={s.name} onChange={(e) => update({ name: e.target.value })} className={field} maxLength={80} />
        </Field>
        <Field label="Type">
          <select value={s.type} onChange={(e) => setType(e.target.value as IncomeType)} className={field}>
            {INCOME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>
        {!equity && (
          <Field label="Paid">
            <select value={s.payFrequency} onChange={(e) => update({ payFrequency: e.target.value as IncomeSource["payFrequency"] })} className={field}>
              {PAY_FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </Field>
        )}
      </div>

      {equity ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Ticker" note="For a live price; leave blank to enter it yourself">
              <input
                value={s.ticker ?? ""}
                onChange={(e) => update({ ticker: e.target.value.toUpperCase() || null })}
                className={field}
                maxLength={15}
                placeholder="e.g. XYZ"
              />
            </Field>
            <Field label="Shares per vest">
              <input type="number" min={0} value={s.sharesPerVest} onChange={(e) => update({ sharesPerVest: num(e.target.value) })} className={field} />
            </Field>
            <Field label="Tax on vests (%)" note="Your effective rate">
              <input type="number" min={0} max={100} value={s.taxPct} onChange={(e) => update({ taxPct: Math.min(100, num(e.target.value)) })} className={field} />
            </Field>
            <Field label={`Share price (${symbol})`} note={s.ticker && s.priceLive ? "Used when the live price is unavailable" : "Used to value each vest"}>
              <input type="number" min={0} value={s.priceFallback} onChange={(e) => update({ priceFallback: num(e.target.value) })} className={field} />
            </Field>
          </div>
          <div>
            <span className="block text-xs text-zinc-400 mb-1">Vests in</span>
            <div className="flex flex-wrap gap-1">
              {MONTHS.map((m, i) => {
                const month = i + 1;
                const on = s.vestMonths.includes(month);
                return (
                  <button
                    key={month}
                    type="button"
                    title={MONTH_NAMES[i]}
                    aria-label={MONTH_NAMES[i]}
                    aria-pressed={on}
                    onClick={() => update({ vestMonths: on ? s.vestMonths.filter((x) => x !== month) : [...s.vestMonths, month].sort((a, b) => a - b) })}
                    className={`w-8 h-8 rounded-md text-xs border transition-colors ${on ? "border-violet-500 bg-violet-500/20 text-violet-300" : "border-zinc-700 text-zinc-500 hover:border-zinc-600"}`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>
          {s.ticker && (
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={s.priceLive} onChange={(e) => update({ priceLive: e.target.checked })} className="accent-violet-500" />
              Use the live price for {s.ticker}
            </label>
          )}
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`Take-home per month (${symbol})`} note="After tax. Used until matching deposits arrive.">
            <input type="number" min={0} step={100} value={s.estimateMonthly} onChange={(e) => update({ estimateMonthly: num(e.target.value) })} className={field} />
          </Field>
          <Field label="Deposit description contains" note="A word from how this income appears on your statement, e.g. the employer's name or PAYROLL">
            <input value={s.depositPattern ?? ""} onChange={(e) => update({ depositPattern: e.target.value || null })} className={field} maxLength={80} />
          </Field>
        </div>
      )}
      {equity && (
        <Field label="Sale deposit contains" note="Optional: how the sale of vested shares appears, so a vest that has landed isn't counted twice">
          <input value={s.depositPattern ?? ""} onChange={(e) => update({ depositPattern: e.target.value || null })} className={field} maxLength={80} />
        </Field>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => confirm(`Remove ${s.name}?`) && h.removeSource(s.id)}>Remove</Button>
      </div>
    </div>
  );
}

function AddSource({ onAdd }: { onAdd: (type: IncomeType) => void }) {
  const [type, setType] = useState<IncomeType>("salary");
  return (
    <div className="flex items-center gap-2">
      <select value={type} onChange={(e) => setType(e.target.value as IncomeType)} className={`${field} w-auto`} aria-label="Income type">
        {INCOME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <Button variant="secondary" size="sm" onClick={() => onAdd(type)}>+ Add income</Button>
    </div>
  );
}

// Income grouped by person, plus income that belongs to the whole household (e.g. rent from a tenant).
export function IncomeEditor({ h, symbol }: { h: Household; symbol: string }) {
  const groups = [
    ...h.members.map((m) => ({ key: m.id, memberId: m.id as string | null, title: m.name, color: m.color })),
    { key: "household", memberId: null, title: h.members.length > 1 ? "Shared household income" : "Other household income", color: "#a1a1aa" },
  ];
  return (
    <div className="space-y-6">
      {groups.map((g) => {
        const sources = h.sources.filter((s) => s.memberId === g.memberId);
        // Keep the household group out of the way until it's used.
        if (g.memberId === null && !sources.length && h.members.length) {
          return (
            <details key={g.key} className="text-sm text-zinc-500">
              <summary className="cursor-pointer hover:text-zinc-300">Income that isn&apos;t anyone&apos;s in particular (e.g. rent from a tenant)</summary>
              <div className="mt-3"><AddSource onAdd={(type) => h.addSource(null, type)} /></div>
            </details>
          );
        }
        return (
          <div key={g.key} className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: g.color }}>{g.title}</p>
            {sources.length === 0 && <p className="text-sm text-zinc-500">No income yet.</p>}
            {sources.map((s) => <SourceCard key={s.id} s={s} h={h} symbol={symbol} />)}
            <AddSource onAdd={(type) => h.addSource(g.memberId, type)} />
          </div>
        );
      })}
    </div>
  );
}
