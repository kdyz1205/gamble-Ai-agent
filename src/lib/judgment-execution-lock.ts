import { randomUUID } from "node:crypto";
import prisma from "./db";

const CLAIM = "judgment.execution.claim";
const RELEASE = "judgment.execution.release";
// Longer than the 300-second serverless judge lifetime; a crash cannot wedge it forever.
const LEASE_MS = 6 * 60_000;

/** Append-only execution leases share the existing audit store; inference runs outside transactions. */
export async function withJudgmentExecutionLock<T>(challengeId: string, fn: (attemptId: string) => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const acquired = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7119))`;
    const prior = await tx.auditLog.findFirst({
      where: { challengeId, action: CLAIM }, orderBy: { createdAt: "desc" },
    });
    if (prior && Date.now() - prior.createdAt.getTime() < LEASE_MS) {
      const released = await tx.auditLog.findFirst({ where: { action: RELEASE, payload: prior.id } });
      if (!released) return false;
    }
    await tx.auditLog.create({ data: { id: token, action: CLAIM, challengeId } });
    return true;
  });
  if (!acquired) return null;
  try {
    return await fn(token);
  } finally {
    // Preserve the claim on failure. It expires safely; never erase execution evidence.
    await prisma.auditLog.create({ data: { action: RELEASE, challengeId, payload: token } });
  }
}
