import { prisma } from "@/lib/prisma";
import { plaidConfigured, plaidEnv } from "@/lib/plaid";

export async function GET() {
  const environment = plaidEnv();
  const items = await prisma.plaidItem.findMany({
    where: { environment },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      institutionName: true,
      status: true,
      errorCode: true,
      lastSyncedAt: true,
      createdAt: true,
      _count: { select: { accounts: true } },
    },
  });

  return Response.json({
    configured: plaidConfigured(),
    environment,
    items,
    // Removed Items still count against the Trial plan's 10-Item limit.
    productionItemsUsed: await prisma.plaidItem.count({ where: { environment: "production" } }),
  });
}
