import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPool(): pg.Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    throw new Error("DATABASE_URL is not set");
  }

  const strict = process.env.DATABASE_SSL_STRICT === "true";
  const isSupabase = /supabase/i.test(raw);

  let connectionString = raw;
  let ssl: pg.PoolConfig["ssl"] | undefined;

  if (isSupabase) {
    // URL params like sslmode=verify-full can make node-pg verify the chain and fail on pooler.
    // Strip sslmode; we still use TLS with explicit ssl below.
    try {
      const u = new URL(raw.replace(/^postgresql:/i, "http:"));
      u.searchParams.delete("sslmode");
      connectionString = u.toString().replace(/^http:/i, "postgresql:");
    } catch {
      connectionString = raw;
    }
    ssl = { rejectUnauthorized: strict };
  }

  return new pg.Pool({ connectionString, ssl });
}

function createClient() {
  const pool = createPool();
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
