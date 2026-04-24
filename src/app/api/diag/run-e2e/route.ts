/**
 * POST /api/diag/run-e2e?creatorEmail=...&opponentEmail=...&prompt=...
 *
 * Drives a REAL end-to-end challenge under a specific user's account (by
 * email) without needing their password or session cookie. Uses direct Prisma
 * writes + internal judge/settle calls so the resulting Challenge row is
 * genuinely owned by that user and shows up in their /markets page + ledger.
 *
 * Gated by DIAG_TOKEN. Intended so an operator can drop one verified bet into
 * a user's account for demo / proof purposes, leaving every row traceable.
 *
 * Steps:
 *   1. parseChallenge(prompt) — real OpenAI call
 *   2. Challenge.create under creatorEmail's userId
 *   3. spendCredits creator for stake (atomic)
 *   4. Participant.create for creator (role="creator")
 *   5. Opponent row: upsert User by opponentEmail (create if missing with 50
 *      bonus), spendCredits for stake, Participant.create (role="opponent")
 *   6. Evidence.upsert both sides (asymmetric so AI picks a definite winner)
 *   7. Challenge.updateMany status → judging
 *   8. executeChallengeJudgment (spends ai_judge credit + runs real OpenAI
 *      vision/text call + writes Judgment row)
 *   9. For settled challenges, confirm-verdict would be a separate call; here
 *      we stop at "disputed" (AI recommended but creator didn't confirm) so
 *      the user can click Confirm in the UI themselves — proving the UX
 *      also works.
 *
 * Returns the full proof dump for creatorEmail.
 */
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { parseChallenge } from "@/lib/ai-engine";
import { spendCredits, addCredits, getCredits } from "@/lib/credits";
import { executeChallengeJudgment } from "@/lib/challenge-judgment";
import { COSTS } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-diag-token");
  if (!process.env.DIAG_TOKEN || token !== process.env.DIAG_TOKEN) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const creatorEmail = req.nextUrl.searchParams.get("creatorEmail");
  const opponentEmail = req.nextUrl.searchParams.get("opponentEmail") || `e2e-opponent-${Date.now()}@luckyplay.test`;
  const prompt = req.nextUrl.searchParams.get("prompt") || "帮我来一个俯卧撑挑战吧";
  const stake = Math.max(0, Math.floor(Number(req.nextUrl.searchParams.get("stake") || "5")));

  if (!creatorEmail) return Response.json({ error: "creatorEmail required" }, { status: 400 });

  const trace: Array<{ step: string; ok: boolean; ms: number; detail?: unknown }> = [];
  const mark = async <T>(step: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      const out = await fn();
      trace.push({ step, ok: true, ms: Date.now() - t0, detail: typeof out === "object" ? undefined : out });
      return out;
    } catch (err) {
      trace.push({ step, ok: false, ms: Date.now() - t0, detail: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  };

  // 1. Resolve creator
  const creator = await prisma.user.findUnique({ where: { email: creatorEmail } });
  if (!creator) return Response.json({ error: `no user with email ${creatorEmail}` }, { status: 404 });

  // 2. Ensure opponent exists — create if new, 50-credit bonus like signup
  let opponent = await prisma.user.findUnique({ where: { email: opponentEmail } });
  if (!opponent) {
    const username = ("e2e_" + Math.random().toString(36).slice(2, 8)).slice(0, 20);
    opponent = await prisma.user.create({
      data: {
        email: opponentEmail,
        username,
        credits: COSTS.SIGNUP_BONUS,
        isOnline: true,
      },
    });
    await prisma.creditTx.create({
      data: {
        userId: opponent.id,
        type: "bonus",
        amount: COSTS.SIGNUP_BONUS,
        balanceAfter: COSTS.SIGNUP_BONUS,
        description: "Welcome bonus (e2e opponent)",
      },
    });
  }
  trace.push({ step: "resolve_users", ok: true, ms: 0, detail: { creatorId: creator.id, opponentId: opponent.id } });

  // Snapshot starting balances
  const creatorStart = await getCredits(creator.id);
  const opponentStart = await getCredits(opponent.id);

  // 3. Parse (real AI)
  const parsed = await mark("parse", () => parseChallenge(prompt));
  if (!parsed.title) return Response.json({ error: "parse returned no title", trace }, { status: 502 });

  // 4. Charge creator stake
  const cSpend = await mark("stake_creator", async () => {
    const r = await spendCredits(creator.id, stake, "stake", `Staked ${stake} credits on "${parsed.title.slice(0, 40)}"`);
    if (!r.success) throw new Error(r.error || "creator stake failed");
    return r;
  });

  // 5. Create Challenge (via direct Prisma — mirrors POST /api/challenges minus
  //    the auth check since we're authed by diag token)
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const challenge = await mark("create_challenge", () =>
    prisma.challenge.create({
      data: {
        creatorId: creator.id,
        title: parsed.title,
        description: parsed.proposition || parsed.title,
        type: parsed.type || "General",
        marketType: parsed.marketType || "challenge",
        proposition: parsed.proposition,
        stake,
        stakeToken: "credits",
        deadline,
        rules: parsed.rules || parsed.title,
        evidenceType: parsed.evidenceType || "self_report",
        settlementMode: "mutual_confirmation",
        isPublic: false,
        visibility: "private",
        maxParticipants: 2,
        aiReview: true,
        status: "open",
        participants: {
          create: { userId: creator.id, role: "creator", status: "accepted" },
        },
      },
    }),
  );

  // 6. Charge opponent stake + add participant, flip to live
  await mark("stake_opponent", async () => {
    const r = await spendCredits(opponent.id, stake, "stake", `Staked ${stake} credits on "${challenge.title.slice(0, 40)}"`, challenge.id);
    if (!r.success) throw new Error(r.error || "opponent stake failed");
  });
  await mark("participant_opponent", () =>
    prisma.participant.create({
      data: { challengeId: challenge.id, userId: opponent.id, role: "opponent", status: "accepted" },
    }),
  );
  await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "live" } });

  // 7. Both submit asymmetric evidence (creator clearly wins so the AI
  //    picks a definite winner, not a tie)
  await mark("evidence_creator", () =>
    prisma.evidence.create({
      data: {
        challengeId: challenge.id,
        userId: creator.id,
        type: "text",
        description: `I completed the challenge fully — clear success across every criterion, video evidence + timestamp.`,
      },
    }),
  );
  await mark("evidence_opponent", () =>
    prisma.evidence.create({
      data: {
        challengeId: challenge.id,
        userId: opponent.id,
        type: "text",
        description: `I could not finish. Gave up halfway through and did not submit the required proof.`,
      },
    }),
  );

  // 8. Transition to judging
  await prisma.challenge.update({ where: { id: challenge.id }, data: { status: "judging" } });

  // 9. Run the real judge — exercises parseChallenge → OpenAI vision call,
  //    writes a Judgment row, debits ai_judge credit, flips challenge to
  //    "disputed" (pending creator confirmation under the default manual
  //    confirmation mode).
  const judgeResult = await mark("judge", () => executeChallengeJudgment(challenge.id, 1));

  // Snapshot after
  const creatorEnd = await getCredits(creator.id);
  const opponentEnd = await getCredits(opponent.id);

  // If judgment succeeded + status is disputed, we STOP here. The creator
  // (the user) can click Confirm in the UI — that's the final manual action
  // and lets them see the settlement complete in real time. If they want
  // auto-settle, pass ?autoConfirm=1.
  const autoConfirm = req.nextUrl.searchParams.get("autoConfirm") === "1";
  if (autoConfirm && judgeResult.ok) {
    await mark("auto_confirm", async () => {
      // Replicates /api/challenges/[id]/confirm-verdict without auth gate
      const fresh = await prisma.challenge.findUnique({
        where: { id: challenge.id },
        include: {
          participants: { where: { status: "accepted" } },
          judgments: { where: { method: "ai", status: "completed" }, orderBy: { createdAt: "desc" }, take: 1 },
        },
      });
      if (!fresh || fresh.status !== "disputed") return;
      const j = fresh.judgments[0];
      if (!j) return;
      const claim = await prisma.challenge.updateMany({
        where: { id: challenge.id, status: { in: ["disputed", "judging"] } },
        data: { status: "pending_settlement" },
      });
      if (claim.count === 0) return;
      const { settleChallenge } = await import("@/lib/credits");
      await settleChallenge(
        challenge.id,
        j.winnerId,
        fresh.stake,
        fresh.participants.map((p) => ({ userId: p.userId })),
      );
      await prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: "settled" },
      });
    });
  }

  // Pull final balances
  const creatorFinal = await getCredits(creator.id);
  const opponentFinal = await getCredits(opponent.id);

  return Response.json({
    ok: judgeResult.ok,
    challengeId: challenge.id,
    marketUrl: `${req.nextUrl.origin}/market/${challenge.id}`,
    creator: {
      id: creator.id,
      email: creator.email,
      username: creator.username,
      balance: { start: creatorStart, afterJudge: creatorEnd, final: creatorFinal },
    },
    opponent: {
      id: opponent.id,
      email: opponent.email,
      username: opponent.username,
      balance: { start: opponentStart, afterJudge: opponentEnd, final: opponentFinal },
    },
    judgeResult: judgeResult.ok
      ? {
          judgmentId: judgeResult.judgment.id,
          winnerId: judgeResult.judgment.winnerId,
          confidence: judgeResult.judgment.confidence,
          aiModel: judgeResult.judgment.aiModel,
          reasoningPreview: (judgeResult.judgment.reasoning ?? "").slice(0, 300),
          model: judgeResult.model,
          creditsUsed: judgeResult.creditsUsed,
          settled: judgeResult.settlementResult,
        }
      : { error: (judgeResult as { error?: string }).error },
    trace,
  });
}
