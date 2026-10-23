import { prisma } from "@/lib/prisma";

// Merchants still on "Other", biggest spend first, so the review starts where it matters most.
export async function GET() {
  const transactions = await prisma.transaction.findMany({
    where: { category: "Other", isTransfer: false },
    select: { merchant: true, amount: true },
  });

  const byMerchant: Record<string, { count: number; spent: number }> = {};
  for (const tx of transactions) {
    const m = (byMerchant[tx.merchant] ??= { count: 0, spent: 0 });
    m.count++;
    m.spent -= tx.amount;
  }

  const merchants = Object.entries(byMerchant)
    .map(([merchant, m]) => ({ merchant, count: m.count, spent: Math.round(m.spent) }))
    .sort((a, b) => Math.abs(b.spent) - Math.abs(a.spent))
    .slice(0, 50);

  return Response.json({
    total: transactions.length,
    spent: Math.round(transactions.reduce((s, t) => s - t.amount, 0)),
    merchants,
  });
}
