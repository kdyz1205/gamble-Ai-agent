import { NextRequest } from "next/server";
import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";
import { isAddress } from "viem";

/**
 * POST /api/tokens/link-wallet — Link an EVM wallet address to the user account.
 * This enables on-chain USAGE token tracking and staking.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return unauthorized();

  const { address } = await req.json();

  if (!address || !isAddress(address)) {
    return Response.json({ error: "Invalid EVM address" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { evmAddress: address, id: { not: user.userId } },
  });
  if (existing) {
    return Response.json({ error: "This wallet is already linked to another account" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: user.userId },
    data: { evmAddress: address },
  });

  return Response.json({ success: true, address });
}
