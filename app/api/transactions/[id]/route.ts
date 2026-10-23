import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { MONEY_MOVEMENT } from "@/lib/categories";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.transaction.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      date: body.date ? new Date(body.date) : existing.date,
      merchant: body.merchant ?? existing.merchant,
      amount: body.amount ?? existing.amount,
      currency: body.currency ?? existing.currency,
      category: body.category ?? existing.category,
      subCategory: body.subCategory !== undefined ? body.subCategory : existing.subCategory,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      isTransfer: body.category === MONEY_MOVEMENT || (body.isTransfer ?? existing.isTransfer),
    },
    include: { account: { select: { id: true, name: true, currency: true } } },
  });

  return Response.json(transaction);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.transaction.delete({ where: { id } });
  return Response.json({ success: true });
}
