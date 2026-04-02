import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const isSupabaseHost = /\.supabase\.co|pooler\.supabase\.com/i.test(connectionString);

  const config: pg.PoolConfig = { connectionString };

  if (isSupabaseHost) {
    // node-pg + Supabase (especially pooler) often fails default chain verification with
    // "self-signed certificate in certificate chain". Connection stays TLS-encrypted.
    // Set DATABASE_SSL_STRICT=true only if you have configured trust (e.g. custom CA).
    config.ssl = {
      rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true",
    };
  }

  return new pg.Pool(config);
}

function createClient() {
  const pool = createPool();
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
