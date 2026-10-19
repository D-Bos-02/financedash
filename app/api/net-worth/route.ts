import { prisma } from "@/lib/prisma";
import { getBaseCurrency } from "@/lib/profile";
import { isLiability } from "@/lib/categories";
import { countsTowardNetWorth, monthlyNetWorth } from "@/lib/net-worth";

export async function GET() {
  const accounts = await prisma.account.findMany({ where: { isActive: true } });
  const baseCurrency = await getBaseCurrency();

  const fxRates = await prisma.fxRate.findMany();
  function toBase(amount: number, currency: string): number {
    if (currency === baseCurrency) return amount;
    const rate = fxRates.find(
      (r) => r.fromCurrency === currency && r.toCurrency === baseCurrency
    );
    return rate ? amount * rate.rate : amount;
  }

  let assets = 0;
  let liabilities = 0;
  let unvested = 0;
  const byType: Record<string, number> = {};

  for (const acc of accounts) {
    const converted = toBase(acc.balance, acc.currency);
    byType[acc.type] = (byType[acc.type] ?? 0) + converted;
    if (!countsTowardNetWorth(acc.type)) {
      unvested += converted; // shown separately, not counted
    } else if (isLiability(acc.type)) {
      liabilities += Math.abs(converted);
    } else {
      assets += converted;
    }
  }

  // Build monthly history from snapshots
  const snapshots = await prisma.balanceSnapshot.findMany({
    orderBy: { date: "asc" },
    include: { account: { select: { type: true, isActive: true } } },
  });

  const history = monthlyNetWorth(snapshots, toBase);

  return Response.json({
    current: assets - liabilities,
    assets,
    liabilities,
    unvested,
    byType: Object.entries(byType).map(([type, balance]) => ({ type, balance })),
    history,
  });
}
