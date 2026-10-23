import { NextRequest } from "next/server";
import { DEMO } from "@/lib/demo/mode";
import { resetVisitor } from "@/lib/demo/visitor-db";

// Demo only: starts the visitor over, with the demo household ({ blank: false }) or empty, to try the setup wizard.
export async function POST(request: NextRequest) {
  if (!DEMO) return Response.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  await resetVisitor(body?.blank === true);
  return Response.json({ ok: true });
}
