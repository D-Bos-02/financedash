// Server-only: the household profile (base currency, time zone, members). There is no row until onboarding.

import { prisma } from "@/lib/prisma";

export const DEFAULT_BASE_CURRENCY = "USD";

export async function getBaseCurrency(): Promise<string> {
  const profile = await prisma.profile.findUnique({ where: { id: "singleton" }, select: { baseCurrency: true } });
  return profile?.baseCurrency ?? DEFAULT_BASE_CURRENCY;
}
