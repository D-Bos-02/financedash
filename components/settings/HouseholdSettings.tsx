"use client";

import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useHousehold } from "@/components/household/useHousehold";
import { HouseholdTypeToggle, RegionFields } from "@/components/household/ProfileFields";
import { MembersEditor } from "@/components/household/MembersEditor";
import { IncomeEditor } from "@/components/household/IncomeEditor";
import { GoalsEditor } from "@/components/household/GoalsEditor";
import { makeMoney, type Profile } from "@/lib/household";

const FALLBACK: Profile = { householdType: "solo", baseCurrency: "USD", timeZone: "UTC", locale: "en-US", onboardedAt: null };

// Everything the setup wizard asked, editable afterwards. Changes save as you go.
export function HouseholdSettings() {
  const h = useHousehold();
  const router = useRouter();
  const profile = h.profile ?? FALLBACK;
  const solo = profile.householdType === "solo";
  const { symbol } = makeMoney(profile.baseCurrency, profile.locale);

  async function rerunSetup() {
    if (!confirm("Open the setup wizard again? Nothing is deleted; it starts from what you have now.")) return;
    await h.flush();
    if (await h.saveProfile({ onboarded: false })) router.refresh();
  }

  if (!h.loaded) return <Card><p className="text-sm text-zinc-500">{h.error || "Loading…"}</p></Card>;

  const status = h.error ? <span className="text-xs text-red-400">{h.error}</span>
    : h.saveState === "saving" ? <span className="text-xs text-zinc-500">Saving…</span>
    : h.saveState === "error" ? <span className="text-xs text-red-400">Couldn&apos;t save</span>
    : null;

  return (
    <>
      <Card>
        <CardHeader><CardTitle>Household</CardTitle>{status}</CardHeader>
        <div className="space-y-4">
          <HouseholdTypeToggle value={profile.householdType} onChange={(householdType) => h.saveProfile({ householdType })} disableSolo={h.members.length > 1} />
          <RegionFields value={profile} onChange={(patch) => h.saveProfile(patch)} />
          <p className="text-xs text-zinc-500">
            Totals are converted to the base currency using the FX rates below. Transactions keep their own currency.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader><CardTitle>{solo ? "You" : "People"}</CardTitle></CardHeader>
        <MembersEditor h={h} solo={solo} />
      </Card>

      <Card>
        <CardHeader><CardTitle>Income</CardTitle></CardHeader>
        <IncomeEditor h={h} symbol={symbol} />
      </Card>

      <Card>
        <CardHeader><CardTitle>Goals</CardTitle></CardHeader>
        <GoalsEditor h={h} symbol={symbol} />
      </Card>

      <Card>
        <CardHeader><CardTitle>Setup</CardTitle></CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-400">Go through the setup steps again, starting from your current details.</p>
          <Button variant="secondary" onClick={rerunSetup}>Run setup again</Button>
        </div>
      </Card>
    </>
  );
}
