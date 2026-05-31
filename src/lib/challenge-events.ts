import { randomInt } from "crypto";
import prisma from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export const eventPublicInclude = {
  creator: { select: { id: true, username: true, image: true } },
  entries: {
    orderBy: { joinedAt: "asc" },
    take: 20,
    select: {
      id: true,
      userId: true,
      ticketCode: true,
      status: true,
      joinedAt: true,
      user: { select: { id: true, username: true, image: true } },
    },
  },
  _count: { select: { entries: true, leaderboardEntries: true } },
  resolutions: {
    orderBy: { updatedAt: "desc" },
    take: 1,
  },
} satisfies Prisma.ChallengeEventInclude;

export function isEventProtocol(protocol: ProtocolSpecV2 | null | undefined) {
  return Boolean(
    protocol &&
      (
        protocol.participantMode === "mass_crowd" ||
        protocol.participantMode === "public_market" ||
        protocol.settlementProtocol.mode === "leaderboard" ||
        protocol.locationProtocol.mode === "mass_local_event"
      ),
  );
}

export function deriveEventMaxParticipants(protocol: ProtocolSpecV2, explicitMax?: unknown) {
  const explicit = Number(explicitMax);
  if (Number.isFinite(explicit) && explicit >= 2) {
    return Math.min(10_000, Math.floor(explicit));
  }

  const text = [
    protocol.rawPrompt,
    protocol.title,
    protocol.userFacingSummary,
    protocol.participantMode,
  ].join(" ");
  const match = text.match(/(\d[\d,\s]{0,8})\s*(?:people|players|participants|users|人|个人|位)/i);
  if (match) {
    const parsed = Number(match[1].replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 2) return Math.min(10_000, Math.floor(parsed));
  }

  return protocol.participantMode === "mass_crowd" ? 5_000 : 1_000;
}

export function issueEventTicketCode() {
  return `GMB-${randomInt(100_000, 1_000_000)}`;
}

export async function recomputeEventLeaderboard(eventId: string) {
  const rows = await prisma.leaderboardEntry.findMany({
    where: {
      eventId,
      score: { not: null },
      validationStatus: { notIn: ["invalid", "rejected", "voided"] },
    },
    orderBy: [
      { score: "desc" },
      { createdAt: "asc" },
    ],
  });

  await prisma.$transaction(
    rows.map((row, index) =>
      prisma.leaderboardEntry.update({
        where: { id: row.id },
        data: {
          rank: index + 1,
          validationStatus: row.validationStatus === "submitted" ? "valid" : row.validationStatus,
        },
      }),
    ),
  );

  return prisma.leaderboardEntry.findMany({
    where: { eventId },
    include: {
      user: { select: { id: true, username: true, image: true } },
    },
    orderBy: [
      { rank: "asc" },
      { score: "desc" },
      { createdAt: "asc" },
    ],
  });
}

export async function createChallengeEventFromProtocol(args: {
  user: AuthUser;
  protocol: ProtocolSpecV2;
  maxParticipants?: unknown;
}) {
  const maxParticipants = deriveEventMaxParticipants(args.protocol, args.maxParticipants);
  const ticketCode = issueEventTicketCode();

  const event = await prisma.challengeEvent.create({
    data: {
      creatorId: args.user.userId,
      title: args.protocol.title,
      protocolJson: JSON.stringify(args.protocol),
      status: "open",
      maxParticipants,
      entries: {
        create: {
          userId: args.user.userId,
          ticketCode,
          status: "joined",
        },
      },
    },
    include: eventPublicInclude,
  });

  return {
    event,
    creatorEntry: event.entries.find((entry) => entry.userId === args.user.userId) ?? null,
  };
}
