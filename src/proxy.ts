import { NextResponse, type NextRequest } from "next/server";
import { canonicalRedirectUrl } from "./lib/canonical-host";

/**
 * Normalize host *before* NextAuth sets CSRF/state cookies or starts Google
 * OAuth. A www/non-www split changes the redirect_uri and breaks login.
 */
export function proxy(request: NextRequest) {
  const canonical = canonicalRedirectUrl(request.url);
  return canonical
    ? NextResponse.redirect(canonical, 308)
    : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch-icon.png).*)"],
};
