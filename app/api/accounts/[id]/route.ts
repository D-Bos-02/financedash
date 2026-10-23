import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.account.findUnique({ where: { id } });
  if (!existing) return Response.json({ error: "Not found" }, { status: 404 });

  const account = await prisma.account.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      type: body.type ?? existing.type,
      currency: body.currency ?? existing.currency,
      institution: body.institution !== undefined ? body.institution : existing.institution,
      balance: body.balance !== undefined ? body.balance : existing.balance,
      balanceMode: body.balanceMode ?? existing.balanceMode,
      ownerId: body.ownerId !== undefined ? body.ownerId || null : existing.ownerId,
    },
  });

  if (body.balance !== undefined && account.balanceMode === "manual") {
    await prisma.balanceSnapshot.create({
      data: {
        accountId: account.id,
        date: new Date(),
        balance: account.balance,
        currency: account.currency,
      },
    });
  }

  return Response.json(account);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await prisma.account.update({ where: { id }, data: { isActive: false } });
  return Response.json({ success: true });
}
