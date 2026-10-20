export const sceneRoutes = [
  { href: "/summons", label: "Create", phase: "Quest" },
  { href: "/contracts/bind", label: "Rules", phase: "Active" },
  { href: "/duel/demo", label: "Proof", phase: "Portal" },
  { href: "/rituals", label: "Pico", phase: "Prep" },
  { href: "/enter", label: "World", phase: "Gateway" },
  { href: "/judgment/demo", label: "Results", phase: "Receipts" },
] as const;

export type SceneRouteHref = (typeof sceneRoutes)[number]["href"];
