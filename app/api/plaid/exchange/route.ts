import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { plaidClient, encryptToken, plaidEnv, plaidErrorCode } from "@/lib/plaid";
import { syncItem } from "@/lib/plaid-sync";

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.publicToken) return Response.json({ error: "publicToken required" }, { status: 400 });

  try {
    const { data } = await plaidClient().itemPublicTokenExchange({
      public_token: body.publicToken,
    });

    // Persist immediately — a lost access token can't be removed, and in
    // Production it still counts toward the Item limit.
    const item = await prisma.plaidItem.create({
      data: {
        itemId: data.item_id,
        accessToken: encryptToken(data.access_token),
        environment: plaidEnv(),
        institutionId: body.institution?.institution_id ?? null,
        institutionName: body.institution?.name ?? null,
      },
    });

    const duplicate = item.institutionId
      ? await prisma.plaidItem.count({
          where: {
            institutionId: item.institutionId,
            environment: item.environment,
            status: { not: "removed" },
            id: { not: item.id },
          },
        })
      : 0;

    const sync = await syncItem(item);

    // Tag the new accounts with whoever they were connected for.
    const member = typeof body.memberId === "string" && body.memberId
      ? await prisma.member.findUnique({ where: { id: body.memberId }, select: { id: true } })
      : null;
    if (member) {
      await prisma.account.updateMany({ where: { plaidItemId: item.id, ownerId: null }, data: { ownerId: member.id } });
    }
    return Response.json({ item: { id: item.id }, sync, duplicate: duplicate > 0 }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: plaidErrorCode(err) ?? (err instanceof Error ? err.message : "Failed") },
      { status: 500 }
    );
  }
}
