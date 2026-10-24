import { createHash } from 'node:crypto';

/**
 * A deterministic, fail-closed preflight. This describes whether a proposed
 * proof is *reviewable*, not whether someone can physically do the challenge.
 * AI suggestions never grant an automatic win or settle credits.
 */
export const JUDGEABILITY_VERSION = 'judgeability.v1' as const;
export type JudgeabilityStatus = 'reviewable' | 'needs_clarification' | 'manual_only';
export type JudgeabilityCategory =
  | 'fitness_repetitions' | 'timed_hold' | 'short_scored_match'
  | 'digital_artifact' | 'photo' | 'self_report' | 'generic_video';

export interface JudgeabilityInput {
  title: string;
  rules?: string | null;
  description?: string | null;
  evidenceType?: string | null;
  type?: string | null;
}

export interface JudgeabilityAssessment {
  version: typeof JUDGEABILITY_VERSION;
  contractHash: string;
  status: JudgeabilityStatus;
  category: JudgeabilityCategory;
  evidenceType: string;
  recommendedVerifier: 'two_pass_video_review' | 'external_source_required' | 'human_review';
  missingConditions: string[];
  captureInstructions: string[];
  explanation: string;
  requiresHumanConfirmation: true;
  autoSettlementAllowed: false;
}

function textField(value: unknown, name: string, max: number): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) {
    throw new TypeError(name + ' must be a string of at most ' + max + ' characters');
  }
  return value.trim();
}

type NormalizedJudgeabilityInput = {
  title: string;
  rules: string;
  description: string;
  evidenceType: string;
  type: string;
};

export function normalizeJudgeabilityInput(raw: unknown): NormalizedJudgeabilityInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('A challenge object is required');
  }
  const value = raw as Record<string, unknown>;
  const title = textField(value.title, 'title', 240);
  if (!title) throw new TypeError('title is required');
  return {
    title,
    rules: textField(value.rules, 'rules', 4_000),
    description: textField(value.description, 'description', 4_000),
    evidenceType: textField(value.evidenceType, 'evidenceType', 80).toLowerCase() || 'self_report',
    type: textField(value.type, 'type', 80),
  };
}

export function assessJudgeability(raw: unknown): JudgeabilityAssessment {
  const input = normalizeJudgeabilityInput(raw);
  const combined = [input.title, input.rules, input.description].join(' ').toLowerCase();
  const evidence = input.evidenceType;
  const video = evidence === 'video';
  const isReps = /\b(push[\s-]?ups?|sit[\s-]?ups?|squats?|jumping jacks?|burpees?)\b|俯卧撑|深蹲|仰卧起坐|开合跳/u.test(combined);
  const isHold = /\b(plank|wall[\s-]?sit|hold (?:a |the )?position)\b|平板支撑|靠墙静蹲/u.test(combined);
  const isSport = /\b(badminton|tennis|ping[\s-]?pong|table tennis|rall(?:y|ies))\b|羽毛球|乒乓球|网球/u.test(combined);
  const isDigital = /\b(github|gitlab|commit|pull request|leetcode)\b|代码提交|编程仓库/u.test(combined);
  const hasNumber = /(?:\d+(?:\.\d+)?|[一二三四五六七八九十百]+)\s*(?:reps?|times?|push[\s-]?ups?|squats?|秒|分钟|次|个|分|points?|rallies|回合)?/u.test(combined);
  const hasRelative = /\b(more|faster|longer|most|first to|higher|fewer|less than)\b|比谁|谁先|更快|更多|更久/u.test(combined);
  const hasScoringRule = /\b(first to \d+|exactly \d+ rallies|best of \d+)\b|先得\s*\d+\s*分|共\s*\d+\s*回合/u.test(combined);

  let status: JudgeabilityStatus = 'manual_only';
  let category: JudgeabilityCategory = 'generic_video';
  let recommendedVerifier: JudgeabilityAssessment['recommendedVerifier'] = 'human_review';
  let missingConditions: string[] = [];
  let captureInstructions: string[] = [];
  let explanation = 'The evidence does not establish an objective, reproducible outcome. Participant confirmation or human review is required.';

  if (isDigital) {
    category = 'digital_artifact';
    recommendedVerifier = 'external_source_required';
    missingConditions = ['trusted platform authorization and artifact ownership', 'frozen measurable acceptance rule'];
    captureInstructions = ['Provide a repository or platform artifact, not a screenshot alone.'];
    explanation = 'A trusted GitHub/GitLab/other platform receipt is required. Media or user assertions alone cannot prove code execution.';
  } else if (isSport) {
    category = 'short_scored_match';
    captureInstructions = ['Capture the whole match continuously with both players and the scoring action visible.',
      'Establish which visible player maps to each platform participant before play.'];
    if (!video) missingConditions.push('video proof');
    if (!hasScoringRule) missingConditions.push('explicit target score or finite rally count');
    status = missingConditions.length ? 'needs_clarification' : 'reviewable';
    recommendedVerifier = status === 'reviewable' ? 'two_pass_video_review' : 'human_review';
    explanation = 'Two-pass rally observation may recommend a result if player identity and every decisive point are visible. It cannot guarantee correctness.';
  } else if (isReps || isHold) {
    category = isReps ? 'fitness_repetitions' : 'timed_hold';
    captureInstructions = ['Record one uninterrupted clip including the participant and their full motion.',
      'Show a clear start and finish, with no off-camera intervals or edits.',
      'Agree on valid-form criteria before accepting the challenge.'];
    if (!video) missingConditions.push('continuous video proof');
    if (!hasNumber && !hasRelative) missingConditions.push('numeric target or unambiguous head-to-head comparison');
    if (!input.rules) missingConditions.push('written valid-form criteria and time boundary');
    status = missingConditions.length ? 'needs_clarification' : 'reviewable';
    recommendedVerifier = status === 'reviewable' ? 'two_pass_video_review' : 'human_review';
    explanation = 'The video may be reviewed for measurable motion or duration, but identity, continuity and technique need validation; human confirmation is mandatory.';
  } else if (evidence === 'photo') {
    category = 'photo';
    captureInstructions = ['Photograph the relevant result and include identifying context.',
      'Use another independent source for events involving elapsed time or repetitions.'];
    explanation = 'A still photograph cannot by itself prove a completed sequence or duration.';
  } else if (evidence === 'self_report' || evidence === 'text') {
    category = 'self_report';
    captureInstructions = ['Provide a corroborating video or trusted external source if objective judging is required.'];
    explanation = 'Self-reported text is not independently verifiable.';
  } else if (video) {
    category = 'generic_video';
    status = 'needs_clarification';
    missingConditions = ['objective success metric', 'agreed capture protocol', 'explicit failure criteria'];
    captureInstructions = ['Define what exactly must be visible for success and failure before recording.'];
    explanation = 'A video alone cannot define the challenge outcome. Define an objective rubric before automatic review.';
  }

  const canonical = JSON.stringify({
    version: JUDGEABILITY_VERSION, title: input.title, rules: input.rules,
    description: input.description, evidenceType: input.evidenceType, type: input.type,
  });
  const contractHash = createHash('sha256').update(canonical).digest('hex');
  return {
    version: JUDGEABILITY_VERSION, contractHash, status, category, evidenceType: evidence,
    recommendedVerifier, missingConditions, captureInstructions, explanation,
    requiresHumanConfirmation: true, autoSettlementAllowed: false,
  };
}
