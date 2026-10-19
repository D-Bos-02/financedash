import type { PlaidItem } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptToken, plaidClient, plaidErrorCode } from "@/lib/plaid";

export interface HoldingsResult {
  institution: string | null;
  ok: boolean;
  holdings: number;
  error?: string;
}

// Only connections with brokerage accounts need holdings. Calling the Investments endpoint adds the
// Investments Holdings subscription to that connection (free on Plaid's Trial plan).
export async function itemsWithInvestments(): Promise<PlaidItem[]> {
  return prisma.plaidItem.findMany({
    where: { status: { not: "removed" }, accounts: { some: { type: "investment", isActive: true } } },
  });
}

export async function syncHoldings(item: PlaidItem): Promise<HoldingsResult> {
  const result: HoldingsResult = { institution: item.institutionName, ok: true, holdings: 0 };
  try {
    const { data } = await plaidClient().investmentsHoldingsGet({ access_token: decryptToken(item.accessToken) });
    const securities = new Map(data.securities.map((s) => [s.security_id, s]));
    const accounts = await prisma.account.findMany({
      where: { plaidItemId: item.id, plaidAccountId: { in: data.accounts.map((a) => a.account_id) } },
      select: { id: true, plaidAccountId: true },
    });
    const accountIds = new Map(accounts.map((a) => [a.plaidAccountId, a.id]));

    const rows = data.holdings.flatMap((h) => {
      const accountId = accountIds.get(h.account_id);
      if (!accountId) return [];
      const sec = securities.get(h.security_id);
      return [{
        accountId,
        name: sec?.name ?? sec?.ticker_symbol ?? "Unknown security",
        ticker: sec?.ticker_symbol ?? null,
        type: sec?.type ?? null,
        quantity: h.quantity,
        value: h.institution_value,
        costBasis: h.cost_basis ?? null,
        currency: h.iso_currency_code ?? "USD",
      }];
    });

    // Replace this connection's holdings in one go.
    await prisma.$transaction([
      prisma.holding.deleteMany({ where: { accountId: { in: accounts.map((a) => a.id) } } }),
      prisma.holding.createMany({ data: rows }),
    ]);
    result.holdings = rows.length;
  } catch (err) {
    result.ok = false;
    result.error = plaidErrorCode(err) ?? (err instanceof Error ? err.message : "Failed");
  }
  return result;
}
