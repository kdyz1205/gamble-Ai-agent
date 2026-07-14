import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Summon World",
    short_name: "Summon",
    description:
      "Summon quests, invite challengers, submit proof, and let AI familiars referee the result.",
    start_url: "/enter",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#DFF5FF",
    theme_color: "#DFF5FF",
    icons: [
      {
        src: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
