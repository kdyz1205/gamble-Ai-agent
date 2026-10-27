import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // The former proxy discarded CSRF/session cookies and could report a sign-in
  // page's HTTP 200 as successful authentication. Never forward credentials here.
  void req;
  return Response.json({
    error: "Use the CSRF-protected sign-in flow to establish a session.",
    code: "AUTH_USE_NEXTAUTH",
    signInPath: "/auth/signin",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
