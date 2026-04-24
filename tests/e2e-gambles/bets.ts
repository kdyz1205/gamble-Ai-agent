/**
 * 10 distinct, safe, judgeable bet ideas. Each one is a compound statement
 * so the agent can skip straight to show_draft instead of asking 3+ follow-ups
 * (drives down each gamble's runtime). Picked to exercise different challenge
 * types: fitness / skill / prediction / games / cooking etc.
 */
export interface BetScript {
  /** The first (compound) message the creator types. */
  prompt: string;
  /** Creator's text evidence description (claim of success). */
  creatorEvidence: string;
  /** Opponent's text evidence description (claim of failure — asymmetric so AI picks a clear winner). */
  opponentEvidence: string;
}

export const BETS: BetScript[] = [
  {
    prompt: "who can do more pushups in 60 seconds, just for fun with video proof, within 1 hour",
    creatorEvidence: "I recorded a video and completed 42 clean pushups in the 60-second window.",
    opponentEvidence: "I gave up at pushup 18. Video cut off.",
  },
  {
    prompt: "planking contest — who can hold the longest plank, video proof, for fun, 1 hour window",
    creatorEvidence: "Video shows me holding a full plank for 3 minutes 10 seconds on a timer.",
    opponentEvidence: "I dropped to my knees at 45 seconds. Not a successful attempt.",
  },
  {
    prompt: "who finishes a 500ml water bottle first, video proof, just for fun, within 1 hour",
    creatorEvidence: "Video shows the bottle empty in 9 seconds, on-camera stopwatch.",
    opponentEvidence: "I coughed and had to stop halfway. Did not finish.",
  },
  {
    prompt: "5 basketball three-pointers first, video proof, for fun, within 1 hour",
    creatorEvidence: "Video captures 5 successful three-pointers in under 2 minutes.",
    opponentEvidence: "I missed 12 times in a row and stopped trying.",
  },
  {
    prompt: "who can do more burpees in 90 seconds, video proof, no stake, within 1 hour",
    creatorEvidence: "Clocked 28 full burpees on camera with a visible timer.",
    opponentEvidence: "Only got through 6 before I had to stop.",
  },
  {
    prompt: "who can cook an omelette faster from raw eggs to plate, video, for fun, 1 hour",
    creatorEvidence: "Video from cracking the first egg to omelette on plate: 2 min 15 sec.",
    opponentEvidence: "I burnt it and had to start over. Gave up.",
  },
  {
    prompt: "longest handstand hold against a wall, video proof, for fun, 1 hour",
    creatorEvidence: "Held a clean wall-supported handstand for 47 seconds on a visible stopwatch. Full body inverted, both hands on the floor, feet touching the wall the entire time.",
    opponentEvidence: "My attempt video shows 0 seconds of handstand. I never got my feet off the ground — I stopped at 'ready position'. Clear loss.",
  },
  {
    prompt: "who can solve a 4x4 rubik's cube first, video proof, for fun, 1 hour",
    creatorEvidence: "Video shows the cube solved in 3 min 42 sec from a scrambled start.",
    opponentEvidence: "I got stuck on the last layer and gave up.",
  },
  {
    prompt: "who can do 20 squats faster, video proof, for fun, within 1 hour",
    creatorEvidence: "Clean set of 20 squats in 34 seconds on camera.",
    opponentEvidence: "I lost count and my form broke. Did not complete cleanly.",
  },
  {
    prompt: "30 jumping jacks fastest, video proof, for fun, within 1 hour",
    creatorEvidence: "30 jumping jacks in 21 seconds, visible count on screen.",
    opponentEvidence: "Stopped at 12 because I was laughing too hard.",
  },
];
