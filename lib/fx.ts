// Server-only: converts amounts into the base currency using the FX rates saved in Settings.

import { prisma } from "@/lib/prisma";
import { getBaseCurrency } from "@/lib/profile";

// Converter into the base currency using the FX rates in Settings (unknown currencies pass through).
export async function loadToBase(): Promise<(amount: number, currency: string) => number> {
  const [fxRates, base] = await Promise.all([prisma.fxRate.findMany(), getBaseCurrency()]);
  return (amount, currency) => {
    if (currency === base) return amount;
    const rate = fxRates.find((r) => r.fromCurrency === currency && r.toCurrency === base);
    return rate ? amount * rate.rate : amount;
  };
}
