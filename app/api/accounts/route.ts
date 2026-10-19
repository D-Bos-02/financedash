import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
  });
  return Response.json(accounts);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const account = await prisma.account.create({
    data: {
      name: body.name,
      type: body.type,
      currency: body.currency ?? "USD",
      institution: body.institution ?? null,
      balance: body.balance ?? 0,
      balanceMode: body.balanceMode ?? "manual",
      ownerId: body.ownerId || null,
    },
  });

  if (account.balanceMode === "manual" && account.balance !== 0) {
    await prisma.balanceSnapshot.create({
      data: {
        accountId: account.id,
        date: new Date(),
        balance: account.balance,
        currency: account.currency,
      },
    });
  }

  return Response.json(account, { status: 201 });
}
