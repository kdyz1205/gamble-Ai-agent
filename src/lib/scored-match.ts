export type ScoredMatchMode = "first_to" | "exact_rallies";

export interface ScoredMatchContract {
  sport: "badminton" | "table_tennis" | "tennis" | "pickleball" | "volleyball";
  mode: ScoredMatchMode;
  target: number;
  maximumRallies: number;
}

export type ScoredMatchContractDetection =
  | { kind: "not_scored_sport" }
  | { kind: "ambiguous"; sport: ScoredMatchContract["sport"]; reason: string }
  | { kind: "unsupported"; sport: ScoredMatchContract["sport"]; reason: string }
  | { kind: "ready"; contract: ScoredMatchContract };

export interface RallyObservation {
  index: number;
  startSec: number;
  endSec: number;
  winner: "A" | "B" | null;
  scoreAfter: { A: number; B: number };
  confidence: number;
  evidence?: string;
}

export interface RallyLedgerInput {
  identityConfirmed: boolean;
  continuousCoverage: boolean;
  integrityFlags: string[];
  rallies: RallyObservation[];
  confidence: number;
  durationSec?: number | null;
}

export interface RallyLedgerValidation {
  valid: boolean;
  winner: "A" | "B" | null;
  finalScore: { A: number; B: number };
  confidence: number;
  errors: string[];
}

const SPORT_PATTERNS: Array<{
  sport: ScoredMatchContract["sport"];
  pattern: RegExp;
}> = [
  { sport: "badminton", pattern: /badminton|羽毛球|羽球/i },
  { sport: "table_tennis", pattern: /table\s*tennis|ping[ -]?pong|乒乓球|乒乓/i },
  { sport: "pickleball", pattern: /pickleball|匹克球/i },
  { sport: "volleyball", pattern: /volleyball|排球/i },
  { sport: "tennis", pattern: /(?:^|\W)tennis(?:\W|$)|网球/i },
];

const FIRST_TO_PATTERNS = [
  /(?:first|race)\s+to\s+(\d+)\s*(?:points?|rallies?)?/i,
  /(?:先|率先)(?:得|拿|到|赢)?\s*([一二三四五六七八九十\d]+)\s*(?:分|球|个球)/i,
  /([一二三四五六七八九十\d]+)\s*(?:分|球|个球)\s*(?:先胜|获胜|为胜|者胜)/i,
];

const EXACT_RALLY_PATTERNS = [
  /(?:exactly|fixed|play(?:ing)?\s+exactly)\s+(\d+)\s*(?:rallies|points?)/i,
  /(?:一共|总共|固定|只打|打满|共打)\s*([一二三四五六七八九十\d]+)\s*(?:个)?(?:球|回合|分)/i,
  /([一二三四五六七八九十\d]+)\s*(?:个)?(?:球|回合)\s*(?:定胜负|后结束|打完结束)/i,
];

const BARE_COUNT_PATTERN = /(?:\b(\d+)\s*(?:rallies|points?)\b|([一二三四五六七八九十\d]+)\s*(?:个)?(?:球|回合|分))/i;

function parseChineseOrArabicNumber(value: string): number | null {
  const arabic = Number(value);
  if (Number.isInteger(arabic)) return arabic;
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return digits[value] ?? null;
}

function findCount(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return parseChineseOrArabicNumber(match[1]);
  }
  return null;
}

/**
 * Detects a short, point-scored physical match and compiles its deterministic
 * scoring contract. A bare phrase such as "5个球" is deliberately rejected:
 * it could mean first-to-five points or exactly five rallies, and those can
 * produce different winners.
 */
export function detectScoredMatchContract(
  title: string,
  type?: string | null,
  rules?: string | null,
): ScoredMatchContractDetection {
  const text = [title, type, rules].filter(Boolean).join("\n");
  const sport = SPORT_PATTERNS.find((candidate) => candidate.pattern.test(text))?.sport;
  if (!sport) return { kind: "not_scored_sport" };

  const firstTo = findCount(text, FIRST_TO_PATTERNS);
  const exactRallies = findCount(text, EXACT_RALLY_PATTERNS);
  if (firstTo != null && exactRallies != null) {
    return {
      kind: "ambiguous",
      sport,
      reason: `Rules mix first-to-${firstTo} with exactly-${exactRallies}-rallies scoring.`,
    };
  }

  const mode: ScoredMatchMode | null = firstTo != null
    ? "first_to"
    : exactRallies != null
      ? "exact_rallies"
      : null;
  const target = firstTo ?? exactRallies;
  if (!mode || target == null) {
    const bare = text.match(BARE_COUNT_PATTERN);
    return {
      kind: "ambiguous",
      sport,
      reason: bare
        ? `"${bare[0]}" does not say whether the match is first-to-${parseChineseOrArabicNumber(bare[1] ?? bare[2]) ?? "N"} or exactly that many rallies.`
        : "The rules do not define a point target or an exact rally count.",
    };
  }

  if (!Number.isInteger(target) || target < 1) {
    return { kind: "unsupported", sport, reason: "The score target must be a positive integer." };
  }

  const maximumRallies = mode === "first_to" ? target * 2 - 1 : target;
  if (maximumRallies > 11) {
    return {
      kind: "unsupported",
      sport,
      reason: `This automatic short-match judge supports at most 11 rallies; these rules can require ${maximumRallies}.`,
    };
  }

  return { kind: "ready", contract: { sport, mode, target, maximumRallies } };
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Reduces a model-produced rally ledger into a result. The model never gets to
 * assign the final winner: this function checks every one-point increment,
 * ordering, continuity/integrity flags, and the challenge's stopping rule.
 */
export function validateRallyLedger(
  contract: ScoredMatchContract,
  input: RallyLedgerInput,
): RallyLedgerValidation {
  const errors: string[] = [];
  let scoreA = 0;
  let scoreB = 0;
  let previousEnd = -1;

  if (!input.identityConfirmed) errors.push("Player A/B identity was not confirmed from the video.");
  if (!input.continuousCoverage) errors.push("The recording does not continuously cover the match.");
  if (input.integrityFlags.length > 0) {
    errors.push(`Video integrity concern: ${input.integrityFlags.join("; ")}`);
  }
  if (input.rallies.length === 0) errors.push("No rallies were identified.");
  if (input.rallies.length > contract.maximumRallies) {
    errors.push(`Observed ${input.rallies.length} rallies, above the contract maximum of ${contract.maximumRallies}.`);
  }
  if (!finiteNumber(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    errors.push("Overall model confidence is invalid.");
  }

  for (let i = 0; i < input.rallies.length; i += 1) {
    const rally = input.rallies[i];
    const expectedIndex = i + 1;
    if (rally.index !== expectedIndex) {
      errors.push(`Rally index ${rally.index} is out of sequence; expected ${expectedIndex}.`);
    }
    if (!finiteNumber(rally.startSec) || !finiteNumber(rally.endSec) || rally.startSec < 0 || rally.endSec <= rally.startSec) {
      errors.push(`Rally ${expectedIndex} has invalid timestamps.`);
    } else {
      if (rally.startSec < previousEnd - 0.25) {
        errors.push(`Rally ${expectedIndex} overlaps the previous rally.`);
      }
      if (input.durationSec != null && rally.endSec > input.durationSec + 0.5) {
        errors.push(`Rally ${expectedIndex} ends after the video duration.`);
      }
      previousEnd = rally.endSec;
    }
    if (rally.winner !== "A" && rally.winner !== "B") {
      errors.push(`Rally ${expectedIndex} does not have a clear point winner.`);
      continue;
    }
    if (!finiteNumber(rally.confidence) || rally.confidence < 0.75 || rally.confidence > 1) {
      errors.push(`Rally ${expectedIndex} confidence is below the 0.75 automatic threshold.`);
    }

    if (rally.winner === "A") scoreA += 1;
    else scoreB += 1;
    if (rally.scoreAfter?.A !== scoreA || rally.scoreAfter?.B !== scoreB) {
      errors.push(
        `Rally ${expectedIndex} score ${rally.scoreAfter?.A ?? "?"}-${rally.scoreAfter?.B ?? "?"} does not match the point ledger ${scoreA}-${scoreB}.`,
      );
    }

    if (contract.mode === "first_to" && i < input.rallies.length - 1 && (scoreA >= contract.target || scoreB >= contract.target)) {
      errors.push(`The match continued after a player had already reached ${contract.target} points.`);
    }
  }

  let winner: "A" | "B" | null = null;
  if (contract.mode === "exact_rallies") {
    if (input.rallies.length !== contract.target) {
      errors.push(`Expected exactly ${contract.target} rallies, observed ${input.rallies.length}.`);
    }
    if (scoreA === scoreB) errors.push(`The fixed ${contract.target}-rally match ended tied ${scoreA}-${scoreB}.`);
    else winner = scoreA > scoreB ? "A" : "B";
  } else {
    if (scoreA !== contract.target && scoreB !== contract.target) {
      errors.push(`Neither player reached the first-to-${contract.target} target.`);
    } else if (scoreA === contract.target && scoreB === contract.target) {
      errors.push("Both players cannot reach the target on the same rally.");
    } else {
      winner = scoreA === contract.target ? "A" : "B";
    }
  }

  const rallyConfidence = input.rallies.length > 0
    ? Math.min(...input.rallies.map((rally) => finiteNumber(rally.confidence) ? rally.confidence : 0))
    : 0;
  const confidence = errors.length === 0
    ? Math.max(0, Math.min(0.94, input.confidence, rallyConfidence))
    : Math.min(0.49, finiteNumber(input.confidence) ? input.confidence : 0.25);

  return {
    valid: errors.length === 0,
    winner: errors.length === 0 ? winner : null,
    finalScore: { A: scoreA, B: scoreB },
    confidence,
    errors,
  };
}
