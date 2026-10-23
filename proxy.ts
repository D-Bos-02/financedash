import { NextResponse, type NextRequest } from "next/server";
import { BASE_PATH, DEMO, VISITOR_COOKIE } from "@/lib/demo/mode";

// Only does anything in the hosted demo; self-hosted installs pass straight through.
// The demo has no bank keys and shouldn't write backups or call outside services, and each visitor gets a
// cookie that picks their own copy of the data.
const BLOCKED = /^\/api\/(plaid\/|assistant(\/|$)|backup$|fx-rates\/refresh$)/;

export function proxy(request: NextRequest) {
  if (!DEMO) return NextResponse.next();
  if (BLOCKED.test(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Not available in the demo." }, { status: 403 });
  }
  if (request.cookies.has(VISITOR_COOKIE)) return NextResponse.next();

  // First visit: pass the new cookie on to this request too, so it already has its own copy.
  const id = crypto.randomUUID();
  const headers = new Headers(request.headers);
  const cookie = headers.get("cookie");
  headers.set("cookie", `${cookie ? `${cookie}; ` : ""}${VISITOR_COOKIE}=${id}`);
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: BASE_PATH || "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image|favicon.ico).*)"],
};
