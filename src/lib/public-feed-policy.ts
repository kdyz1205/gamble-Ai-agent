import type { Prisma } from "@/generated/prisma/client";

/** Existing repository integration fixtures use this exact reserved domain.
 * This is a read/display boundary, not deletion or a username-based heuristic.
 * Real users named `qa_*` are not excluded. Audit/private records stay intact.
 */
const fixtureAccount: Prisma.UserWhereInput = {
  email: { endsWith: "@example.invalid", mode: "insensitive" },
};

export function publicFeedWhere(type: string | null): Prisma.ActivityEventWhereInput {
  return {
    AND: [
      { OR: [{ challengeId: null }, { challenge: { is: { isPublic: true, visibility: "public" } } }] },
      { OR: [{ userId: null }, { user: { is: { NOT: fixtureAccount } } }] },
      // System-generated verdicts may have no actor, so check the linked
      // challenge's creator as well. Apply before pagination AND total count.
      { OR: [{ challengeId: null }, { challenge: { is: { creator: { is: { NOT: fixtureAccount } } } } }] },
    ],
    ...(type ? { type } : {}),
  };
}
