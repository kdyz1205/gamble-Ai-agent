export type ChallengeLoopStatus =
  | "production_proven"
  | "fixture_proven"
  | "guardrail_proven"
  | "manual_review_only";

export type ChallengeLoopCatalogItem = {
  id: string;
  title: string;
  prompt: string;
  status: ChallengeLoopStatus;
  participantMode: "solo" | "head_to_head" | "small_group" | "mass_crowd";
  evidenceMode: "text" | "screenshot" | "video" | "same_camera_video" | "gps" | "manual_review";
  proof: string;
  successCriteria: string[];
};

export const CERTIFIED_CHALLENGE_LOOPS: ChallengeLoopCatalogItem[] = [
  {
    id: "solo-objective-proof",
    title: "Solo proof",
    prompt: "I bet my cat can finish the food under one minute.",
    status: "production_proven",
    participantMode: "solo",
    evidenceMode: "text",
    proof: "scripts/e2e-solo-challenge-flow.mjs",
    successCriteria: [
      "No opponent is created or required.",
      "Creator can submit evidence immediately.",
      "Judge can return creator as winner for a proven claim.",
      "Final status becomes settled.",
    ],
  },
  {
    id: "objective-answer-head-to-head",
    title: "Answer challenge",
    prompt: "Challenge a friend: whoever submits the correct answer to a trivia question wins.",
    status: "production_proven",
    participantMode: "head_to_head",
    evidenceMode: "text",
    proof: "scripts/e2e-winner-settlement.mjs",
    successCriteria: [
      "Creator creates a public challenge.",
      "Opponent accepts.",
      "Both submit evidence.",
      "Winner settlement writes ledger rows.",
    ],
  },
  {
    id: "pushup-fixture-video",
    title: "Push-up video",
    prompt: "I want to challenge a friend: who can do more valid push-ups in 60 seconds?",
    status: "fixture_proven",
    participantMode: "head_to_head",
    evidenceMode: "video",
    proof: "scripts/e2e-video-winner-settlement.mjs",
    successCriteria: [
      "Both participants upload video evidence.",
      "Vision judge returns structured rep metrics.",
      "High-confidence winner auto-settles.",
      "Generated fixtures pass; arbitrary phone videos still need robustness proof.",
    ],
  },
  {
    id: "plank-video",
    title: "Plank hold",
    prompt: "Create a two-person challenge for who can hold a plank longer with video evidence.",
    status: "manual_review_only",
    participantMode: "head_to_head",
    evidenceMode: "video",
    proof: "manual review until video robustness is proven",
    successCriteria: [
      "Both participants submit continuous video.",
      "AI can recommend a result.",
      "Auto-settlement requires future duration-specific video proof.",
    ],
  },
  {
    id: "typing-screenshot",
    title: "Typing race",
    prompt: "Challenge a friend on who can type a 100-word paragraph faster with screenshot proof.",
    status: "fixture_proven",
    participantMode: "head_to_head",
    evidenceMode: "screenshot",
    proof: "scripts/e2e-screenshot-settlement.mjs",
    successCriteria: [
      "Opponent accepts.",
      "Both submit screenshots.",
      "Fixture screenshot result metadata can produce a settled winner.",
      "Arbitrary screenshot OCR still requires a stronger vision/OCR E2E before auto-settle.",
    ],
  },
  {
    id: "study-streak",
    title: "Study streak",
    prompt: "Make a 3-day study streak challenge where both people submit daily proof.",
    status: "fixture_proven",
    participantMode: "head_to_head",
    evidenceMode: "text",
    proof: "scripts/e2e-study-streak-settlement.mjs",
    successCriteria: [
      "Opponent accepts.",
      "Both participants submit structured study proof.",
      "Fixture study proof can settle winner credits.",
      "True multi-day daily evidence history still needs a separate repeated-check-in model.",
    ],
  },
  {
    id: "nearby-check-in",
    title: "Nearby check-in",
    prompt: "Create a nearby public challenge where people walk to the location and check in.",
    status: "fixture_proven",
    participantMode: "head_to_head",
    evidenceMode: "gps",
    proof: "scripts/e2e-gps-checkin-settlement.mjs",
    successCriteria: [
      "Far location is rejected by eligibility check.",
      "Nearby location is accepted.",
      "Both participants submit GPS metadata evidence.",
      "Fixture GPS check-in can settle winner credits.",
      "Settlement proof runs private to avoid polluting public challenge lists; public radar discovery is covered separately.",
      "Precise stranger location still must stay private in UI.",
    ],
  },
  {
    id: "game-score-screenshot",
    title: "Game score",
    prompt: "I want to challenge someone on who gets the higher score in one game round using screenshot evidence.",
    status: "fixture_proven",
    participantMode: "head_to_head",
    evidenceMode: "screenshot",
    proof: "scripts/e2e-screenshot-settlement.mjs",
    successCriteria: [
      "Both screenshots are tied to the challenge.",
      "Score and player identity are visible.",
      "Fixture screenshot result metadata can produce a settled winner.",
      "Ambiguous, edited, or OCR-only screenshots still require manual review until robustness is proven.",
    ],
  },
];

export const HOMEPAGE_CHALLENGE_LOOPS = CERTIFIED_CHALLENGE_LOOPS;

export function challengeLoopStatusLabel(status: ChallengeLoopStatus) {
  if (status === "production_proven") return "production proven";
  if (status === "fixture_proven") return "fixture proven";
  if (status === "guardrail_proven") return "guardrail proven";
  return "review only";
}
