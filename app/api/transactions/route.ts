import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { monthRangeUtc } from "@/lib/formatters";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const accountId = sp.get("accountId");
  const category = sp.get("category");
  const search = sp.get("search");
  const from = sp.get("from");
  const to = sp.get("to");
  const month = sp.get("month"); // YYYY-MM, same boundaries as the Cash Flow page
  const excludeTransfers = sp.get("excludeTransfers") === "1";
  const limit = parseInt(sp.get("limit") ?? "50");
  const offset = parseInt(sp.get("offset") ?? "0");

  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;
  if (category) where.category = category;
  if (excludeTransfers) where.isTransfer = false;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const range = monthRangeUtc(month);
    where.date = { gte: range.from, lte: range.to };
  } else if (from || to) {
    // Plain YYYY-MM-DD dates are whole UTC days, matching how transactions are stored.
    const day = /^\d{4}-\d{2}-\d{2}$/;
    where.date = {
      ...(from ? { gte: new Date(day.test(from) ? `${from}T00:00:00Z` : from) } : {}),
      ...(to ? { lte: new Date(day.test(to) ? `${to}T23:59:59.999Z` : to) } : {}),
    };
  }
  if (search) {
    where.OR = [
      { merchant: { contains: search } },
      { notes: { contains: search } },
    ];
  }

  const [transactions, total, out, inflow] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: { account: { select: { id: true, name: true, currency: true } } },
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.transaction.count({ where }),
    // Money out and money in across all matches (not just this page), e.g. spending and refunds.
    // Transfers between your own accounts never count, even when they're listed.
    prisma.transaction.aggregate({ where: { ...where, isTransfer: false, amount: { lt: 0 } }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { ...where, isTransfer: false, amount: { gt: 0 } }, _sum: { amount: true } }),
  ]);

  return Response.json({
    transactions,
    total,
    spent: -(out._sum.amount ?? 0),
    received: inflow._sum.amount ?? 0,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const account = await prisma.account.findUnique({ where: { id: body.accountId } });
  if (!account) return Response.json({ error: "Account not found" }, { status: 400 });

  const transaction = await prisma.transaction.create({
    data: {
      accountId: body.accountId,
      date: new Date(body.date),
      merchant: body.merchant,
      amount: body.amount,
      currency: body.currency ?? account.currency,
      category: body.category ?? "Other",
      subCategory: body.subCategory ?? null,
      notes: body.notes ?? null,
      isTransfer: body.isTransfer ?? false,
      source: "manual",
    },
    include: { account: { select: { id: true, name: true, currency: true } } },
  });

  return Response.json(transaction, { status: 201 });
}
