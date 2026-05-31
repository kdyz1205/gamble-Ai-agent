import type { Metadata } from "next";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import RoomClient from "./RoomClient";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://stubborn-ai.vercel.app";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const challenge = await prisma.challenge.findUnique({
    where: { id },
    select: { id: true, title: true, description: true, proposition: true, isPublic: true },
  }).catch(() => null);
  if (!challenge) return { title: "Challenge not found - stubborn" };
  const description = challenge.proposition || challenge.description || "Join an AI-refereed challenge on stubborn.";
  const url = `${APP_URL}/challenge/${challenge.id}`;
  return {
    title: `${challenge.title} - stubborn Challenge`,
    description,
    alternates: { canonical: url },
    robots: challenge.isPublic ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: challenge.title,
      description,
      url,
      siteName: "stubborn",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: challenge.title,
      description,
    },
  };
}

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
