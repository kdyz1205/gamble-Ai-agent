import { parseProofDeadline } from "./proof-deadline";
import prisma from "./db";
import { AuditActions } from "./audit-log";
import { QUIZ_RULE_VERSION } from "./quiz/quiz-bank";

export class ChallengeCreationInputError extends Error {}
export class ChallengeCreationCreditsError extends Error {
  constructor(public readonly needed: number, public readonly balance: number) { super("Insufficient credits"); }
}

const optionalTextFields = ["description", "proposition", "deadline", "eventTime", "joinWindow", "proofWindow", "rules",
  "proofSource", "arbiter", "fallbackRule", "disputeWindow", "visibility"] as const;
const defaults = { marketType: "challenge", type: "General", stakeToken: "credits", evidenceType: "self_report", settlementMode: "mutual_confirmation" };

/** Validate the existing creation payload before any balance or ledger operation. */
function creationInput(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ChallengeCreationInputError("A challenge object is required");
  const body = raw as Record<string, unknown>;
  if (typeof body.title !== "string" || !body.title.trim()) throw new ChallengeCreationInputError("title must be a non-empty string");
  // Quiz-specific graded challenges must be created exclusively through the
  // server-sealed Quiz route, not via arbitrary client-supplied challenge data.
  if (body.arbiter === QUIZ_RULE_VERSION)
    throw new ChallengeCreationInputError("Verified Quiz rules are reserved for the dedicated free Quiz creation flow");
  const stake = body.stake === undefined ? 0 : body.stake;
  if (typeof stake !== "number" || !Number.isSafeInteger(stake) || stake < 0 || stake > 2_147_483_647) {
    throw new ChallengeCreationInputError("stake must be a non-negative integer no greater than 2147483647");
  }
  const text: Partial<Record<typeof optionalTextFields[number], string | null>> = {};
  for (const field of optionalTextFields) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] !== "string") throw new ChallengeCreationInputError(`${field} must be a string or null`);
    if (body[field] !== undefined) text[field] = body[field] as string | null;
  }
  const required = { ...defaults };
  for (const field of Object.keys(defaults) as Array<keyof typeof defaults>) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== "string") throw new ChallengeCreationInputError(`${field} must be a string`);
      required[field] = body[field];
    }
  }
  for (const field of ["aiReview", "isPublic"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "boolean") throw new ChallengeCreationInputError(`${field} must be a boolean`);
  }
  let deadlineDate: Date | null = null;
  if (text.deadline) {
    deadlineDate = parseProofDeadline(text.deadline);
    if (!deadlineDate) throw new ChallengeCreationInputError("Use an explicit proof duration (for example 2 hours) or a future ISO timestamp with timezone");
  }
  if (text.visibility && !["public", "private", "invite_only"].includes(text.visibility)) throw new ChallengeCreationInputError("visibility must be public, private or invite_only");
  const isPublic = (body.isPublic === undefined ? true : body.isPublic as boolean)
    && (!text.visibility || text.visibility === "public");
  return { title: body.title.trim(), stake, ...required, ...text, deadline: deadlineDate,
    aiReview: body.aiReview === undefined ? true : body.aiReview as boolean, isPublic,
    visibility: text.visibility || (isPublic ? "public" : "private") };
}

/** Escrow, linked ledger, challenge, participant, audit and activity form one commit. */
export async function createChallengeForUser(user: { userId: string; username: string }, raw: unknown) {
  const input = creationInput(raw);
  return prisma.$transaction(async (tx) => {
    if (input.stake > 0) {
      const debited = await tx.user.updateMany({ where: { id: user.userId, credits: { gte: input.stake } }, data: { credits: { decrement: input.stake } } });
      if (debited.count === 0) {
        const balance = (await tx.user.findUnique({ where: { id: user.userId }, select: { credits: true } }))?.credits ?? 0;
        throw new ChallengeCreationCreditsError(input.stake, balance);
      }
    }
    const challenge = await tx.challenge.create({
      data: { ...input, creatorId: user.userId, status: "open",
        participants: { create: { userId: user.userId, role: "creator", status: "accepted" } } },
      include: {
        creator: { select: { id: true, username: true, image: true, credits: true } },
        participants: { include: { user: { select: { id: true, username: true, image: true } } } },
      },
    });
    if (input.stake > 0) await tx.creditTx.create({ data: {
      userId: user.userId, challengeId: challenge.id, type: "stake", amount: -input.stake,
      balanceAfter: challenge.creator.credits, description: `Staked ${input.stake} credits on "${input.title.slice(0, 40)}"`,
      idempotencyKey: `stake:create:${challenge.id}`,
    } });
    await tx.auditLog.create({ data: {
      action: AuditActions.CHALLENGE_CREATED, actorUserId: user.userId, challengeId: challenge.id,
      payload: JSON.stringify({ stake: input.stake, stakeToken: input.stakeToken, status: "open" }),
    } });
    await tx.activityEvent.create({ data: {
      type: "challenge_created", userId: user.userId, challengeId: challenge.id,
      message: `${user.username} created "${input.title}"${input.stake > 0 ? ` — ${input.stake} credits staked` : ""}`,
    } });
    return challenge;
  });
}
