import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { plaidConfigured, plaidEnv } from "@/lib/plaid";
import { syncItem } from "@/lib/plaid-sync";
import { itemsWithInvestments, syncHoldings } from "@/lib/plaid-holdings";

export async function POST(request: NextRequest) {
  if (!plaidConfigured()) return Response.json({ error: "Plaid not configured" }, { status: 400 });
  const body = await request.json().catch(() => ({}));

  const items = await prisma.plaidItem.findMany({
    where: {
      environment: plaidEnv(),
      status: { not: "removed" },
      ...(body.itemId ? { id: body.itemId } : {}),
    },
  });

  const results = [];
  for (const item of items) results.push(await syncItem(item));

  // Refresh brokerage holdings (cost basis for the tax-on-selling estimate). Failures don't fail the sync.
  const synced = new Set(items.map((i) => i.id));
  const holdings = [];
  for (const item of await itemsWithInvestments()) {
    if (synced.has(item.id)) holdings.push(await syncHoldings(item));
  }
  return Response.json({ results, holdings });
}
