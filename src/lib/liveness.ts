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
