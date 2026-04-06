import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { addCredits, COSTS } from "@/lib/credits";
import prisma from "@/lib/db";

/**
 * POST /api/credits/topup — Buy credits with USDC.
 *
 * Security guards:
 * 1. Auth required
 * 2. txHash required and must be non-empty
 * 3. txHash must not have been used before (deduplication)
 * 4. Rate-limited: max 10 top-ups per user per hour
 *
 * TODO: Add on-chain tx verification via RPC to confirm:
 *   - tx actually exists on-chain
 *   - tx is to the correct recipient address
 *   - tx amount matches claimed usdcAmount
 *   - tx is confirmed (not pending/reverted)
 *
 * Body: { usdcAmount: number, txHash: string }
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const { usdcAmount, txHash } = await req.json();

    // ── Validate inputs ──
    if (!usdcAmount || typeof usdcAmount !== "number" || usdcAmount <= 0 || usdcAmount > 10000) {
      return Response.json({ error: "Invalid USDC amount" }, { status: 400 });
    }

    if (!txHash || typeof txHash !== "string" || txHash.trim().length < 10) {
      return Response.json({ error: "Valid transaction hash is required" }, { status: 400 });
    }

    const normalizedHash = txHash.trim().toLowerCase();

    // ── Deduplication: reject reused txHash ──
    const existingTx = await prisma.creditTx.findFirst({
      where: { x402TxHash: normalizedHash },
    });
    if (existingTx) {
      return Response.json(
        { error: "This transaction has already been processed" },
        { status: 409 },
      );
    }

    // ── Rate limit: max 10 top-ups per user per hour ──
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentTopups = await prisma.creditTx.count({
      where: {
        userId: user.userId,
        type: "topup",
        createdAt: { gte: oneHourAgo },
      },
    });
    if (recentTopups >= 10) {
      return Response.json(
        { error: "Too many top-ups. Please try again later." },
        { status: 429 },
      );
    }

    // ── Calculate and add credits ──
    const creditsToAdd = Math.floor(usdcAmount * COSTS.CREDITS_PER_USDC);
    if (creditsToAdd <= 0) {
      return Response.json({ error: "Amount too small" }, { status: 400 });
    }

    const result = await addCredits(
      user.userId,
      creditsToAdd,
      "topup",
      `Bought ${creditsToAdd} credits for ${usdcAmount} USDC`,
      undefined,
      normalizedHash,
    );

    return Response.json({
      credits: result.balance,
      added: creditsToAdd,
      usdcPaid: usdcAmount,
      rate: `1 USDC = ${COSTS.CREDITS_PER_USDC} credits`,
    });
  } catch (err) {
    console.error("Top-up error:", err);
    return Response.json({ error: "Failed to process top-up" }, { status: 500 });
  }
}
