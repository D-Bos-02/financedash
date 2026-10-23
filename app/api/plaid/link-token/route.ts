import { NextRequest } from "next/server";
import { CountryCode, Products } from "plaid";
import { prisma } from "@/lib/prisma";
import { plaidClient, decryptToken, plaidErrorCode } from "@/lib/plaid";

// Countries whose banks Link offers, from PLAID_COUNTRY_CODES (e.g. "US,CA"). Defaults to the US.
function plaidCountries(): CountryCode[] {
  const valid = new Set<string>(Object.values(CountryCode));
  const codes = (process.env.PLAID_COUNTRY_CODES ?? "US").split(",").map((c) => c.trim().toUpperCase()).filter((c) => valid.has(c));
  return codes.length ? (codes as CountryCode[]) : [CountryCode.Us];
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  // A separate Plaid user per member, so one person's Link session isn't tied to another's.
  const member = typeof body.memberId === "string" && body.memberId
    ? await prisma.member.findUnique({ where: { id: body.memberId }, select: { id: true } })
    : null;
  const base = {
    user: { client_user_id: member ? `local-${member.id}` : "local-user" },
    client_name: "FinanceDash",
    country_codes: plaidCountries(),
    language: "en",
  };

  try {
    // Update mode: repair an existing Item's login instead of re-linking,
    // which would create (and bill / count) a brand-new Item.
    if (body.itemId) {
      const item = await prisma.plaidItem.findUnique({ where: { id: body.itemId } });
      if (!item || item.status === "removed") {
        return Response.json({ error: "Item not found" }, { status: 404 });
      }
      const { data } = await plaidClient().linkTokenCreate({
        ...base,
        access_token: decryptToken(item.accessToken),
      });
      return Response.json({ linkToken: data.link_token });
    }

    const { data } = await plaidClient().linkTokenCreate({
      ...base,
      products: [Products.Transactions],
      // Consent only — not initialized or billed until those endpoints are called,
      // so holdings/liabilities can be added later without re-linking.
      additional_consented_products: [Products.Investments, Products.Liabilities],
      // Max history; this can't be increased after the Item is created.
      transactions: { days_requested: 730 },
    });
    return Response.json({ linkToken: data.link_token });
  } catch (err) {
    return Response.json(
      { error: plaidErrorCode(err) ?? (err instanceof Error ? err.message : "Failed") },
      { status: 500 }
    );
  }
}
