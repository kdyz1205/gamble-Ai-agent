/**
 * GET /api/diag/users
 *
 * Diag-only aggregate user inspection. This intentionally returns counts and
 * redacted previews only; no tokens, hashes, or full emails. Gated by DIAG_TOKEN.
 */
import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import prisma from "@/lib/db";

export const runtime = "nodejs";

const TEST_PREFIX_RE =
  /^(codex|test|e2e|radar|agent|rob|rej|vid|video|discover|close|manual|smoke|diag|load)[._-]?/i;

function redactEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const safeLocal =
    local.length <= 2 ? `${local.slice(0, 1)}***` : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return domain ? `${safeLocal}@${domain}` : safeLocal;
}

function redactText(value: string | null) {
  if (!value) return null;
  if (value.length <= 2) return `${value.slice(0, 1)}***`;
  if (value.length <= 6) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

function isLikelyTestUser(user: { email: string; username: string }) {
  const local = user.email.split("@")[0] ?? "";
  const isExampleDomain = user.email.toLowerCase().endsWith("@example.com");
  return isExampleDomain && (TEST_PREFIX_RE.test(local) || TEST_PREFIX_RE.test(user.username));
}

function toDateBuckets(createdAt: Date, now: Date) {
  const ageMs = now.getTime() - createdAt.getTime();
  return {
    last24h: ageMs <= 24 * 60 * 60 * 1000,
    last7d: ageMs <= 7 * 24 * 60 * 60 * 1000,
    last30d: ageMs <= 30 * 24 * 60 * 60 * 1000,
  };
}

function safeEqualHex(a: string, b: string) {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

function hasValidDiagProof(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  if (process.env.DIAG_TOKEN && token === process.env.DIAG_TOKEN) return true;

  const secret = process.env.NEXTAUTH_SECRET;
  const timestampHeader = req.headers.get("x-diag-timestamp");
  const signature = req.headers.get("x-diag-signature");
  const timestamp = Number(timestampHeader);
  if (!secret || !timestampHeader || !signature || !Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > 5 * 60 * 1000) return false;

  const path = req.nextUrl.pathname;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${path}`).digest("hex");
  return safeEqualHex(signature, expected);
}

export async function GET(req: NextRequest) {
  if (!hasValidDiagProof(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      image: true,
      passwordHash: true,
      credits: true,
      createdAt: true,
      accounts: { select: { provider: true, type: true } },
      sessions: {
        where: { expires: { gt: now } },
        select: { id: true },
        take: 1,
      },
      _count: {
        select: {
          challengesCreated: true,
          participations: true,
          evidenceSubmissions: true,
          transactions: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const testUsers = users.filter(isLikelyTestUser);
  const nonTestUsers = users.filter((u) => !isLikelyTestUser(u));
  const providerCounts = new Map<string, number>();
  for (const user of users) {
    for (const account of user.accounts) {
      providerCounts.set(account.provider, (providerCounts.get(account.provider) ?? 0) + 1);
    }
  }

  const bucketCounts = {
    totalLast24h: 0,
    totalLast7d: 0,
    totalLast30d: 0,
    nonTestLast24h: 0,
    nonTestLast7d: 0,
    nonTestLast30d: 0,
  };
  for (const user of users) {
    const buckets = toDateBuckets(user.createdAt, now);
    const nonTest = !isLikelyTestUser(user);
    if (buckets.last24h) bucketCounts.totalLast24h += 1;
    if (buckets.last7d) bucketCounts.totalLast7d += 1;
    if (buckets.last30d) bucketCounts.totalLast30d += 1;
    if (nonTest && buckets.last24h) bucketCounts.nonTestLast24h += 1;
    if (nonTest && buckets.last7d) bucketCounts.nonTestLast7d += 1;
    if (nonTest && buckets.last30d) bucketCounts.nonTestLast30d += 1;
  }

  return Response.json({
    generatedAt: now.toISOString(),
    counts: {
      totalUsers: users.length,
      likelyTestUsers: testUsers.length,
      nonTestUsers: nonTestUsers.length,
      googleLinkedUsers: users.filter((u) => u.accounts.some((a) => a.provider === "google")).length,
      credentialUsers: users.filter((u) => Boolean(u.passwordHash)).length,
      activeSessionUsers: users.filter((u) => u.sessions.length > 0).length,
      ...bucketCounts,
    },
    providerCounts: Object.fromEntries([...providerCounts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    nonTestPreview: nonTestUsers.slice(0, 25).map((user) => ({
      id: user.id,
      email: redactEmail(user.email),
      username: redactText(user.username),
      name: redactText(user.name),
      hasImage: Boolean(user.image),
      credits: user.credits,
      createdAt: user.createdAt,
      providers: user.accounts.map((a) => a.provider),
      activeSession: user.sessions.length > 0,
      counts: user._count,
    })),
    testSummary: {
      firstCreatedAt: testUsers[0]?.createdAt ?? null,
      lastCreatedAt: testUsers.at(-1)?.createdAt ?? null,
    },
  });
}
