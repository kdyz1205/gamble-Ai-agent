import { completeOracleJudgeVision } from "./llm-router";
import {
  capJudgeVisuals,
  type JudgeVisionImage,
} from "./media/prepare-evidence-visuals";
import {
  prepareRallyDetailVisuals,
  prepareScoredMatchTimeline,
  type RallyWindowCandidate,
} from "./media/scored-match-visuals";
import {
  deriveRallyLedger,
  validateRallyLedger,
  type RallyPointObservation,
  type ScoredMatchContract,
} from "./scored-match";

interface ScoredMatchEvidence {
  description: string | null;
  type: string;
  url?: string | null;
}

export interface ShortScoredMatchJudgeParams {
  title: string;
  rules?: string | null;
  evidenceA: ScoredMatchEvidence;
  evidenceB: ScoredMatchEvidence;
  participantAId: string;
  participantBId: string;
  providerId: string;
  model: string;
}

interface DiscoveryResult {
  primarySource: "A" | "B";
  identityConfirmed: boolean;
  participantAVisualId: string;
  participantBVisualId: string;
  continuousCoverage: boolean;
  integrityFlags: string[];
  candidateRallies: RallyWindowCandidate[];
  confidence: number;
  analysis: string;
}

interface DetailResult {
  identityConfirmed: boolean;
  continuousCoverage: boolean;
  integrityFlags: string[];
  rallies: RallyPointObservation[];
  confidence: number;
  analysis: string;
}

function parseJsonObject<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function videoUrl(evidence: ScoredMatchEvidence): string | null {
  if (evidence.type.toLowerCase() !== "video") return null;
  const url = evidence.url?.trim();
  return url || null;
}

function fail(reason: string, confidence = 0.25) {
  return {
    winnerId: null,
    reasoning: `Automatic rally scoring stopped: ${reason} The quest requires participant confirmation or human review; no winner was guessed from incomplete evidence.`,
    confidence,
  };
}

function contractText(contract: ScoredMatchContract): string {
  return contract.mode === "first_to"
    ? `first player to ${contract.target} points (at most ${contract.maximumRallies} rallies)`
    : `exactly ${contract.target} rallies; higher final score wins`;
}

function discoveryShapeIsUsable(
  discovery: DiscoveryResult | null,
  contract: ScoredMatchContract,
  availableSources: Set<"A" | "B">,
): discovery is DiscoveryResult {
  if (!discovery || !availableSources.has(discovery.primarySource)) return false;
  if (!Array.isArray(discovery.candidateRallies) || !Array.isArray(discovery.integrityFlags)) return false;
  if (typeof discovery.identityConfirmed !== "boolean" || typeof discovery.continuousCoverage !== "boolean") return false;
  if (!Number.isFinite(discovery.confidence)) return false;
  if (discovery.candidateRallies.length < 1 || discovery.candidateRallies.length > contract.maximumRallies) return false;
  if (contract.mode === "exact_rallies" && discovery.candidateRallies.length !== contract.target) return false;
  if (contract.mode === "first_to" && discovery.candidateRallies.length < contract.target) return false;
  return discovery.candidateRallies.every((candidate, index) =>
    candidate.index === index + 1 &&
    Number.isFinite(candidate.endSec) &&
    candidate.endSec >= 0,
  );
}

function detailShapeIsUsable(detail: DetailResult | null): detail is DetailResult {
  return Boolean(
    detail &&
    typeof detail.identityConfirmed === "boolean" &&
    typeof detail.continuousCoverage === "boolean" &&
    Array.isArray(detail.integrityFlags) &&
    Array.isArray(detail.rallies) &&
    Number.isFinite(detail.confidence),
  );
}

async function callVisionJson<T>(params: {
  providerId: string;
  model: string;
  system: string;
  userText: string;
  images: JudgeVisionImage[];
  maxTokens: number;
}): Promise<T | null> {
  const raw = await completeOracleJudgeVision({
    ...params,
    temperature: 0,
  });
  return parseJsonObject<T>(raw);
}

/**
 * Two-pass referee for short scored sports:
 *  1. ordered 2fps overview finds rally windows and player identities;
 *  2. 8fps windows around every rally ending produce a point-by-point ledger;
 *  3. validateRallyLedger deterministically computes (or refuses) the winner.
 */
export async function judgeShortScoredMatch(
  params: ShortScoredMatchJudgeParams,
  contract: ScoredMatchContract,
) {
  const urlA = videoUrl(params.evidenceA);
  const urlB = videoUrl(params.evidenceB);
  if (!urlA && !urlB) return fail("at least one shared, direct video must continuously cover the scored sports match.");

  const sources: Array<{ id: "A" | "B"; url: string; description: string }> = [];
  if (urlA) sources.push({ id: "A", url: urlA, description: params.evidenceA.description ?? "(none)" });
  if (urlB && urlB !== urlA) sources.push({ id: "B", url: urlB, description: params.evidenceB.description ?? "(none)" });
  const availableSources = new Set(sources.map((source) => source.id));

  const timelineResults = await Promise.allSettled(
    sources.map(async (source) => ({
      source,
      timeline: await prepareScoredMatchTimeline(`SOURCE-${source.id}`, source.url),
    })),
  );
  const usableTimelines = timelineResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  if (usableTimelines.length === 0) {
    const firstError = timelineResults.find((result) => result.status === "rejected");
    const message = firstError?.status === "rejected" && firstError.reason instanceof Error
      ? firstError.reason.message
      : "timeline extraction failed";
    return fail(message);
  }

  const timelineA = usableTimelines.find((entry) => entry.source.id === "A")?.timeline.visuals ?? [];
  const timelineB = usableTimelines.find((entry) => entry.source.id === "B")?.timeline.visuals ?? [];
  const overviewImages = capJudgeVisuals(timelineA, timelineB, 24, 12 * 1024 * 1024);
  const timelineNotes = usableTimelines.map(({ source, timeline }) =>
    `SOURCE-${source.id}: ${timeline.durationSec.toFixed(2)}s, ${timeline.frameCount} ordered frames at ${timeline.framesPerSecond.toFixed(2)}fps. Description: ${source.description}`,
  ).join("\n");

  const discovery = await callVisionJson<DiscoveryResult>({
    providerId: params.providerId,
    model: params.model,
    maxTokens: 1400,
    images: overviewImages,
    system: `You are phase 1 of a high-stakes short sports-match referee. The attached images are chronological 3x3 contact sheets. Every tile has SOURCE-A or SOURCE-B and an exact MM:SS.ss timestamp burned into the pixels.

Do not decide the match winner. Locate every completed rally, choose the single source that continuously covers the whole match, and map the two platform participants to visible players using the written rules/descriptions and visible clothing/court-side cues. A generic guess such as "left player is A" is not identity confirmation unless the evidence explicitly establishes it.

Set continuousCoverage=false for a missing beginning/end, unexplained jump, camera obstruction, or any rally whose ending is outside the video. Put suspected cuts, duplicated footage, missing action, unreadable players, or inconsistent sources in integrityFlags. Candidate rally endSec values must refer to primarySource timestamps.

Return JSON only:
{
  "primarySource":"A"|"B",
  "identityConfirmed":boolean,
  "participantAVisualId":"clothing/court-side identity or unknown",
  "participantBVisualId":"clothing/court-side identity or unknown",
  "continuousCoverage":boolean,
  "integrityFlags":["specific concern"],
  "candidateRallies":[{"index":1,"startSec":0.0,"endSec":4.5}],
  "confidence":0.0,
  "analysis":"brief evidence-based explanation"
}`,
    userText: `Quest: ${params.title}
Rules: ${params.rules || "(none)"}
Compiled scoring contract: ${contractText(contract)}
Participant A evidence description: ${params.evidenceA.description || "(none)"}
Participant B evidence description: ${params.evidenceB.description || "(none)"}

Timeline inventory:
${timelineNotes}

Find all rally windows in chronological order. Do not infer identity or continuity when it is not visibly supported.`,
  });

  if (!discoveryShapeIsUsable(discovery, contract, availableSources)) {
    return fail("the overview pass could not produce a complete, ordered set of rally windows.");
  }
  if (!discovery.identityConfirmed) return fail("the recording does not establish which visible player is Participant A and which is Participant B.", Math.min(0.49, discovery.confidence));
  if (!discovery.continuousCoverage) return fail("the full match is not continuously visible.", Math.min(0.49, discovery.confidence));
  if (discovery.integrityFlags.length > 0) return fail(`video integrity concerns were detected: ${discovery.integrityFlags.join("; ")}`, Math.min(0.49, discovery.confidence));

  const primary = sources.find((source) => source.id === discovery.primarySource);
  const primaryTimeline = usableTimelines.find((entry) => entry.source.id === discovery.primarySource)?.timeline;
  if (!primary || !primaryTimeline) return fail("the selected primary video was not available after extraction.");

  let detailImages: JudgeVisionImage[];
  let detailFramesPerSecond: number;
  try {
    const preparedDetails = await prepareRallyDetailVisuals(
      `SOURCE-${primary.id}`,
      primary.url,
      discovery.candidateRallies,
    );
    detailImages = preparedDetails.visuals;
    detailFramesPerSecond = preparedDetails.framesPerSecond;
  } catch (error) {
    return fail(error instanceof Error ? error.message : "dense rally extraction failed");
  }

  const detail = await callVisionJson<DetailResult>({
    providerId: params.providerId,
    model: params.model,
    maxTokens: 2200,
    images: detailImages,
    system: `You are phase 2 of a high-stakes short sports-match referee. The attached 3x3 contact sheets contain dense ${detailFramesPerSecond.toFixed(2)}fps windows around each candidate rally ending. Each tile is burned with source, rally number, and exact timestamp.

Produce observations, not a final winner or score. Award a rally only when its ending is visible enough to identify who won the point under the sport's rules. Do not use pose, celebration, or court side alone as proof. Use a visible shuttle/ball landing, net/out fault, failed return, or another concrete endpoint. A visible scoreboard is optional corroboration, never a requirement. If unclear, winner must be null and confidence below 0.75.

The application starts at 0-0 and deterministically derives scoreAfter from your ordered point winners. Do not calculate or return a score. Preserve the phase-1 identity and integrity result unless these denser frames reveal a contradiction.

Return JSON only:
{
  "identityConfirmed":boolean,
  "continuousCoverage":boolean,
  "integrityFlags":["specific concern"],
  "rallies":[{
    "index":1,
    "startSec":0.0,
    "endSec":4.5,
    "winner":"A"|"B"|null,
    "confidence":0.0,
    "evidence":"what is visible and at which timestamp"
  }],
  "confidence":0.0,
  "analysis":"brief evidence-based explanation"
}`,
    userText: `Quest: ${params.title}
Rules: ${params.rules || "(none)"}
Scoring contract: ${contractText(contract)}
Identity mapping from overview: Participant A = ${discovery.participantAVisualId}; Participant B = ${discovery.participantBVisualId}.
Primary source: SOURCE-${discovery.primarySource}; duration ${primaryTimeline.durationSec.toFixed(2)}s.
Candidate windows: ${JSON.stringify(discovery.candidateRallies)}

Resolve every rally from concrete visual evidence. Return null for any point that is not actually visible.`,
  });

  if (!detailShapeIsUsable(detail)) return fail("the dense pass did not return a valid rally ledger.");
  const derivedRallies = deriveRallyLedger(detail.rallies);
  const validation = validateRallyLedger(contract, {
    rallies: derivedRallies,
    identityConfirmed: discovery.identityConfirmed && detail.identityConfirmed,
    continuousCoverage: discovery.continuousCoverage && detail.continuousCoverage,
    integrityFlags: [...discovery.integrityFlags, ...detail.integrityFlags],
    confidence: Math.min(discovery.confidence, detail.confidence),
    durationSec: primaryTimeline.durationSec,
  });

  const ledgerText = derivedRallies.map((rally) =>
    `R${rally.index} ${rally.startSec.toFixed(2)}-${rally.endSec.toFixed(2)}s: ${rally.winner ?? "unclear"} -> ${rally.scoreAfter?.A ?? "?"}-${rally.scoreAfter?.B ?? "?"} (${Math.round((rally.confidence || 0) * 100)}%)${rally.evidence ? `, ${rally.evidence}` : ""}`,
  ).join("\n");

  if (!validation.valid || !validation.winner) {
    return fail(
      `${validation.errors.join(" ")}\nObserved ledger:\n${ledgerText}`,
      validation.confidence,
    );
  }

  const winnerId = validation.winner === "A" ? params.participantAId : params.participantBId;
  return {
    winnerId,
    confidence: validation.confidence,
    reasoning: `The ordered rally ledger validates to ${validation.finalScore.A}-${validation.finalScore.B}; Participant ${validation.winner} wins under the ${contractText(contract)} rule.\n\nRally ledger:\n${ledgerText}\n\nThe Familiar recommendation still requires participant confirmation before settlement.`,
  };
}
