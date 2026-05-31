import type { MetadataRoute } from "next";
import prisma from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://gamble-ai-agent.vercel.app";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [challenges, events] = await Promise.all([
    prisma.challenge.findMany({
      where: { isPublic: true, visibility: { not: "archived" } },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }).catch(() => []),
    prisma.challengeEvent.findMany({
      where: { status: "open" },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }).catch(() => []),
  ]);

  return [
    {
      url: APP_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${APP_URL}/markets`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
    {
      url: `${APP_URL}/radar`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.7,
    },
    ...challenges.map((challenge) => ({
      url: `${APP_URL}/challenge/${challenge.id}`,
      lastModified: challenge.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...events.map((event) => ({
      url: `${APP_URL}/events/${event.id}`,
      lastModified: event.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
