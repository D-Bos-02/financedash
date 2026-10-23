import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { plaidClient, decryptToken, plaidErrorCode } from "@/lib/plaid";
import { syncItem } from "@/lib/plaid-sync";

// Called after a successful update-mode Link session.
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.plaidItem.findUnique({ where: { id } });
  if (!item || item.status === "removed") return Response.json({ error: "Not found" }, { status: 404 });
  const sync = await syncItem({ ...item, status: "ok" });
  return Response.json({ sync });
}

// Removes the Item at Plaid (ends any subscription billing). Production
// accounts and transactions are kept, converted to manual; Sandbox data is
// fake, so it's deleted rather than left mixed into real net worth.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await prisma.plaidItem.findUnique({ where: { id } });
  if (!item || item.status === "removed") return Response.json({ error: "Not found" }, { status: 404 });

  try {
    await plaidClient().itemRemove({ access_token: decryptToken(item.accessToken) });
  } catch (err) {
    // Already gone at Plaid — safe to mark removed locally.
    if (plaidErrorCode(err) !== "ITEM_NOT_FOUND") {
      return Response.json({ error: plaidErrorCode(err) ?? "Failed to remove" }, { status: 500 });
    }
  }

  await prisma.$transaction([
    item.environment === "sandbox"
      ? prisma.account.deleteMany({ where: { plaidItemId: id } })
      : prisma.account.updateMany({ where: { plaidItemId: id }, data: { balanceMode: "manual" } }),
    prisma.plaidItem.update({
      where: { id },
      data: { status: "removed", accessToken: "", cursor: null },
    }),
  ]);
  return Response.json({ success: true });
}
