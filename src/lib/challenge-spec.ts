export type ChallengeSpec = {
  challenge_title: string;
  challenge_type: string;
  participants: Array<{ role: "creator" | "opponent"; label: string; user_id?: string | null }>;
  stake_amount: number;
  currency_or_points: "points" | "credits";
  public_or_private: "public" | "private";
  invite_mode: "nearby" | "invite_link" | "direct_friend" | "same_device";
  participation_mode: "remote_async" | "remote_live" | "same_camera" | "in_person";
  objective: string;
  winning_condition: string;
  required_evidence: string;
  video_capture_instructions: string;
  start_condition: string;
  end_condition: string;
  timing_method: string;
  valid_repetition_definition: string;
  scoring_method: string;
  allowed_attempts: string;
  anti_cheat_rules: string[];
  ai_judging_method: string;
  dispute_window: string;
  fallback_manual_review: string;
  payout_rule: string;
  safety_warning: string;
  legal_compliance_flag: "internal_points_only" | "requires_legal_review";
  mode_options: Array<{ label: string; value: string; description: string }>;
};

const DEFAULT_STAKE = 0;

function titleCaseName(value: string | null): string {
  if (!value) return "Opponent";
  return value
    .trim()
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Opponent";
}

function extractOpponent(input: string): string {
  const patterns = [
    /\bbet\s+([A-Za-z][\w-]*)\b/i,
    /\bchallenge\s+([A-Za-z][\w-]*)\b/i,
    /\bcompete\s+with\s+([A-Za-z][\w-]*)\b/i,
    /\bcompete\s+against\s+([A-Za-z][\w-]*)\b/i,
    /\bvs\.?\s+([A-Za-z][\w-]*)\b/i,
    /\bagainst\s+([A-Za-z][\w-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match?.[1] && !["someone", "somebody", "who", "that", "on", "with"].includes(match[1].toLowerCase())) {
      return titleCaseName(match[1]);
    }
  }
  return "Opponent";
}

function extractStake(input: string): number {
  const dollar = input.match(/\$\s*(\d+)/);
  const points = input.match(/(\d+)\s*(?:points?|credits?)/i);
  return Math.max(0, Math.floor(Number(dollar?.[1] ?? points?.[1] ?? DEFAULT_STAKE)));
}

function baseSpec(input: string): ChallengeSpec {
  const opponent = extractOpponent(input);
  return {
    challenge_title: `AI Challenge vs ${opponent}`,
    challenge_type: "peer_to_peer_challenge",
    participants: [
      { role: "creator", label: "You" },
      { role: "opponent", label: opponent },
    ],
    stake_amount: extractStake(input),
    currency_or_points: "points",
    public_or_private: opponent === "Opponent" ? "public" : "private",
    invite_mode: opponent === "Opponent" ? "nearby" : "invite_link",
    participation_mode: "remote_async",
    objective: "Complete the described challenge under the same rules and submit evidence.",
    winning_condition: "The participant whose evidence best satisfies the objective wins.",
    required_evidence: "Video evidence is required for both participants.",
    video_capture_instructions: "Record continuously with the participant and relevant action clearly visible. Avoid cuts, filters, or hidden timers.",
    start_condition: "The attempt starts when the participant clearly says 'start' or presses the in-app start button.",
    end_condition: "The attempt ends when the objective is complete or the agreed time limit expires.",
    timing_method: "Use the in-app timestamp and visible video timing metadata.",
    valid_repetition_definition: "The app defines valid repetitions based on the specific challenge rules.",
    scoring_method: "AI compares submitted evidence against the challenge rules; unclear media pauses settlement for manual review.",
    allowed_attempts: "One official attempt per participant unless both agree to restart before evidence is submitted.",
    anti_cheat_rules: [
      "No edited or cut video.",
      "Participant must stay visible during the attempt.",
      "Device timestamp metadata should be preserved.",
      "AI may flag unclear evidence for manual review.",
    ],
    ai_judging_method: "AI reviews available video frames, metadata, and descriptions, returns confidence, and requires manual review when evidence is not reliable enough.",
    dispute_window: "15 minutes after verdict",
    fallback_manual_review: "If confidence is below 0.85 or a rule violation is detected, pause settlement and send the challenge to manual review.",
    payout_rule: "Winner receives the pooled internal credits/points after judgment and the dispute window closes.",
    safety_warning: "Only attempt safe, legal, voluntary challenges. Stop immediately if pain, danger, or coercion is involved.",
    legal_compliance_flag: "internal_points_only",
    mode_options: [
      { label: "Invite link", value: "invite_link", description: "Send a private link to the opponent." },
      { label: "Nearby discovery", value: "nearby", description: "Let nearby users discover and join." },
      { label: "Same device", value: "same_device", description: "One phone records both participants together." },
      { label: "Remote video", value: "remote_async", description: "Each participant records and uploads separately." },
    ],
  };
}

export function generateChallengeSpec(inputText: string): ChallengeSpec {
  const input = inputText.trim();
  const lower = input.toLowerCase();
  const sameCamera = /same[_ -]?camera|same phone|one phone|single phone|shared video|same video|same device|together/.test(lower);
  const nearby = /nearby|near me|local discovery|gps|location/.test(lower);
  const spec: ChallengeSpec = {
    ...baseSpec(input),
    ...(nearby
      ? {
          public_or_private: "public" as const,
          invite_mode: "nearby" as const,
        }
      : {}),
    ...(sameCamera
      ? {
          invite_mode: "same_device" as const,
          participation_mode: "same_camera" as const,
          required_evidence: "One continuous same-camera video showing both participants.",
          video_capture_instructions: "Record one continuous video on one phone with both participants visible; keep creator left and opponent right when possible.",
        }
      : {}),
  };
  const opponent = spec.participants[1]?.label || "Opponent";

  if (/push[-\s]?ups?/.test(lower)) {
    return {
      ...spec,
      challenge_title: `Push-up Speed Challenge vs ${opponent}`,
      challenge_type: "physical_challenge",
      invite_mode: sameCamera ? "same_device" : nearby ? "nearby" : "invite_link",
      objective: "Each participant performs valid push-ups on camera under the same rules.",
      winning_condition: "Winner is the participant who completes the agreed number of valid push-ups fastest. If no target count is agreed, winner is the participant with the most valid push-ups within 60 seconds.",
      required_evidence: sameCamera
        ? "One continuous same-camera video showing both participants doing push-ups at the same time."
        : "Video required from each participant, or one same-device video showing both participants.",
      participation_mode: sameCamera ? "same_camera" : "remote_async",
      video_capture_instructions: sameCamera
        ? "Use one phone and keep both participants' full bodies visible from start to finish. Put creator on the left and opponent on the right when possible. Do not cut, speed up, or switch camera angles."
        : "Full body must be visible from head to feet. Side angle preferred. Hands, chest, hips, and feet must remain in frame. Record the full attempt in one continuous clip.",
      start_condition: "A 3-second countdown starts first. Timer starts when the participant is in push-up/plank position with hands and feet set.",
      end_condition: "Timer ends when the target repetitions are completed or the 60-second cap expires.",
      timing_method: "Use in-app timestamp plus visible video frame timing. AI counts only valid push-ups.",
      valid_repetition_definition: "Arms locked at the top, chest lowers near the floor, hips stay aligned with shoulders and heels, and incomplete or unclear repetitions do not count.",
      scoring_method: "Score by elapsed time to target reps. If target reps are not set, score by most valid reps within the time limit; ties go to cleaner form and clearer video.",
      allowed_attempts: "One official recorded attempt per participant.",
      anti_cheat_rules: [
        "Chest must lower clearly and arms must extend at the top.",
        "Full body must remain visible.",
        "No cuts, speed changes, or edited clips.",
        "Repetitions with unclear form are not counted.",
      ],
      ai_judging_method: "AI vision counts valid repetitions, checks form, compares time/count, flags invalid reps, and returns confidence.",
      safety_warning: "Warm up first and stop if there is pain. Do not attempt if injured or medically restricted.",
    };
  }

  if (/water|bottle|drink/.test(lower)) {
    return {
      ...spec,
      challenge_title: `Water Bottle Speed Challenge vs ${opponent}`,
      challenge_type: "physical_challenge",
      objective: "Each participant drinks the same size sealed bottle of water as fast as safely possible.",
      winning_condition: "Winner is the participant who finishes the bottle fastest without spilling or unsafe behavior.",
      required_evidence: "Continuous video showing sealed bottle, start, finish, and empty bottle.",
      video_capture_instructions: "Show the sealed bottle label/size before starting. Keep face, bottle, and table area visible.",
      valid_repetition_definition: "A valid finish requires the same bottle size, no intentional spilling, and the bottle visibly empty at the end.",
      scoring_method: "Shortest verified completion time wins.",
      safety_warning: "Use a small safe bottle size. Do not force drinking or use alcohol.",
    };
  }

  if (/burger|hamburger|eat|eating|food/.test(lower)) {
    return {
      ...spec,
      challenge_title: `Burger Eating Challenge vs ${opponent}`,
      challenge_type: "eating_challenge",
      objective: "Each participant attempts to eat the agreed number of burgers under the same conditions and submits clear video evidence.",
      winning_condition: "Winner is the participant who finishes the agreed burger count fastest. If neither finishes, winner is the participant who eats the most within the time limit.",
      required_evidence: "Continuous video showing the burgers before start, the participant during the attempt, and the remaining food at the end.",
      video_capture_instructions: "Keep face, hands, plate, burgers, and timer visible. Show the burger count before the 3-second countdown. Do not cut or speed up the clip.",
      start_condition: "A 3-second countdown starts first. Timer starts when both hands are visible and the burgers are untouched.",
      end_condition: "Timer ends when the agreed burger count is finished or the time limit expires.",
      timing_method: "Use in-app timestamp plus visible timer/video timing.",
      valid_repetition_definition: "A valid burger counts only when it is fully eaten and swallowed without hiding, discarding, or swapping food.",
      scoring_method: "Fastest verified finish wins; otherwise most fully eaten burgers within the time limit wins.",
      anti_cheat_rules: [
        "No hiding, discarding, or swapping food.",
        "Food, hands, and mouth area must remain visible.",
        "No cuts, speed changes, or edited clips.",
        "Unsafe choking behavior pauses or voids the attempt.",
      ],
      ai_judging_method: "AI vision reviews the continuous video, checks visible burger count, compares finish time/count, flags unclear evidence, and returns confidence.",
      safety_warning: "Food challenges can be unsafe. Use a reasonable amount, do not force eating, and stop immediately if choking or distress occurs.",
    };
  }

  if (/run|mile|race/.test(lower)) {
    return {
      ...spec,
      challenge_title: `Running Challenge vs ${opponent}`,
      challenge_type: "fitness_challenge",
      objective: "Each participant completes the agreed route or distance and submits proof.",
      winning_condition: "Winner is the participant with the fastest verified completion time.",
      required_evidence: "Video plus GPS/timer screenshot if remote; same-camera finish video if in person.",
      video_capture_instructions: "Record start and finish, and include route/timer proof when remote.",
      timing_method: "Use in-app timestamps, GPS metadata, and visible timer evidence.",
      valid_repetition_definition: "A valid run starts and ends at the agreed points and covers the agreed route or distance.",
      scoring_method: "Fastest verified elapsed time wins.",
      safety_warning: "Run only in a safe public route and follow traffic laws.",
    };
  }

  return spec;
}

export function challengeSpecToRules(spec: ChallengeSpec): string {
  return [
    `Objective: ${spec.objective}`,
    `Winning condition: ${spec.winning_condition}`,
    `Evidence: ${spec.required_evidence}`,
    `Recording: ${spec.video_capture_instructions}`,
    `Start: ${spec.start_condition}`,
    `End: ${spec.end_condition}`,
    `Timing: ${spec.timing_method}`,
    `Valid rep: ${spec.valid_repetition_definition}`,
    `Scoring: ${spec.scoring_method}`,
    `Attempts: ${spec.allowed_attempts}`,
    `Anti-cheat: ${spec.anti_cheat_rules.join(" ")}`,
    `AI judging: ${spec.ai_judging_method}`,
    `Dispute: ${spec.dispute_window}. ${spec.fallback_manual_review}`,
    `Settlement: ${spec.payout_rule}`,
    `Safety: ${spec.safety_warning}`,
  ].join("\n");
}
