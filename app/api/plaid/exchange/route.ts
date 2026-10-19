import { NextRequest } from "next/server";
import { plaidErrorCode } from "@/lib/plaid";
import { linkPublicToken } from "@/lib/plaid-link";

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.publicToken) return Response.json({ error: "publicToken required" }, { status: 400 });

  try {
    const { item, sync, duplicate } = await linkPublicToken(body.publicToken, body.institution, body.memberId);
    return Response.json({ item: { id: item.id }, sync, duplicate }, { status: 201 });
  } catch (err) {
    return Response.json(
      { error: plaidErrorCode(err) ?? (err instanceof Error ? err.message : "Failed") },
      { status: 500 }
    );
  }
}
