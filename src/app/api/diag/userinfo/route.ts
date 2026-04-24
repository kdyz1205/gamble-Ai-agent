/**
 * GET /api/diag/userinfo?email=...
 *
 * Diag-only inspection: does this user have a passwordHash? How many
 * linked Account rows and from which providers? This is the exact info
 * the signIn callback uses to decide whether to allow or block a Google
 * sign-in for an existing email.
 *
 * Never returns hashes, tokens, or secrets — only booleans + provider
 * names. Gated by DIAG_TOKEN.
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return Response.json({ error: "email required" }, { status: 400 });

  const u = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      username: true,
      emailVerified: true,
      createdAt: true,
      credits: true,
      passwordHash: true, // read so we can boolify, NEVER return this value
      accounts: { select: { id: true, provider: true, providerAccountId: true, type: true } },
      sessions: { select: { id: true, expires: true }, take: 5, orderBy: { expires: "desc" } },
    },
  });
  if (!u) return Response.json({ error: "user not found" }, { status: 404 });

  return Response.json({
    id: u.id,
    email: u.email,
    username: u.username,
    emailVerified: !!u.emailVerified,
    hasPasswordHash: !!u.passwordHash,
    credits: u.credits,
    createdAt: u.createdAt,
    // providers only — not tokens
    linkedAccounts: u.accounts.map((a) => ({ provider: a.provider, type: a.type, providerAccountIdPreview: a.providerAccountId.slice(0, 8) })),
    activeSessions: u.sessions.length,
  });
}
