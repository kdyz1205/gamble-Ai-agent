import prisma from "./db";
import { AuditActions } from "./audit-log";
import { QUIZ_RULE_VERSION } from "./quiz/quiz-bank";
import { isEvidenceUrlAllowed, isYouTubeUrl } from "./media/evidence-url";

export class EvidenceSubmissionError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

function evidenceInput(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new EvidenceSubmissionError("An evidence object is required", 400);
  const body = raw as Record<string, unknown>;
  const type = body.type === undefined ? "text" : body.type;
  if (typeof type !== "string" || !type.trim()) throw new EvidenceSubmissionError("Evidence type must be a non-empty string", 400);
  for (const field of ["url", "description"] as const) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== "string") throw new EvidenceSubmissionError(`${field} must be a string or null`, 400);
  }
  if (typeof body.url === "string" && body.url.trim()
    && (!isEvidenceUrlAllowed(body.url.trim()) || isYouTubeUrl(body.url.trim()))) {
    throw new EvidenceSubmissionError("Proof must link a direct public HTTPS media file or use an upload", 400);
  }
  return { type, url: body.url as string | null | undefined ?? null,
    description: body.description as string | null | undefined ?? null,
    metadata: body.metadata ? JSON.stringify(body.metadata) : null };
}

/** Commit proof, activity, audit and readiness together; no media/network work holds the row lock. */
export async function submitChallengeEvidence(
  user: { userId: string; username: string }, challengeId: string, raw: unknown,
) {
  const input = evidenceInput(raw);
  return prisma.$transaction(async (tx) => {
    // Concurrent submissions must observe every prior committed proof before deciding readiness.
    await tx.$queryRaw`SELECT "id" FROM "Challenge" WHERE "id" = ${challengeId} FOR UPDATE`;
    const challenge = await tx.challenge.findUnique({ where: { id: challengeId }, include: { participants: true } });
    if (!challenge) throw new EvidenceSubmissionError("Challenge not found", 404);
    // A Quiz's sealed answers are NEVER normal editable text/media proof.
    // Otherwise the generic evidence route could move a Quiz into Judging
    // without creating both objective answer receipts.
    if (challenge.arbiter===QUIZ_RULE_VERSION)
      throw new EvidenceSubmissionError("Use the dedicated Quiz answer form",409);
    const eligible = challenge.participants.filter((participant) => participant.status === "accepted"
      && (participant.role === "creator" || participant.role === "opponent"));
    if (!eligible.some((participant) => participant.userId === user.userId)) {
      throw new EvidenceSubmissionError("Only accepted quest players can submit proof", 403);
    }
    const policy = challenge.evidenceType.trim().toLowerCase();
    if ((policy === "video" || policy === "photo") &&
        process.env.TRUSTED_EVIDENCE_REQUIRED_FOR_MEDIA === "true") {
      throw new EvidenceSubmissionError(
        "Media proof must be bound from a server-verified private upload", 409);
    }
    if ((policy === "video" || policy === "photo") && (input.type !== policy || !input.url?.trim())) {
      throw new EvidenceSubmissionError(`This quest requires ${policy} proof with a media URL`, 400);
    }
    if ((policy === "text" || policy === "self_report") && !input.description?.trim()) {
      throw new EvidenceSubmissionError("This quest requires a written proof description", 400);
    }
    if (!["video", "photo", "text", "self_report"].includes(policy)
      && !input.url?.trim() && !input.description?.trim() && !input.metadata) {
      throw new EvidenceSubmissionError("Proof must include a description, media URL or metadata", 400);
    }
    const existing = await tx.evidence.findUnique({ where: { challengeId_userId: { challengeId, userId: user.userId } },
      include: { user: { select: { id: true, username: true } } } });
    // The optional trusted-upload table is queried ONLY when that feature is
    // enabled. Disabled previews must work against the unchanged old schema.
    if (existing && process.env.ENABLE_TRUSTED_EVIDENCE_UPLOADS === "true") {
      const bound = await tx.trustedEvidenceUpload.findUnique({
        where: { evidenceId: existing.id },
        select: { id: true },
      });
      if (bound) {
        throw new EvidenceSubmissionError(
          "A trusted private proof cannot be replaced through the legacy URL endpoint", 409);
      }
    }
    const unchanged = existing && existing.type === input.type && existing.url === input.url
      && existing.description === input.description && existing.metadata === input.metadata;
    // Deadline is the canonical proof cutoff used by judgment and the deadline cron.
    // proofWindow is descriptive metadata; it does not extend the persisted cutoff.
    if (!unchanged && challenge.deadline && challenge.deadline.getTime() <= Date.now()) {
      throw new EvidenceSubmissionError("The proof deadline has passed; existing proof is frozen", 409);
    }
    if (!["live", "matched"].includes(challenge.status)) {
      // A lost successful response can be retried, but proof is frozen once judging starts.
      if (unchanged && ["judging", "disputed", "settled"].includes(challenge.status)) {
        return { evidence: existing, shouldPrepare: false };
      }
      throw new EvidenceSubmissionError(`Challenge is not active (status=${challenge.status})`, 400);
    }
    const evidence = unchanged ? existing : await tx.evidence.upsert({
      where: { challengeId_userId: { challengeId, userId: user.userId } },
      create: { ...input, challengeId, userId: user.userId },
      update: { ...input, preparedFrames: null, preparedAt: null, preparedDurationSec: null, preparedMode: null, prepareError: null },
      include: { user: { select: { id: true, username: true } } },
    });
    if (!unchanged) {
      await tx.activityEvent.create({ data: {
        type: "evidence_submitted", message: `${user.username} submitted ${input.type} evidence for "${challenge.title}"`,
        userId: user.userId, challengeId,
      } });
      await tx.auditLog.create({ data: {
        action: AuditActions.EVIDENCE_SUBMITTED, actorUserId: user.userId, challengeId,
        payload: JSON.stringify({ evidenceId: evidence.id, type: input.type, replaced: Boolean(existing) }),
      } });
    }
    const submitted = new Set((await tx.evidence.findMany({ where: { challengeId }, select: { userId: true } })).map((item) => item.userId));
    if (eligible.length >= 2 && eligible.every((participant) => submitted.has(participant.userId))) {
      await tx.challenge.update({ where: { id: challengeId }, data: { status: "judging" } });
      await tx.auditLog.create({ data: {
        action: AuditActions.CHALLENGE_STATUS, actorUserId: user.userId, challengeId,
        payload: JSON.stringify({ previousStatus: challenge.status, newStatus: "judging", reason: "all_players_submitted_proof" }),
      } });
    }
    return { evidence, shouldPrepare: !unchanged };
  });
}
