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
    // payload is TEXT in the canonical schema and JSONB in legacy databases.
    // Compare its text representation only for historical release records;
    // new releases have a deterministic ID, independent of payload storage.
    // Check every recent claim so equal-millisecond timestamps cannot hide an
    // active worker behind an earlier, already released claim.
    const active = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT claim."id" FROM "AuditLog" claim
      WHERE claim."challengeId" = ${challengeId} AND claim."action" = ${CLAIM}
        AND claim."createdAt" > ${new Date(Date.now() - LEASE_MS)}
        AND NOT EXISTS (
          SELECT 1 FROM "AuditLog" release
          WHERE release."challengeId" = claim."challengeId" AND release."action" = ${RELEASE}
            AND (release."id" = 'judgment-release:' || claim."id"
              OR release."payload"::text = claim."id"
              OR release."payload"::text = to_json(claim."id")::text)
        ) LIMIT 1`;
    if (active.length) return false;
    await tx.auditLog.create({ data: { id: token, action: CLAIM, challengeId } });
    return true;
  });
  if (!acquired) return null;
  try {
    return await fn(token);
  } finally {
    // Append a release even when fn throws; a killed worker's unreleased claim
    // instead expires after six minutes. Never erase execution evidence.
    await prisma.auditLog.create({ data: {
      id: `judgment-release:${token}`, action: RELEASE, challengeId, payload: JSON.stringify({ claimId: token }),
    } });
  }
}
