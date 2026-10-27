import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  // Registration uses NextAuth's CSRF-protected credentials flow. The legacy
  // proxy never propagated a session and must not return a false success.
  void req;
  return Response.json({
    error: "Use the CSRF-protected sign-in flow to register and establish a session.",
    code: "AUTH_USE_NEXTAUTH",
    signInPath: "/auth/signin",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
