export const sceneRoutes = [
  { href: "/summons", label: "Summon", phase: "Quest" },
  { href: "/contracts/bind", label: "Pacts", phase: "Active" },
  { href: "/duel/demo", label: "Proof", phase: "Portal" },
  { href: "/rituals", label: "Familiars", phase: "Prep" },
  { href: "/enter", label: "World", phase: "Gateway" },
  { href: "/judgment/demo", label: "Chronicle", phase: "Receipts" },
] as const;

export type SceneRouteHref = (typeof sceneRoutes)[number]["href"];
