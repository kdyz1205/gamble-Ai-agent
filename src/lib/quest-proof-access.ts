import { getAuthUser, type AuthUser } from "./auth";
import prisma from "./db";
import { isBlockedQuestViewer } from "./user-blocks";

/** Unlisted invitation previews are shareable; private proof is only for authorized viewers. */
export async function canReadQuestProof(quest: {
  isPublic: boolean; visibility: string; creatorId: string;
  participants: Array<{ userId: string; status: string }>;
}, verifiedViewer?: AuthUser | null): Promise<boolean> {
  const user = verifiedViewer === undefined ? await getAuthUser() : verifiedViewer;
  if (user && await isBlockedQuestViewer(user.userId, quest)) return false;
  if (quest.isPublic && quest.visibility === "public") return true;
  if (!user) return false;
  if (user.userId === quest.creatorId || quest.participants.some((p) => p.userId === user.userId && p.status === "accepted")) return true;
  return (await prisma.user.findUnique({ where: { id: user.userId }, select: { isReviewer: true } }))?.isReviewer === true;
}
