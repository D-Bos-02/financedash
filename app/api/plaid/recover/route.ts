import { NextRequest } from "next/server";
import { plaidClient, plaidErrorCode } from "@/lib/plaid";
import { linkPublicToken, LinkInstitution } from "@/lib/plaid-link";

// Called when Link is closed without onSuccess. Plaid creates the Item as soon
// as the bank login succeeds, so exiting on a later pane (e.g. the final
// consent screen) leaves an Item that counts toward the limit but that we never
// stored. The session's public tokens are still retrievable via the link token.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body.linkToken) return Response.json({ error: "linkToken required" }, { status: 400 });

  try {
    const { data } = await plaidClient().linkTokenGet({ link_token: body.linkToken });

    const added = new Map<string, LinkInstitution | null>();
    for (const session of data.link_sessions ?? []) {
      for (const r of session.results?.item_add_results ?? []) added.set(r.public_token, r.institution);
      if (session.on_success?.public_token) {
        added.set(session.on_success.public_token, session.on_success.metadata?.institution ?? null);
      }
    }

    const results = [];
    for (const [publicToken, institution] of added) {
      const { sync, duplicate } = await linkPublicToken(publicToken, institution, body.memberId);
      results.push({ sync, duplicate });
    }
    return Response.json({ results });
  } catch (err) {
    return Response.json(
      { error: plaidErrorCode(err) ?? (err instanceof Error ? err.message : "Failed") },
      { status: 500 }
    );
  }
}
