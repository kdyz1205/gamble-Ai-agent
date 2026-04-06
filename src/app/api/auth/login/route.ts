import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const baseUrl = new URL(req.url).origin;

  const res = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, action: "login" }),
  });

  if (!res.ok) {
    return Response.json({ error: "Invalid credentials" }, { status: 401 });
  }

  return Response.json({ message: "Use NextAuth signIn() on the client side" }, { status: 200 });
}
