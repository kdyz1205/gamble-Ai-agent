import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://gamble-ai-agent.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/challenge/", "/events/", "/markets", "/radar", "/join/"],
      disallow: ["/api/", "/me", "/workflow", "/ui-lab"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
