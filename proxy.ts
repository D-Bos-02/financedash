import { NextResponse } from "next/server";
import { DEMO } from "@/lib/demo/mode";

// The public demo has no bank keys and shouldn't write backups or call outside services.
// Self-hosted installs pass straight through.
export function proxy() {
  if (!DEMO) return NextResponse.next();
  return NextResponse.json({ error: "Not available in the demo." }, { status: 403 });
}

export const config = {
  matcher: ["/api/plaid/:path*", "/api/backup", "/api/fx-rates/refresh"],
};
