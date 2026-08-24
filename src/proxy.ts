import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "@/lib/session";

/**
 * Always public: the login flow itself, and the two endpoints hit directly by device
 * software (KOReader's progress-sync protocol, and the stock-Kobo NickelMenu helper) —
 * neither can complete a browser cookie login, and each already checks its own
 * username/key or bearer token before touching any data.
 */
const PUBLIC_PREFIXES = ["/login", "/api/login", "/api/kosync", "/api/kobo/sync"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (verifySessionToken(request.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|apple-touch-icon.png|icon-192.png|icon-512.png).*)",
  ],
};
