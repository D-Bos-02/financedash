import { prisma } from "@/lib/prisma";
import { applyRulesToMerchant } from "@/lib/rules";

export async function POST() {
  const [transactions, rules] = await Promise.all([
    prisma.transaction.findMany({
      where: { category: "Other", isTransfer: false },
      select: { id: true, merchant: true },
    }),
    prisma.categoryRule.findMany({ orderBy: { priority: "desc" } }),
  ]);

  let updated = 0;
  for (const tx of transactions) {
    const match = applyRulesToMerchant(tx.merchant, rules);
    if (!match) continue;
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        category: match.category,
        isTransfer: match.isTransfer,
        ...(match.subCategory ? { subCategory: match.subCategory } : {}),
      },
    });
    updated++;
  }

  return Response.json({ updated, total: transactions.length });
}
