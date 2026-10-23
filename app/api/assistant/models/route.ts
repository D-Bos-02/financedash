import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildProvider, chatModels, PROVIDER_IDS } from "@/lib/chat/provider";

// The models a provider offers, fetched with the key in .env on the server, so keys never reach the browser.
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("provider") ?? "";
  if (!PROVIDER_IDS.includes(id)) return Response.json({ error: "Unknown provider" }, { status: 400 });
  // Any placeholder model will do here: only the address and key are needed to list models.
  const setup = buildProvider(process.env, id, "list");
  if (!setup.ok) return Response.json({ error: setup.reason }, { status: 400 });
  const p = setup.provider;

  try {
    if (p.kind === "anthropic") {
      const ids: string[] = [];
      for await (const m of new Anthropic().models.list({ limit: 100 })) ids.push(m.id);
      return Response.json({ models: chatModels(ids) });
    }
    const res = await fetch(`${p.baseUrl}/models`, {
      headers: p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {},
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return Response.json({ error: `${p.label} answered ${res.status} when asked for its models.` }, { status: 502 });
    const body = await res.json();
    const ids = (Array.isArray(body.data) ? body.data : Array.isArray(body.models) ? body.models : []).map((m: { id?: string; name?: string }) => m.id ?? m.name ?? "");
    return Response.json({ models: chatModels(ids.filter(Boolean)) });
  } catch (err) {
    const local = p.kind === "openai" && p.baseUrl.includes("127.0.0.1");
    const message = local ? `Couldn't reach ${p.label}. Is it running?` : `Couldn't get ${p.label}'s models: ${err instanceof Error ? err.message : "unknown error"}`;
    return Response.json({ error: message }, { status: 502 });
  }
}
