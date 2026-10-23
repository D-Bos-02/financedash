"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Card } from "@/components/ui/Card";
import { SCENARIOS, projectGrowth } from "@/lib/planner";
import { payNote, type TabProps } from "./PortfolioPlanner";
import { NumField, SectionLabel, SliderCard, Stat } from "./ui";

function ChartTooltip({ active, payload, label, fmt }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: number; fmt: (v: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm">
      <p className="text-xs text-zinc-400 mb-1">Year {label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular-nums" style={{ color: p.color }}>
          <span className="text-zinc-400 mr-2">{p.name}</span>
          {fmt(p.value)}
        </p>
      ))}
    </div>
  );
}

export function ProjectionTab({ inputs, update, updateSource, income, grants, rent: rentInfo, pay, position, start, lumpAt, money }: TabProps) {
  const { years, freeRent, rent, matchMonthly, lifestyle } = inputs;
  const { fmt, compact, symbol } = money;
  const investableFreeRent = income.total - lifestyle;
  const monthlyInvestable = investableFreeRent - rent;
  const savingsRatePct = income.total > 0 ? (monthlyInvestable / income.total) * 100 : 0;

  const allData = useMemo(
    () =>
      SCENARIOS.map((s) => ({
        ...s,
        data: projectGrowth(start.total, years, s.rate, s.savingsRate, freeRent, monthlyInvestable, investableFreeRent, matchMonthly, lumpAt),
      })),
    [start.total, years, freeRent, monthlyInvestable, investableFreeRent, matchMonthly, lumpAt]
  );

  const chartData = useMemo(
    () =>
      allData[0].data.map((pt, i) => {
        const obj: Record<string, number> = { year: pt.year };
        allData.forEach((s) => { obj[s.label] = s.data[i]?.value; });
        return obj;
      }),
    [allData]
  );

  const base = allData[1].data;
  const milestones = { half: base.find((d) => d.value >= 500000), mil: base.find((d) => d.value >= 1000000) };
  const endOf = (d: { value: number }[]) => d[d.length - 1]?.value ?? 0;

  const rentImpact = useMemo(() => {
    const noRent = projectGrowth(start.total, years, 0.08, 0.65, years * 12, investableFreeRent, investableFreeRent, matchMonthly, lumpAt);
    return endOf(noRent) - endOf(base);
  }, [start.total, years, investableFreeRent, matchMonthly, base, lumpAt]);

  return (
    <div className="space-y-6">
      {/* Starting position from live accounts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><Stat label="Investments" value={compact(start.invested)} sub="Brokerage, crypto and retirement" /></Card>
        <Card><Stat label="Cash" value={compact(start.cash)} sub="Checking and savings, less card balances" /></Card>
        <Card><Stat label="Starting base" value={compact(start.total)} tone="text-violet-400" sub={position.asOf ? `Live balances, updated ${position.asOf}` : "No accounts yet"} /></Card>
      </div>
      {start.unvested > 0 && (
        <p className="text-xs text-zinc-500 -mt-3">
          Excludes {compact(start.unvested)} in unvested stock plans. Vests are counted as income below as they pay out.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SliderCard label="Monthly rent" display={compact(rent)}
          sub={`${rentInfo.live ? "Actual rent" : "Manual"} · ${compact(monthlyInvestable)}/mo investable`}
          value={rent} onChange={(v) => update({ rent: v, rentLive: false })} min={0} max={8000} step={100} ticks={[compact(0), compact(4000), compact(8000)]} accent="text-red-400" />
        <SliderCard label="Horizon" display={`${years} years`} sub="Projection window"
          value={years} onChange={(v) => update({ years: v })} min={1} max={20} ticks={["1yr", "10yr", "20yr"]} />
        <SliderCard label="Free rent window" display={`${freeRent}mo`} sub={`Saves ${compact(rent * freeRent)}`}
          value={freeRent} onChange={(v) => update({ freeRent: v })} min={0} max={12} ticks={["0mo", "6mo", "12mo"]} accent="text-amber-400" />
      </div>

      <section>
        <SectionLabel>Income assumptions</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {grants.map(({ source: g, price, perVest, member, vests }) => (
            <div key={g.id} className="sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <NumField
                label={`${g.ticker ?? "Share"} price (${member}, ${g.name})`}
                prefix={symbol}
                value={price.value}
                onChange={(v) => updateSource(g.id, { priceFallback: v, priceLive: false })}
                step={5}
                note={
                  price.live ? (
                    <span className="text-emerald-400">Live {g.ticker}{price.quote?.asOf ? `, ${price.quote.asOf}` : ""}. Type to override.</span>
                  ) : price.quote ? (
                    <button type="button" onClick={() => updateSource(g.id, { priceLive: true })} className="text-violet-400 hover:text-violet-300">
                      Manual. Use live {fmt(price.quote.price)}
                    </button>
                  ) : g.ticker && g.priceLive ? (
                    "Live price unavailable, using this figure"
                  ) : (
                    "Manual price"
                  )
                }
              />
              <NumField label="Shares per vest" value={g.sharesPerVest} onChange={(v) => updateSource(g.id, { sharesPerVest: v })} step={5}
                note={g.vestMonths.length ? `Vesting in ${vestMonthNames(g.vestMonths)}` : "No vest months set"} />
              <NumField label="Tax on vests" suffix="%" value={g.taxPct} onChange={(v) => updateSource(g.id, { taxPct: v })} step={1}
                note={`~${fmt(perVest)} per vest after tax${vests[0] ? `, next ${vests[0].label}` : ""}`} />
            </div>
          ))}
          <NumField label="Employer retirement match per month" prefix={symbol} value={matchMonthly} onChange={(v) => update({ matchMonthly: v })} step={50}
            note="Added to monthly investing." />
          <Card padding={false} className="p-4">
            <Stat
              label="Monthly take-home"
              value={fmt(income.total)}
              tone="text-emerald-400"
              sub={income.equityPerYear > 0 ? `Regular pay only. Vests ~${fmt(income.equityPerYear)} a year on top` : "Regular pay, after tax"}
            />
          </Card>
          <Card padding={false} className="p-4">
            <p className="text-xs text-zinc-400 mb-1">Income</p>
            {pay.length === 0 && <p className="text-xs text-zinc-500">No income sources yet</p>}
            {pay.map((p) => (
              <p key={p.sourceId} className="text-xs text-zinc-300 tabular-nums" title={payNote(p, money)}>
                {p.member}, {p.source}: {fmt(p.monthly)}/mo{" "}
                <span className={p.basis === "estimate" ? "text-amber-400" : "text-emerald-400"}>
                  {p.basis === "estimate" ? "estimate" : p.basis === "average" ? "3-month average" : "from paychecks"}
                </span>
              </p>
            ))}
          </Card>
        </div>
      </section>

      {/* Cash flow and savings rate */}
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <Stat size="text-base" label="Take-home pay" value={compact(income.total)} tone="text-emerald-400" />
        <Stat size="text-base" label="− Lifestyle" value={compact(lifestyle)} tone="text-zinc-300" />
        <Stat size="text-base" label="− Rent" value={compact(rent)} tone="text-red-400" />
        <Stat size="text-base" label="= Investable" value={compact(monthlyInvestable)} tone="text-amber-400" />
        {income.equityPerYear > 0 && (
          <Stat size="text-base" label="+ Vests a year" value={compact(income.equityPerYear)} tone="text-violet-300" sub="Added in their vest months" />
        )}
        <div className="sm:ml-auto flex flex-col gap-2 sm:items-end">
          <p className="text-xs text-zinc-400">
            Savings rate{" "}
            <span className={`text-base font-semibold tabular-nums ${savingsRatePct > 50 ? "text-emerald-400" : "text-amber-400"}`}>
              {savingsRatePct.toFixed(0)}%
            </span>
          </p>
        </div>
      </Card>

      {/* Chart */}
      <Card>
        <div className="flex flex-wrap gap-2 mb-4">
          {SCENARIOS.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border border-zinc-800 bg-zinc-800/50">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
              <span style={{ color: s.color }}>{s.label}</span>
              <span className="text-zinc-500">{(s.rate * 100).toFixed(0)}% p.a.</span>
            </span>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              {SCENARIOS.map((s) => (
                <linearGradient key={s.label} id={`g-${s.label}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="year" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `Y${v}`} />
            <YAxis tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} width={60} />
            <Tooltip content={<ChartTooltip fmt={compact} />} cursor={{ stroke: "#52525b" }} />
            {[500000, 1000000].map((v) => (
              <ReferenceLine key={v} y={v} stroke="#3f3f46" strokeDasharray="4 4"
                label={{ value: compact(v), fill: "#71717a", fontSize: 10, position: "insideTopRight" }} />
            ))}
            {SCENARIOS.map((s) => (
              <Area key={s.label} type="monotone" dataKey={s.label} name={s.label} stroke={s.color} strokeWidth={2} fill={`url(#g-${s.label})`} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* End values */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {allData.map((s) => {
          const end = endOf(s.data);
          return (
            <Card key={s.label}>
              <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: s.color }}>{s.label}</p>
              <p className="text-2xl font-bold text-zinc-100 tabular-nums">{compact(end)}</p>
              <p className="text-xs text-zinc-400 mt-1">+{compact(end - start.total)} over {years}yr</p>
              <p className="text-[11px] text-zinc-500 tabular-nums">
                ~{compact(monthlyInvestable * s.savingsRate + matchMonthly)}/mo invested
              </p>
            </Card>
          );
        })}
      </div>

      {/* Milestones */}
      <Card>
        <SectionLabel>Base case milestones</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat size="text-base" label={`${compact(500000)} portfolio`} tone="text-emerald-400" value={milestones.half ? `Year ${milestones.half.year}` : `>${years}yr`} />
          <Stat size="text-base" label={`${compact(1000000)} portfolio`} tone="text-emerald-400" value={milestones.mil ? `Year ${milestones.mil.year}` : `>${years}yr`} />
          <Stat size="text-base" label="Free rent savings" tone="text-amber-400" value={compact(rent * freeRent)} />
          <Stat size="text-base" label={`Rent cost (${years}yr compounded)`} tone="text-red-400" value={`−${compact(rentImpact)}`} sub="vs staying rent-free the whole period" />
        </div>
      </Card>
    </div>
  );
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function vestMonthNames(months: number[]): string {
  return months.map((m) => MONTH_NAMES[m - 1]).join(", ");
}
