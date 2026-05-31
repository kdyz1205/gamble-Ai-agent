import { NextResponse, type NextRequest } from "next/server";

const CANONICAL_HOST = "stubborn-ai.vercel.app";
const LEGACY_HOSTS = new Set([
  "gamble-ai-agent.vercel.app",
  "www.gamble-ai-agent.vercel.app",
  "stepone-ai.vercel.app",
  "www.stepone-ai.vercel.app",
]);

export function middleware(request: NextRequest) {
  const host = request.headers.get("host")?.toLowerCase();

  if (!host || !LEGACY_HOSTS.has(host)) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = CANONICAL_HOST;

  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/).*)"],
};
