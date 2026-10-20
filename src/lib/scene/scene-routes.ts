export const sceneRoutes = [
  { href: "/summons", label: "Summon", phase: "Quest" },
  { href: "/quests", label: "Quests", phase: "Active" },
  { href: "/quests?view=proof", label: "Proof", phase: "Evidence" },
  { href: "/quests?view=results", label: "Results", phase: "Receipts" },
  { href: "/me", label: "Profile", phase: "Summoner" },
] as const;

export type SceneRouteHref = (typeof sceneRoutes)[number]["href"];
