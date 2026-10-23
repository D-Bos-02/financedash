import { prisma } from "@/lib/prisma";
import { plaidClient, encryptToken, plaidEnv } from "@/lib/plaid";
import { syncItem } from "@/lib/plaid-sync";

export interface LinkInstitution {
  institution_id?: string | null;
  name?: string | null;
}

// Exchanges a Link public token and stores the resulting Item.
export async function linkPublicToken(publicToken: string, institution: LinkInstitution | null, memberId: unknown) {
  const { data } = await plaidClient().itemPublicTokenExchange({ public_token: publicToken });

  // Persist immediately — a lost access token can't be removed, and in
  // Production it still counts toward the Item limit.
  const item = await prisma.plaidItem.create({
    data: {
      itemId: data.item_id,
      accessToken: encryptToken(data.access_token),
      environment: plaidEnv(),
      institutionId: institution?.institution_id ?? null,
      institutionName: institution?.name ?? null,
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
  const member = typeof memberId === "string" && memberId
    ? await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } })
    : null;
  if (member) {
    await prisma.account.updateMany({ where: { plaidItemId: item.id, ownerId: null }, data: { ownerId: member.id } });
  }
  return { item, sync, duplicate: duplicate > 0 };
}
