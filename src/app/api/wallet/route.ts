import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getUserFromRequest, unauthorized } from "@/lib/auth";

/**
 * GET /api/wallet — Get current user's wallet
 */
export async function GET(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  const wallet = await prisma.wallet.findUnique({
    where: { userId: payload.userId },
  });

  if (!wallet) {
    return Response.json({ error: "Wallet not found" }, { status: 404 });
  }

  return Response.json({ wallet });
}

/**
 * POST /api/wallet — Deposit or withdraw
 * Body: { action: "deposit" | "withdraw", amount: number }
 */
export async function POST(req: NextRequest) {
  const payload = getUserFromRequest(req);
  if (!payload) return unauthorized();

  try {
    const { action, amount } = await req.json();

    if (!["deposit", "withdraw"].includes(action)) {
      return Response.json({ error: "action must be 'deposit' or 'withdraw'" }, { status: 400 });
    }
    if (!amount || amount <= 0) {
      return Response.json({ error: "amount must be a positive number" }, { status: 400 });
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: payload.userId } });
    if (!wallet) {
      return Response.json({ error: "Wallet not found" }, { status: 404 });
    }

    if (action === "withdraw" && wallet.balance < amount) {
      return Response.json({ error: "Insufficient balance" }, { status: 400 });
    }

    const updated = await prisma.wallet.update({
      where: { userId: payload.userId },
      data: {
        balance: action === "deposit"
          ? { increment: amount }
          : { decrement: amount },
      },
    });

    await prisma.transaction.create({
      data: {
        userId: payload.userId,
        type: action,
        amount: action === "deposit" ? amount : -amount,
        balanceAfter: updated.balance,
        description: `${action === "deposit" ? "Deposited" : "Withdrew"} $${amount}`,
      },
    });

    return Response.json({ wallet: updated });
  } catch (err) {
    console.error("Wallet error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
