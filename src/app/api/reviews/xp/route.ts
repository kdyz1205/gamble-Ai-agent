import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";
import { reconcileVerifiedQuestProfessionXp } from "@/lib/summons/server-ledger";
import { reconcileFreeCareerTickets, summonTicketsEnabled } from "@/lib/summons/free-ticket-ledger";
import { isReviewModerator } from "@/lib/verdict-review";
import {
  approveTrustedQuestXpForReview,
  revokeTrustedQuestXpReview,
  manualXpApprovalEnabled,
  ManualXpApprovalError,
} from "@/lib/summons/manual-xp-approval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/**
 * Explicit, independent moderator action; NEVER called on settlement or on
 * page load. Approval, revocation and issuance are different operations.
 * All three are opt-in and default disabled on preview/production.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  if (!manualXpApprovalEnabled()) {
    return Response.json({ error: "XP review and issuance are disabled" },
      { status: 404, headers });
  }
  // Check reviewer before parsing or revealing another player's Quest state.
  if (!await isReviewModerator(user.userId)) {
    return Response.json({ error: "Authorized independent moderator required" },
      { status: 403, headers });
  }
  let value: unknown;
  try { value = await req.json(); }
  catch { return Response.json({ error: "Invalid request JSON" }, { status: 400, headers }); }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Response.json({ error: "Invalid review request" }, { status: 400, headers });
  }
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some(key =>
        !["action", "challengeId", "ownerId", "reason", "confirm"].includes(key)) ||
      !["approve", "revoke", "issue"].includes(String(body.action)) ||
      typeof body.challengeId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.challengeId) ||
      typeof body.ownerId !== "string" ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(body.ownerId) ||
      body.confirm !== true) {
    return Response.json({
      error: "Exact user, Quest, independent action and confirmation required",
    }, { status: 400, headers });
  }

  try {
    const challengeId = body.challengeId;
    const ownerId = body.ownerId;
    // The issuer must also be independent, even after another moderator
    // has approved a video. A generic isReviewer role is not sufficient if
    // the requester competed in this same Quest.
    const competingReviewer = await prisma.participant.findFirst({
      where: {
        challengeId, userId: user.userId,
        role: { in: ["creator", "opponent"] },
      },
      select: { id: true },
    });
    if (competingReviewer) {
      return Response.json({ error: "A Quest player cannot approve or issue their own progression" },
        { status: 403, headers });
    }
    if (body.action === "approve") {
      const result = await approveTrustedQuestXpForReview({
        challengeId, ownerId, reviewerId: user.userId,
        reason: typeof body.reason === "string" ? body.reason : "",
      });
      return Response.json({ review: result },
        { status: result.reused ? 200 : 201, headers });
    }
    if (body.action === "revoke") {
      const result = await revokeTrustedQuestXpReview({
        challengeId, ownerId, reviewerId: user.userId,
        reason: typeof body.reason === "string" ? body.reason : "",
      });
      return Response.json({ review: result }, { headers });
    }

    // Even with an existing approval, explicit issuance cannot target a
    // legacy text Quest (whose separate progression policy is still gated).
    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      select: { evidenceType: true },
    });
    if (!challenge || !["video", "photo"].includes(challenge.evidenceType)) {
      return Response.json({ error: "Only verified media Quests can be issued here" },
        { status: 409, headers });
    }
    const receipt = await reconcileVerifiedQuestProfessionXp({
      challengeId, userId: ownerId,
    });
    // Optional free-ticket milestone: separate, idempotent transaction with
    // complete current-Quest provenance revalidation. If it fails, the XP
    // receipt remains immutable and the moderator can retry the same action.
    // The participant must STILL explicitly choose to spend a free ticket;
    // no owned Familiar, evolution or credit movement occurs here.
    if (summonTicketsEnabled()) {
      try {
        const tickets = await reconcileFreeCareerTickets({
          ownerId, professionId: receipt.professionId,
        });
        return Response.json({
          receipt,
          freeTickets: {
            status: "verified_and_issued",
            available: tickets.available,
            spent: tickets.spent,
            verifiedXp: tickets.verifiedXp,
          },
          note: "XP and verified free-ticket milestones committed. No ticket was spent and no Familiar was minted.",
        }, { headers });
      } catch (error) {
        console.error("[xp-review] separate free-ticket reconciliation requires review",
          error instanceof Error ? error.name : "UnknownError");
        return Response.json({
          receipt,
          freeTickets: { status: "pending_reconciliation" },
          note: "XP was committed. Free ticket was not confirmed; retry after reviewing provenance.",
        }, { status: 202, headers });
      }
    }
    return Response.json({
      receipt,
      freeTickets: { status: "disabled" },
      note: "XP committed. Free tickets and owned Summons remain disabled and are never issued by page reads.",
    }, { headers });
  } catch (err) {
    if (err instanceof ManualXpApprovalError) {
      return Response.json({ error: err.reason }, { status: err.status, headers });
    }
    console.error("[xp-review] independent moderator operation failed",
      err instanceof Error ? err.name : "UnknownError");
    return Response.json({
      error: "Review or issuance failed closed. Do not repeat without checking the receipt.",
    }, { status: 409, headers });
  }
}
