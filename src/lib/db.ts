import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Serverless-aware Postgres pool:
 * - On Vercel each warm lambda instance gets its OWN pool. With the default
 *   max=10, N concurrent lambdas open up to 10N connections — Supabase /
 *   Neon free-tier maxes out at ~100 direct connections total, so we'd see
 *   "too many connections" errors under moderate load.
 * - Setting max=1 per lambda lets us scale horizontally without blowing
 *   the upstream connection limit. PgBouncer / a connection pooler URL
 *   (Supabase's `?pgbouncer=true` mode) would be even better — we prefer
 *   whichever the operator has configured.
 * - idleTimeoutMillis: recycle idle connections aggressively so a long-lived
 *   warm lambda doesn't hold a seat it isn't using.
 */
function createClient() {
  const isServerless = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: isServerless ? 1 : 10,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
