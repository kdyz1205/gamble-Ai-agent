export const questSeeds = [
  { id: "move", label: "Move", name: "A little further, together.", realm: "The Arena", kind: "move", hint: "Make a real-world challenge with a friend.", prompt: "Challenge my friend to a badminton match: first to win 3 rallies. Each person uploads a continuous video within 24 hours." },
  { id: "craft", label: "Create", name: "An idea worth bringing to life.", realm: "The Workshop", kind: "craft", hint: "Turn something you want to make into a quest.", prompt: "Challenge my friend and me to each finish a small creative project within 7 days. We will agree on a measurable completion checklist and upload photos of the finished work." },
  { id: "grow", label: "Grow", name: "Seven days. A new beginning.", realm: "The Grove", kind: "grow", hint: "Give an everyday intention a shared finish line.", prompt: "Challenge my friend to walk for 20 minutes every day for 7 days. We each upload our daily activity record." },
] as const;
export type QuestSeedId = (typeof questSeeds)[number]["id"];
