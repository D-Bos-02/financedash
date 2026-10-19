// Server-only: loads the household for the setup wizard and the household settings.

import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { plaidConfigured } from "@/lib/plaid";
import { toGoal, toIncomeSource, type HouseholdData, type Profile } from "@/lib/household";
import { GOAL_INCLUDE } from "@/lib/household-api";
import { sanitizeInputs, type PlannerInputs } from "@/lib/planner";

export interface SetupData {
  household: HouseholdData;
  planner: { inputs: PlannerInputs; saved: boolean };
}

// What the setup wizard needs, or null once setup is finished. Waits for a request so the answer is
// never baked in at build time.
export async function loadSetup(): Promise<SetupData | null> {
  await connection();
  const profile = await prisma.profile.findUnique({ where: { id: "singleton" }, select: { onboardedAt: true } });
  if (profile?.onboardedAt) return null;
  const [household, state] = await Promise.all([loadHousehold(), prisma.plannerState.findUnique({ where: { id: "singleton" } })]);
  return { household, planner: { inputs: sanitizeInputs(state ? JSON.parse(state.data) : {}), saved: Boolean(state) } };
}

export async function loadHousehold(): Promise<HouseholdData> {
  await connection();
  const [profile, members, sources, goals, accounts] = await Promise.all([
    prisma.profile.findUnique({ where: { id: "singleton" } }),
    prisma.member.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, color: true } }),
    prisma.incomeSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.goal.findMany({ where: { status: { not: "archived" } }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }], include: GOAL_INCLUDE }),
    prisma.account.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true, currency: true, balance: true, ownerId: true },
    }),
  ]);
  return {
    profile: profile && {
      householdType: profile.householdType === "household" ? "household" : "solo",
      baseCurrency: profile.baseCurrency,
      timeZone: profile.timeZone,
      locale: profile.locale,
      onboardedAt: profile.onboardedAt?.toISOString() ?? null,
    } satisfies Profile,
    members,
    sources: sources.map(toIncomeSource),
    goals: goals.map(toGoal),
    accounts,
    plaidConfigured: plaidConfigured(),
  };
}
