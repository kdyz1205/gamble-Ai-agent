import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";

/** Both directions count for safety; never modify existing challenge/ledger rows. */
export async function blockedPeerIds(viewerId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => r.blockerId === viewerId ? r.blockedId : r.blockerId))];
}

/** Anonymous visitors have no account-specific block list. */
export function blockedFeedExclusions(peerIds: readonly string[]): Prisma.ActivityEventWhereInput {
  if (!peerIds.length) return {};
  const ids = [...peerIds];
  return { NOT: [
    { userId: { in: ids } },
    { challenge: { is: { creatorId: { in: ids } } } },
    { challenge: { is: { participants: { some: { userId: { in: ids } } } } } },
  ] };
}

export function publicChallengePeerExclusions(peerIds: readonly string[]): Prisma.ChallengeWhereInput {
  if (!peerIds.length) return {};
  const ids = [...peerIds];
  return {
    creatorId: { notIn: ids },
    participants: { none: { userId: { in: ids } } },
  };
}

/** Existing parties retain historical records, but outsiders cannot use direct links
 * to bypass reciprocal blocking of the creator or any participant. */
export async function isBlockedQuestViewer(
  viewerId: string,
  quest: { creatorId: string; participants: Array<{userId: string}> },
): Promise<boolean> {
  if (viewerId === quest.creatorId || quest.participants.some(p => p.userId === viewerId)) return false;
  const peers = await blockedPeerIds(viewerId);
  return peers.includes(quest.creatorId) || quest.participants.some(p => peers.includes(p.userId));
}
