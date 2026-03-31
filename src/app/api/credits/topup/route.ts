import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import { addCredits, COSTS } from "@/lib/credits";

/**
 * POST /api/credits/topup — Buy credits with USDC (verified by x402 middleware).
 *
 * The x402 middleware handles payment verification before this route runs.
 * If we get here, the payment has been confirmed on-chain.
 *
 * Body: { usdcAmount: number, txHash: string }
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  try {
    const { usdcAmount, txHash } = await req.json();

    if (!usdcAmount || usdcAmount <= 0) {
      return Response.json({ error: "Invalid USDC amount" }, { status: 400 });
    }

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
      txHash,
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
