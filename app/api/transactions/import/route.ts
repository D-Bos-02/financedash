import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseRows, type ColumnMapping } from "@/lib/csv-parser";
import { applyRulesToMerchant } from "@/lib/rules";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { accountId, rows, mapping } = body as {
    accountId: string;
    rows: Record<string, string>[];
    mapping: ColumnMapping;
  };

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 400 });

  const rules = await prisma.categoryRule.findMany({ orderBy: { priority: "desc" } });
  const parsed = parseRows(rows, mapping);

  if (parsed.length === 0) return Response.json({ imported: 0, skipped: 0, total: 0 });

  // Use the actual date range of the incoming batch for dedup — not a fixed window
  const dates = parsed.map((r) => new Date(r.date).getTime()).filter(Boolean);
  const rangeFrom = new Date(Math.min(...dates));
  const rangeTo = new Date(Math.max(...dates));

  const existing = await prisma.transaction.findMany({
    where: { accountId, date: { gte: rangeFrom, lte: rangeTo } },
    select: { date: true, merchant: true, amount: true },
  });

  // Use integer cents to avoid float string comparison drift
  function dupeKey(date: string, merchant: string, amount: number) {
    return `${date}|${merchant}|${Math.round(amount * 100)}`;
  }

  const dupeSet = new Set(
    existing.map((t) => dupeKey(t.date.toISOString().slice(0, 10), t.merchant, t.amount))
  );

  let imported = 0;
  let skipped = 0;

  for (const row of parsed) {
    const key = dupeKey(row.date, row.merchant, row.amount);
    if (dupeSet.has(key)) { skipped++; continue; }

    const ruleMatch = applyRulesToMerchant(row.merchant, rules);
    const isTransfer = ruleMatch?.isTransfer ?? false;
    const category = row.category ?? ruleMatch?.category ?? "Other";
    const subCategory = ruleMatch?.subCategory ?? undefined;

    await prisma.transaction.create({
      data: {
        accountId,
        date: new Date(row.date),
        merchant: row.merchant,
        amount: row.amount,
        currency: account.currency,
        category,
        subCategory: subCategory ?? null,
        notes: row.notes ?? null,
        isTransfer,
        source: "csv_import",
      },
    });

    dupeSet.add(key);
    imported++;
  }

  // Snapshot balance if account is derived-mode
  if (account.balanceMode === "derived") {
    const sum = await prisma.transaction.aggregate({
      where: { accountId },
      _sum: { amount: true },
    });
    const newBalance = sum._sum.amount ?? 0;
    await prisma.account.update({
      where: { id: accountId },
      data: { balance: newBalance },
    });
    await prisma.balanceSnapshot.create({
      data: { accountId, date: new Date(), balance: newBalance, currency: account.currency },
    });
  }

  return Response.json({ imported, skipped, total: parsed.length });
}
