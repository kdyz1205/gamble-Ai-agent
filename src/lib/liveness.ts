import { randomBytes } from "crypto";

/* ── Gesture prompts (layer 1 — kept for backward compat) ── */

const GESTURE_PROMPTS = [
  "Hold up 3 fingers for the first 3 seconds of your video",
  "Give a thumbs up at the start of your video",
  "Make a peace sign (V) before you begin",
  "Wave at the camera before starting",
  "Touch your nose with your left hand at the start",
  "Show your open palm to the camera for 2 seconds",
  "Point at the ceiling, then at the camera",
  "Make an OK sign with your fingers before starting",
];

export function generateLivenessPrompt(): string {
  return GESTURE_PROMPTS[Math.floor(Math.random() * GESTURE_PROMPTS.length)];
}

/* ── Screen-flash color sequence (layer 2 — anti-splice) ── */

/**
 * Before recording starts, the frontend flashes a random sequence of 3–4 solid
 * fullscreen colors. The phone camera captures the reflected light on the user's
 * face/environment. The AI verifier checks that the color sequence matches.
 *
 * This is extremely hard to fake because:
 * 1. The sequence is generated per-challenge-submission (not per-challenge).
 * 2. Reflected light patterns are unique to the physical environment.
 * 3. Pre-recorded video would show the WRONG color reflections.
 * 4. AI deepfake tools cannot retroactively inject correct light reflections.
 */

const FLASH_COLORS = [
  { name: "red", hex: "#FF0000" },
  { name: "green", hex: "#00FF00" },
  { name: "blue", hex: "#0000FF" },
  { name: "yellow", hex: "#FFFF00" },
  { name: "magenta", hex: "#FF00FF" },
  { name: "cyan", hex: "#00FFFF" },
  { name: "white", hex: "#FFFFFF" },
  { name: "orange", hex: "#FF8000" },
] as const;

export interface LivenessChallenge {
  /** Human-readable gesture to perform. */
  gesturePrompt: string;
  /** Ordered color sequence the frontend must flash (3–4 colors, 0.8s each). */
  colorSequence: Array<{ name: string; hex: string }>;
  /** Hex-encoded random nonce tied to this specific submission attempt. */
  nonce: string;
  /** Unix timestamp (ms) when this challenge was generated — expires after 5 min. */
  issuedAt: number;
}

/**
 * Generate a full liveness challenge with gesture + color flash.
 * Store the result server-side (DB or signed JWT) so it can't be tampered with.
 */
export function generateLivenessChallenge(): LivenessChallenge {
  const gesture = generateLivenessPrompt();
  const seqLen = 3 + (Math.random() < 0.5 ? 1 : 0); // 3 or 4 flashes
  const colorSequence: LivenessChallenge["colorSequence"] = [];
  const used = new Set<number>();
  while (colorSequence.length < seqLen) {
    const idx = Math.floor(Math.random() * FLASH_COLORS.length);
    if (!used.has(idx)) {
      used.add(idx);
      colorSequence.push({ ...FLASH_COLORS[idx] });
    }
  }
  return {
    gesturePrompt: gesture,
    colorSequence,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };
}

/** Max age for a liveness challenge (5 minutes). */
export const LIVENESS_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Check whether a liveness challenge has expired. */
export function isLivenessChallengeExpired(challenge: LivenessChallenge): boolean {
  return Date.now() - challenge.issuedAt > LIVENESS_CHALLENGE_TTL_MS;
}

/**
 * Build the AI verification instruction block for the judge prompt.
 * Includes both gesture AND color-flash verification.
 */
export function buildLivenessVerificationBlock(challenge: LivenessChallenge): string {
  const colorNames = challenge.colorSequence.map((c) => c.name).join(" → ");
  return `CRITICAL FIRST CHECK — LIVENESS VERIFICATION (TWO-LAYER):

LAYER 1 — GESTURE CHECK:
The liveness prompt for this challenge is: "${challenge.gesturePrompt}"
If a participant's video does NOT show the required gesture/action in the first few seconds, that participant AUTOMATICALLY FAILS with reason "LIVENESS_GESTURE_FAILED".

LAYER 2 — SCREEN-FLASH COLOR VERIFICATION:
Before recording, the participant's screen flashed these colors in order: ${colorNames}
Each flash lasted ~0.8 seconds. Look at the FIRST 2–4 seconds of the video for colored light reflections on the participant's face, skin, and surroundings.
- The reflected light color sequence MUST match: ${colorNames}
- If the reflections do NOT match (wrong colors, wrong order, or no visible reflections), the participant AUTOMATICALLY FAILS with reason "LIVENESS_FLASH_MISMATCH".
- Pre-recorded or spliced videos will show WRONG or NO color reflections — this is intentional anti-cheat.

Nonce (for audit): ${challenge.nonce}

If EITHER layer fails for a participant, they AUTOMATICALLY FAIL regardless of their performance.
If no liveness challenge was issued, skip both checks.

`;
}
