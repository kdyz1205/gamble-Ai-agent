import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { addCredits } from "@/lib/credits";

/**
 * GET /api/challenges/[id] — Get a single challenge with full details
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, username: true, image: true } },
      participants: {
        include: { user: { select: { id: true, username: true, image: true } } },
      },
      evidence: {
        include: { user: { select: { id: true, username: true } } },
        orderBy: { createdAt: "desc" },
      },
      judgments: {
        include: {
          winner: { select: { id: true, username: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { evidence: true, participants: true } },
    },
  });

  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }

  return Response.json({ challenge });
}

/**
 * DELETE /api/challenges/[id] — creator deletes their own market.
 *
 * Safety rules (refuse if any fails):
 *   - Must be the creator.
 *   - Status must be one of {draft, open, cancelled}. Once a market is live /
 *     judging / settled / disputed, money-moving flows are in motion and
 *     deletion would orphan audit records — those must be resolved, not deleted.
 *   - If the creator staked credits (stake > 0) and the market is still draft /
 *     open, we refund the stake back to them atomically BEFORE deletion. This
 *     keeps the credits ledger consistent. (Settled markets are already
 *     out-of-scope per the status rule.)
 *
 * Cascade behavior: Prisma schema has onDelete: Cascade on Challenge for
 * Participant / Evidence / Judgment / JudgeJob / ActivityEvent / AuditLog, so
 * the single delete sweeps those rows too. CreditTx rows that reference the
 * challenge are nullable (onDelete: SetNull), so the ledger itself is
 * preserved — only the FK is cleared.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { id: true, creatorId: true, status: true, stake: true, title: true },
  });
  if (!challenge) {
    return Response.json({ error: "Challenge not found" }, { status: 404 });
  }
  if (challenge.creatorId !== user.userId) {
    return Response.json({ error: "Only the creator can delete a market" }, { status: 403 });
  }

  const deletable = ["draft", "open", "cancelled"];
  if (!deletable.includes(challenge.status)) {
    return Response.json(
      {
        error: `Can't delete a market in status "${challenge.status}". Only draft / open / cancelled markets can be deleted. Cancel it first if it's in an active state.`,
      },
      { status: 409 },
    );
  }

  // Refund stake FIRST. If the refund throws we don't delete, so credits and
  // the challenge row stay in sync. Prisma's cascade handles child rows.
  // addCredits returns { balance } and throws on failure (e.g. user row
  // disappeared mid-request) — we catch and bail without touching the row.
  if (challenge.stake > 0) {
    try {
      await addCredits(
        user.userId,
        challenge.stake,
        "refund",
        `Refund — deleted market "${challenge.title.slice(0, 40)}"`,
      );
    } catch (err) {
      return Response.json(
        { error: "Refund failed, not deleting", detail: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      );
    }
  }

  await prisma.challenge.delete({ where: { id } });

  return Response.json({
    ok: true,
    deletedId: id,
    refundedStake: challenge.stake > 0 ? challenge.stake : 0,
  });
}
