export const sceneRoutes = [
  { href: "/summons", label: "Summon", phase: "Quest" },
  { href: "/contracts/bind", label: "Quests", phase: "Active" },
  { href: "/duel/demo", label: "Proof", phase: "Portal" },
  { href: "/rituals", label: "Familiars", phase: "Prep" },
  { href: "/enter", label: "Lore", phase: "Gateway" },
  { href: "/judgment/demo", label: "Results", phase: "Receipts" },
] as const;

export type SceneRouteHref = (typeof sceneRoutes)[number]["href"];
