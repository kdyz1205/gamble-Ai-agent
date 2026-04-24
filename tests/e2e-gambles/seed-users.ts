/**
 * Seed two test users directly in the local DB with known bcrypt password
 * hashes. Playwright then signs in via NextAuth credentials callback using
 * these passwords, so we never need to drive Google OAuth in automation.
 *
 * Idempotent — upserts by email so reruns don't explode.
 */
import "dotenv/config";
import { config as dotenvLocal } from "dotenv";
dotenvLocal({ path: ".env.local" });
import bcrypt from "bcryptjs";
import prisma from "../../src/lib/db";
import { PLAYER_A, PLAYER_B } from "./users";

export async function seedTwoPlayers() {
  const results: Array<{ id: string; email: string; username: string; credits: number }> = [];
  for (const p of [PLAYER_A, PLAYER_B]) {
    const passwordHash = await bcrypt.hash(p.password, 12);
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {
        // Don't zero out credits on re-seed; just refresh the hash and username.
        passwordHash,
        username: p.username,
        isOnline: true,
      },
      create: {
        email: p.email,
        username: p.username,
        passwordHash,
        credits: 500, // plenty for 10 gambles even if every one is staked
        isOnline: true,
      },
      select: { id: true, email: true, username: true, credits: true },
    });
    // Make sure there's a bonus row for ledger consistency if this is the first seed.
    const hasAnyTx = await prisma.creditTx.findFirst({ where: { userId: user.id } });
    if (!hasAnyTx) {
      await prisma.creditTx.create({
        data: {
          userId: user.id,
          type: "bonus",
          amount: 500,
          balanceAfter: 500,
          description: "seed for e2e-gambles harness",
        },
      });
    }
    results.push(user);
  }
  return results;
}

if (require.main === module) {
  seedTwoPlayers()
    .then((r) => { console.log("seeded:", r); return prisma.$disconnect(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
