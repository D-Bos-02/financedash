"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { ContributionsEditor } from "@/components/household/ContributionsEditor";
import { vestsBefore } from "@/lib/planner";
import { houseDetails, monthlyNeeded, type HouseDetails } from "@/lib/home-plan";
import { JOINT, deadlineIn, type GoalContribution } from "@/lib/household";
import type { GoalSummary } from "@/lib/goals";
import { NumField, Row, SectionLabel, Stat, tone } from "./ui";
import type { TabProps } from "./PortfolioPlanner";

// One household pot: everything you hold, plus contributions still to come, against the full amount needed.
function Plan({ months, needed, gifts, savings, vests, vestCount, fmt }: {
  months: number; needed: number; gifts: number; savings: number; vests: number; vestCount: number; fmt: (v: number) => string;
}) {
  const remainder = needed - gifts - savings;
  const afterVests = remainder - vests;
  const short = afterVests > 0;
  return (
    <Card padding={false} className="overflow-hidden">
      <div className="px-5 py-2.5 text-sm font-semibold text-violet-300 bg-violet-500/10">{months} month plan</div>
      <div className="px-5 pb-3 pt-1">
        <Row label="Cash needed" value={fmt(needed)} />
        <Row label="Contributions to come" value={fmt(gifts)} />
        <Row label="Savings to date" value={fmt(savings)} />
        {vestCount > 0 && <Row label={`Equity vests before then (${vestCount})`} value={fmt(vests)} tone="text-violet-300" />}
        <Row label={short ? "Left to save" : "Surplus"} value={fmt(Math.abs(afterVests))} tone={tone(!short)} />
        <Row label="Savings per month needed" value={fmt(short ? afterVests / Math.max(1, months) : 0)} tone={short ? "text-amber-400" : "text-emerald-400"} bold />
      </div>
    </Card>
  );
}

export function HomePurchaseTab({ inputs, update, updateGoal, income, taxDrag: drag, vests, members, money, summary }: TabProps & { summary: GoalSummary }) {
  const { fmt, symbol } = money;
  const { goal } = summary;
  const d = houseDetails(goal.details);
  const { price, depPct, closePct, reserve, mortgageRate, mortgageYears, keepPct, fallbackMonths } = d;
  const { taxDrag, rent, lifestyle, retirementMonthly } = inputs;
  const plan = summary.plan!;
  const { deposit, closing, keptValue, reserveCash, totalNeeded, gifts, savings, availableNow, loan } = plan;
  const own = plan.ownership;
  const freeCash = plan.freeCashPerMonth;
  const monthsA = summary.months ?? 12;
  const linked = goal.accounts.length > 0;

  const setDetail = (patch: Partial<HouseDetails>) => updateGoal(goal.id, { details: { ...goal.details, ...patch } });
  const setContributions = (contributions: GoalContribution[]) => updateGoal(goal.id, { contributions });

  // Equity vests landing before a deadline go toward the gap; monthly free cash is regular pay only.
  const vestsFor = (m: number) => ({ vests: vestsBefore(vests, m), vestCount: vests.filter((v) => v.monthsAway < m).length });
  const planNeed = (m: number) => monthlyNeeded(plan, m, vestsBefore(vests, m));
  const colorOf = (key: string) => members.find((m) => m.id === key)?.color ?? "#a78bfa";
  const shareLabel = members.length > 1 ? `1/${members.length} of shared accounts` : "Shared accounts";

  return (
    <div className="space-y-6">
      <section>
        <SectionLabel>Editable assumptions</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <NumField label="House price" prefix={symbol} value={price} onChange={(v) => setDetail({ price: v })} step={25000} slider={{ min: 50000, max: 2500000, step: 25000 }} />
          <NumField label="Deposit" suffix="%" value={depPct} onChange={(v) => setDetail({ depPct: v })} note="Below 20% adds mortgage insurance" />
          <NumField label="Closing costs" suffix="%" value={closePct} onChange={(v) => setDetail({ closePct: v })} step={0.1} note="Estimate, % of price" />
          <NumField label="Reserve to keep after closing" prefix={symbol} value={reserve} onChange={(v) => setDetail({ reserve: v })} step={5000} note="About 6 months housing + lifestyle" />
          <NumField label="Keep investments unsold" suffix="%" value={keepPct} onChange={(v) => setDetail({ keepPct: Math.min(100, Math.max(0, v)) })} step={5}
            slider={{ min: 0, max: 100, step: 5 }} note={`${fmt(keptValue)} stays invested, counts as your reserve`} />
          <NumField
            label="Tax drag on selling investments"
            suffix="%"
            value={taxDrag}
            onChange={(v) => update({ taxDrag: v, taxDragLive: false })}
            step={0.5}
            note={
              drag.live && drag.estimate ? (
                <span className="text-emerald-400">
                  From cost basis: {fmt(drag.estimate.gains)} unrealised gain on {fmt(drag.estimate.coveredValue)}
                  {drag.estimate.uncoveredValue > 0 ? `; ${fmt(drag.estimate.uncoveredValue)} without basis at ${drag.estimate.manualPct}%` : ""}. Type to override.
                </span>
              ) : drag.estimate ? (
                <button type="button" onClick={() => update({ taxDragLive: true })} className="text-violet-400 hover:text-violet-300">
                  Manual. Use cost basis estimate ({drag.estimate.pct}%)
                </button>
              ) : (
                "No holdings data yet. Assumption, confirm with a tax adviser"
              )
            }
          />
          <NumField label="Tax on gains" suffix="%" value={inputs.gainsTaxPct} onChange={(v) => update({ gainsTaxPct: v })} step={0.5}
            note="Your combined capital gains rate. Check with a tax adviser." />
          <NumField label="Mortgage rate" suffix="%" value={mortgageRate} onChange={(v) => setDetail({ mortgageRate: v })} step={0.05} />
          <NumField label="Mortgage term" suffix="yrs" value={mortgageYears} onChange={(v) => setDetail({ mortgageYears: v })} step={5} />
          <NumField label="Plan A timeframe" suffix="mth" value={monthsA} onChange={(v) => updateGoal(goal.id, { deadline: deadlineIn(v) })} note="The goal's deadline" />
          <NumField label="Plan B timeframe" suffix="mth" value={fallbackMonths} onChange={(v) => setDetail({ fallbackMonths: v })} note="If the purchase slips" />
        </div>
      </section>

      <section>
        <SectionLabel>One-off contributions</SectionLabel>
        <Card>
          <ContributionsEditor contributions={goal.contributions} members={members} symbol={symbol} onChange={setContributions} />
        </Card>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card><Stat label="Deposit" value={fmt(deposit)} sub={`${depPct}% of ${fmt(price)}`} /></Card>
        <Card><Stat label="Closing costs" value={fmt(closing)} sub={`${closePct}% of price`} /></Card>
        <Card><Stat label="Reserve (cash)" value={fmt(reserveCash)} sub={keptValue > 0 ? `${fmt(reserve)} less kept investments` : "Kept after closing"} /></Card>
        <Card><Stat label="Total cash needed" value={fmt(totalNeeded)} tone="text-amber-400" sub="Deposit, closing and reserve" /></Card>
        <Card className="col-span-2 sm:col-span-1"><Stat label="Available now" value={fmt(availableNow)} tone="text-emerald-400" sub="Savings + contributions, after tax drag" /></Card>
      </div>

      <section>
        <SectionLabel>Monthly capacity vs need</SectionLabel>
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <NumField label="Monthly lifestyle spend" prefix={symbol} value={lifestyle} onChange={(v) => update({ lifestyle: v })} step={100} note="Shared with the Monthly Budget tab" />
            <Stat size="text-lg" label="Take-home pay" value={fmt(income.total)} sub="Regular pay after tax; vests count in the plans below" />
            <Stat size="text-lg" label="Rent + lifestyle + retirement" value={fmt(rent + lifestyle + retirementMonthly)} tone="text-red-400"
              sub={`${fmt(rent)} rent, ${fmt(retirementMonthly)} retirement`} />
            <Stat size="text-lg" label="Free cash per month" value={fmt(freeCash)} tone={tone(freeCash >= 0)} sub="Available for goals" />
          </div>
          {[monthsA, fallbackMonths].map((m, i) => {
            const need = planNeed(m);
            const spare = freeCash - need;
            return (
              <div key={i} className="flex flex-wrap justify-between gap-2 py-2.5 border-t border-zinc-800 text-sm">
                <span className="text-zinc-400">
                  {m} month plan needs <span className="text-amber-400 tabular-nums">{fmt(need)}</span> a month
                </span>
                <span className={`tabular-nums ${tone(spare >= 0)}`}>
                  {spare >= 0 ? `${fmt(spare)} a month left over` : `${fmt(-spare)} a month short`}
                </span>
              </div>
            );
          })}
        </Card>
      </section>

      <section>
        <SectionLabel>Plans</SectionLabel>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Plan months={monthsA} needed={totalNeeded} gifts={gifts} savings={savings} fmt={fmt} {...vestsFor(monthsA)} />
          <Plan months={fallbackMonths} needed={totalNeeded} gifts={gifts} savings={savings} fmt={fmt} {...vestsFor(fallbackMonths)} />
        </div>
      </section>

      <section>
        <SectionLabel>After you buy</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <NumField label="Property tax" suffix="%/yr" value={d.propTaxPct} onChange={(v) => setDetail({ propTaxPct: v })} step={0.05} note="Varies a lot by location; check local rates" />
          <NumField label="Home insurance" prefix={symbol} suffix="/mo" value={d.insuranceMonthly} onChange={(v) => setDetail({ insuranceMonthly: v })} step={25} />
          <NumField label="HOA / strata fees" prefix={symbol} suffix="/mo" value={d.hoaMonthly} onChange={(v) => setDetail({ hoaMonthly: v })} step={50} note="Condos, apartments and some townhouses" />
          <NumField label="Maintenance" suffix="%/yr" value={d.maintenancePct} onChange={(v) => setDetail({ maintenancePct: v })} step={0.25} note="Rule of thumb: 1% of the price" />
          <NumField label="Mortgage insurance" suffix="%/yr" value={d.pmiPct} onChange={(v) => setDetail({ pmiPct: v })} step={0.05} note="Of the loan, only below 20% down. 0 if it doesn't apply." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <p className="text-xs text-zinc-400 mb-1">Monthly cost of owning</p>
            <Row label={`Mortgage (${fmt(loan)} at ${mortgageRate}%, ${mortgageYears}yr)`} value={fmt(own.principalInterest)} />
            <Row label="Property tax" value={fmt(own.propertyTax)} />
            <Row label="Insurance" value={fmt(own.insurance)} />
            {own.hoa > 0 && <Row label="HOA / strata" value={fmt(own.hoa)} />}
            <Row label="Maintenance" value={fmt(own.maintenance)} />
            {own.pmi > 0 && <Row label="Mortgage insurance (under 20% down)" value={fmt(own.pmi)} />}
            <Row label="Total" value={fmt(own.total)} bold />
          </Card>
          <Card>
            <p className="text-xs text-zinc-400 mb-1">Compared with renting now</p>
            <Row label="Rent today" value={fmt(rent)} />
            <Row label={own.vsRent >= 0 ? "Owning costs more by" : "Owning costs less by"} value={fmt(Math.abs(own.vsRent))} tone={own.vsRent > 0 ? "text-amber-400" : "text-emerald-400"} />
            <Row label="Free cash per month now" value={fmt(freeCash)} tone={tone(freeCash >= 0)} />
            <Row label="Free cash per month after buying" value={fmt(own.freeCashAfter)} tone={tone(own.freeCashAfter >= 0)} bold />
            <p className="text-[11px] text-zinc-500 mt-2">
              Take-home less owning costs, lifestyle and retirement contributions. Leaves out any tax deductions for mortgage
              interest or property tax.
            </p>
          </Card>
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <SectionLabel>Starting position</SectionLabel>
          <Link href="/accounts" className="text-xs text-violet-400 hover:text-violet-300">Edit accounts →</Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plan.buyers.map((b) => (
            <Card key={b.key}>
              <p className="text-sm font-semibold mb-1" style={{ color: colorOf(b.key) }}>{b.name}</p>
              {b.key !== JOINT && <Row label="Cash" value={fmt(b.ownCash)} />}
              {b.key !== JOINT && <Row label="Investments" value={fmt(b.ownInvested)} />}
              <Row label={shareLabel} value={fmt(b.jointShare)} />
              {b.gift > 0 && <Row label="Contributions to come" value={fmt(b.gift)} />}
              {b.unvested > 0 && <Row label="Unvested stock (not counted)" value={fmt(b.unvested)} tone="text-zinc-500" />}
            </Card>
          ))}
        </div>
        <p className="text-[11px] text-zinc-500 mt-3 leading-relaxed">
          {linked ? "From the accounts linked to this goal" : "From all your accounts"}, by owner. Cash is net of credit card balances;
          retirement accounts and unvested stock plans are left out. Kept investments % applies to all investment accounts and covers
          the reserve first. Tax drag applies to investments only.
        </p>
      </section>
    </div>
  );
}
