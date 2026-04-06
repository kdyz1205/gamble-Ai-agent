import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { MODEL_TIERS, type TierId, tierById } from "./contracts";

export interface AuthUser {
  userId: string;
  email: string;
  username: string;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    const user = session.user as { id?: string; email?: string; username?: string };
    if (user.id && user.email) {
      return { userId: user.id, email: user.email, username: user.username || user.email.split("@")[0] };
    }
  }
  return null;
}

export function unauthorized() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function noCredits(needed: number, have: number, tierName?: string) {
  return Response.json({
    error: `Not enough ${tierName || ""} tokens. Need ${needed}, have ${have}.`,
    needsCredits: true,
    needed,
    have,
  }, { status: 402 });
}

export function getAiModel(tierId: TierId = 1): { model: string; displayName: string; tierId: TierId } {
  const tier = tierById(tierId);
  return { model: tier.model, displayName: tier.name, tierId: tier.id as TierId };
}

export { MODEL_TIERS, type TierId };
