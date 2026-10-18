import prisma from "./db";
import { COSTS } from "./credits";

export class SignupConflictError extends Error {
  constructor(public readonly field: "email" | "username") {
    super(field === "email" ? "Email already taken" : "Username already taken");
    this.name = "SignupConflictError";
  }
}

export const AUTH_UNAVAILABLE_MESSAGE = "Sign-in is temporarily unavailable. Please try again.";

/** NextAuth forwards callback error messages to clients; retain details server-side only. */
export async function authErrorBoundary<T>(phase: string, fn: () => Promise<T>, allowSignupConflict = false): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (allowSignupConflict && error instanceof SignupConflictError) throw new Error(error.message);
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code : error instanceof Error ? error.name : "unknown";
    // Do not log credential values or raw Prisma/provider error text.
    console.error("[auth] operation failed", { phase, code });
    throw new Error(AUTH_UNAVAILABLE_MESSAGE);
  }
}

interface SignupInput {
  source: "credentials" | "google";
  email: string;
  username: string;
  id?: string;
  passwordHash?: string;
  name?: string | null;
  image?: string | null;
}

/** Provision the account, welcome balance, ledger receipt and activity as one commit. */
export async function provisionSignupUser(input: SignupInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Concurrent callbacks for one email must converge on one account/bonus.
      // Username collisions across distinct emails remain guarded by its unique index.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.email}, 7121))`;
      const existingEmail = await tx.user.findUnique({ where: { email: input.email } });
      if (existingEmail) {
        if (input.source === "credentials") throw new SignupConflictError("email");
        return tx.user.update({ where: { id: existingEmail.id }, data: { isOnline: true, lastSeenAt: new Date() } });
      }
      if (await tx.user.findUnique({ where: { username: input.username }, select: { id: true } })) {
        throw new SignupConflictError("username");
      }
      const user = await tx.user.create({ data: {
        id: input.id, email: input.email, username: input.username,
        passwordHash: input.passwordHash, name: input.name, image: input.image,
        ...(input.source === "google" ? { emailVerified: new Date() } : {}),
        credits: COSTS.SIGNUP_BONUS, isOnline: true,
      } });
      await tx.creditTx.create({ data: {
        userId: user.id, type: "bonus", amount: COSTS.SIGNUP_BONUS,
        balanceAfter: COSTS.SIGNUP_BONUS, description: "Welcome bonus",
        idempotencyKey: `signup:bonus:${user.id}`,
      } });
      await tx.activityEvent.create({ data: {
        type: "user_joined", userId: user.id,
        message: input.source === "google" ? `${user.username} joined via Google` : `${user.username} joined ChallengeAI`,
      } });
      return user;
    }, { maxWait: 15_000, timeout: 15_000 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      // A different email can race for the same username. The failed transaction
      // already rolled back its account/balance/ledger before this public result.
      const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      throw new SignupConflictError(existing ? "email" : "username");
    }
    throw error;
  }
}
