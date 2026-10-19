"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { AccountForm } from "@/components/accounts/AccountForm";
import { PlaidConnections } from "@/components/accounts/PlaidConnections";
import { useHousehold, type Household } from "@/components/household/useHousehold";
import { HouseholdTypeToggle, RegionFields } from "@/components/household/ProfileFields";
import { MembersEditor } from "@/components/household/MembersEditor";
import { IncomeEditor } from "@/components/household/IncomeEditor";
import { GoalsEditor } from "@/components/household/GoalsEditor";
import { BudgetStep } from "./BudgetStep";
import { suggestLifestyle } from "@/lib/goals";
import type { PlannerInputs } from "@/lib/planner";
import { ACCOUNT_TYPES } from "@/lib/categories";
import { makeMoney, type HouseholdData, type Profile } from "@/lib/household";
import { BASE_PATH } from "@/lib/demo/mode";

const STEPS = ["Basics", "Income", "Accounts", "Goals", "Budget"] as const;

type Region = Pick<Profile, "householdType" | "baseCurrency" | "timeZone" | "locale">;

// The browser's time zone and language, read without a hydration mismatch (the server renders the fallback).
const noop = () => () => {};
function useBrowserRegion() {
  const timeZone = useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", () => "UTC");
  const locale = useSyncExternalStore(noop, () => navigator.language || "en-US", () => "en-US");
  return { timeZone, locale };
}

// First-run setup: runs until the profile is marked onboarded. Everything saves as you go, so leaving
// halfway loses nothing, and all of it can be changed later in Settings.
export function SetupWizard({ initial, planner }: {
  initial: HouseholdData;
  planner: { inputs: PlannerInputs; saved: boolean }; // saved: the Planner already has inputs (e.g. from a backup)
}) {
  const h = useHousehold(initial);
  const router = useRouter();
  const browser = useBrowserRegion();
  const [step, setStep] = useState(0);
  // Start from what's saved. Several people (e.g. restored from an older backup) means a household.
  const [draft, setDraft] = useState<Partial<Region>>(() => ({
    ...(initial.profile && {
      householdType: initial.profile.householdType,
      baseCurrency: initial.profile.baseCurrency,
      timeZone: initial.profile.timeZone,
      locale: initial.profile.locale,
    }),
    ...(initial.members.length > 1 && { householdType: "household" as const }),
  }));
  const [budget, setBudget] = useState(planner.inputs);
  const [lifestyleSet, setLifestyleSet] = useState(planner.saved);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const region: Region = { householdType: "solo", baseCurrency: "USD", ...browser, ...draft };
  const solo = region.householdType === "solo";
  const money = makeMoney(region.baseCurrency, region.locale);
  const takeHome = h.sources.filter((s) => s.type !== "equity_vest").reduce((t, s) => t + s.estimateMonthly, 0);
  // Until the user types their own figure, lifestyle follows the suggestion as income and rent change.
  const effectiveBudget = { ...budget, lifestyle: lifestyleSet ? budget.lifestyle : suggestLifestyle(takeHome, budget.rent) };
  function editBudget(patch: Partial<PlannerInputs>) {
    if (patch.lifestyle !== undefined) setLifestyleSet(true);
    setBudget((b) => ({ ...b, ...effectiveBudget, ...patch, ...(patch.rent !== undefined ? { rentLive: true } : {}) }));
  }

  const blocker =
    step === 0 && h.members.length === 0 ? (solo ? "Add your name to continue." : "Add at least one person to continue.")
    : step === 0 && !solo && h.members.length < 2 ? "Add the other people in your household, or choose Just me."
    : "";

  async function next() {
    setNotice("");
    if (step === 0 && !(await h.saveProfile(region))) return;
    await h.flush();
    setStep((s) => s + 1);
    window.scrollTo({ top: 0 });
  }

  async function finish() {
    setBusy(true);
    await h.flush();
    const res = await fetch(`${BASE_PATH}/api/planner`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(effectiveBudget) });
    if (!res.ok) {
      setNotice("Couldn't save the budget. Try again.");
      setBusy(false);
      return;
    }
    if (await h.saveProfile({ ...region, onboarded: true })) {
      router.push("/planner");
      router.refresh();
    } else {
      setBusy(false);
    }
  }

  async function skip() {
    if (!confirm("Skip setup? You can add people, income and goals later in Settings.")) return;
    setBusy(true);
    await h.flush();
    if (await h.saveProfile({ ...region, onboarded: true })) router.refresh();
    else setBusy(false);
  }

  // A backup from this app (or the older single-household version) brings everything back at once.
  async function restore(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`${BASE_PATH}/api/data/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: await file.text() });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? "Import failed");
      // A newer backup finishes setup by itself; an older one reopens the wizard with its people filled in.
      window.location.reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Couldn't read that file.");
      setBusy(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="min-h-full px-4 py-8 lg:py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <p className="text-lg font-bold text-violet-400 tracking-tight">FinanceDash</p>
          <h1 className="text-2xl font-bold text-zinc-100 mt-4">{step === 0 ? "Let's set things up" : STEPS[step]}</h1>
          <ol className="flex gap-2 mt-4" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <li key={s} className="flex-1">
                <div className={`h-1 rounded-full ${i <= step ? "bg-violet-500" : "bg-zinc-800"}`} />
                <p className={`text-[11px] mt-1 ${i === step ? "text-zinc-200" : "text-zinc-500"}`}>{s}</p>
              </li>
            ))}
          </ol>
        </div>

        {step === 0 && (
          <>
            <Card className="space-y-4">
              <p className="text-sm text-zinc-300">Whose money is this?</p>
              <HouseholdTypeToggle
                value={region.householdType}
                onChange={(householdType) => setDraft((d) => ({ ...d, householdType }))}
                disableSolo={h.members.length > 1}
              />
              <MembersEditor h={h} solo={solo} />
            </Card>
            <Card className="space-y-3">
              <p className="text-sm text-zinc-300">Where you are</p>
              <RegionFields value={region} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
              <p className="text-[11px] text-zinc-500">
                Totals, plans and goals use this currency. Accounts in other currencies are converted with the rates you add in Settings.
              </p>
            </Card>
            <Card className="space-y-2">
              <p className="text-sm text-zinc-300">Moving from another copy of this app?</p>
              <p className="text-xs text-zinc-500">Restore an export (Settings › Data › Export) to bring over accounts, transactions, rules and plans.</p>
              <label className="inline-block cursor-pointer">
                <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors">
                  {busy ? "Working…" : "Restore from a backup"}
                </span>
                <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only" disabled={busy} onChange={restore} />
              </label>
            </Card>
          </>
        )}

        {step === 1 && (
          <Card className="space-y-4">
            <p className="text-sm text-zinc-400">
              Add each regular source of take-home pay. An estimate is fine: once transactions sync, pay is worked out from the real deposits.
              {" "}Stock that vests on a schedule (RSUs) goes in as Equity vests.
            </p>
            <IncomeEditor h={h} symbol={money.symbol} />
          </Card>
        )}

        {step === 2 && <AccountsStep h={h} baseCurrency={region.baseCurrency} />}

        {step === 3 && (
          <Card className="space-y-4">
            <p className="text-sm text-zinc-400">What are you saving for? Put the most important goal first; it&apos;s funded first.</p>
            <GoalsEditor h={h} symbol={money.symbol} monthlySpend={takeHome * 0.8} />
          </Card>
        )}

        {step === 4 && <BudgetStep h={h} money={money} value={effectiveBudget} onChange={editBudget} />}

        {(notice || h.error) && <p className="text-sm text-red-400">{notice || h.error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={busy}>Back</Button>}
            <Button variant="ghost" onClick={skip} disabled={busy}>Skip setup</Button>
          </div>
          <div className="flex items-center gap-3">
            {blocker && <span className="text-xs text-amber-400">{blocker}</span>}
            {h.saveState === "saving" && <span className="text-xs text-zinc-500">Saving…</span>}
            {step < STEPS.length - 1 ? (
              <Button onClick={next} disabled={busy || Boolean(blocker)}>Continue</Button>
            ) : (
              <Button onClick={finish} disabled={busy}>{busy ? "Finishing…" : "Finish setup"}</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountsStep({ h, baseCurrency }: { h: Household; baseCurrency: string }) {
  const [adding, setAdding] = useState(false);
  const typeLabel = (t: string) => ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? t;
  const money = makeMoney(baseCurrency);
  return (
    <>
      {/* Shows the Plaid setup steps until keys are in .env, then the Connect button. */}
      <PlaidConnections onChange={h.reloadAccounts} members={h.members} setupOpen />
      <Card className="space-y-4">
        <p className="text-sm text-zinc-400">
          You can also add accounts by hand: checking, savings, investments, retirement, cards and loans. Things a bank
          connection won&apos;t cover, like a home or a car loan elsewhere, go in this way too.
        </p>
        {h.accounts.length > 0 && (
          <div className="divide-y divide-zinc-800">
            {h.accounts.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="text-zinc-200 truncate">{a.name}</p>
                  <p className="text-xs text-zinc-500">
                    {typeLabel(a.type)}
                    {h.members.length > 1 && ` · ${h.members.find((m) => m.id === a.ownerId)?.name ?? "Shared"}`}
                  </p>
                </div>
                <span className="tabular-nums text-zinc-300">{a.currency === baseCurrency ? money.fmt(a.balance) : `${a.balance.toLocaleString()} ${a.currency}`}</span>
              </div>
            ))}
          </div>
        )}
        <Button variant="secondary" onClick={() => setAdding(true)}>+ Add an account</Button>
        <p className="text-[11px] text-zinc-500">
          To bring in past transactions from a CSV file, use Import on the Transactions page once setup is done. You can also skip this step.
        </p>
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title="Add account">
        <AccountForm
          members={h.members}
          baseCurrency={baseCurrency}
          onSave={() => { setAdding(false); h.reloadAccounts(); }}
          onCancel={() => setAdding(false)}
        />
      </Modal>
    </>
  );
}
