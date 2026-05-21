import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import RoomClient from "./RoomClient";

export default async function ChallengeRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { id: true, title: true, isPublic: true },
  }).catch(() => null);

  if (!challenge) notFound();

  return <RoomClient challengeId={id} title={challenge.title} />;
}
