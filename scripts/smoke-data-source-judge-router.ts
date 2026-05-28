import { judgeChallenge, type JudgmentResult } from "../src/lib/ai-engine";
import { parseChallengeDeadline } from "../src/lib/challenge-time";
import { canRunProtocolGatedDataSource, resolveDataSourceForPrompt } from "../src/lib/data-source-registry";
import { executeDataSourceAdapter } from "../src/lib/data-source-adapters";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const protocol: ProtocolSpecV2 = {
  version: "2.0",
  title: "NPM release oracle check",
  userFacingSummary: "Bet whether the npm package react has public registry data.",
  rawPrompt: "I bet the npm package react exists on npm.",
  language: "en",
  participantMode: "head_to_head",
  outcomeType: "yes_no",
  evidenceProtocol: {
    mode: "public_oracle",
    requiredEvidence: ["NPM registry API response"],
    captureInstructions: ["No user upload is required; the router fetches the public registry."],
    invalidEvidenceRules: ["Screenshots and self reports do not override the router response."],
    requiredMetadata: ["DATA_SOURCE_KEY", "DATA_SOURCE_PARAMS"],
  },
  identityProtocol: {
    mode: "account_only",
    required: false,
    participantBindings: [
      { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
      { role: "opponent", label: "Opponent", expectedPosition: "any", requiredQrOrCode: false },
    ],
    autoSettlementRequiresIdentityConfidence: 0.85,
  },
  locationProtocol: {
    mode: "none",
    joinRadiusMeters: 0,
    challengeRadiusMeters: 0,
    requiresLiveLocation: false,
    requiresCoPresence: false,
    locationPrivacy: "hidden",
  },
  timingProtocol: {
    startCondition: "After opponent accepts.",
    endCondition: "At the locked settlement time.",
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    tieBreaker: "If the router cannot fetch data, manual review is required.",
    allowedAttempts: "One locked oracle check.",
  },
  settlementProtocol: {
    mode: "auto_oracle",
    winCondition: "Creator wins if the NPM registry returns package metadata for react.",
    judgeInstructions: [
      "DATA_SOURCE_KEY: npm_registry_package",
      'DATA_SOURCE_PARAMS: {"package":"react"}',
    ],
    autoSettleConfidenceThreshold: 0.85,
    manualReviewTriggers: ["Router fetch fails.", "AI cannot map returned data to the win condition."],
  },
  riskPolicy: {
    riskLevel: "safe",
    allowed: true,
    warnings: [],
    restrictions: ["Internal credits only."],
  },
  aiBudgetPolicy: {
    compileMaxTokens: 800,
    judgeMaxTokens: 1200,
    maxVisionFrames: 0,
    allowEscalation: false,
    estimatedCostTier: "low",
  },
};

const prompt = [
  protocol.rawPrompt,
  ...protocol.settlementProtocol.judgeInstructions,
].join("\n");
const match = resolveDataSourceForPrompt(prompt);
assert(match, "Registry should resolve npm_registry_package");
assert(match.source.sourceKey === "npm_registry_package", "Registry should resolve npm_registry_package");
assert(match.autoSettlementGate.allowed, "Live-fetch data source should be eligible for protocol-gated auto settlement");
assert(canRunProtocolGatedDataSource("npm_registry_package"), "canRunProtocolGatedDataSource should allow live-fetch router sources");
const resolvedSourceKey = match.source.sourceKey;
const protocolGateAllowed = match.autoSettlementGate.allowed;

async function main() {
  const now = new Date("2026-05-25T07:00:00.000Z");
  const pastSettlement = "2026-05-25T06:58:00.000Z";
  assert(
    parseChallengeDeadline(pastSettlement, { now, allowPast: true })?.toISOString() === pastSettlement,
    "Oracle create path must be able to preserve already-due absolute settlement timestamps",
  );
  assert(
    parseChallengeDeadline(pastSettlement, { now })?.toISOString() !== pastSettlement,
    "Normal challenge deadlines should still avoid creating already-expired deadlines",
  );

  const dryRun = await executeDataSourceAdapter({
    sourceKey: "npm_registry_package",
    params: { package: "react" },
    dryRun: true,
  });
  assert(dryRun.ok, `Dry-run adapter should build a fetch URL, got ${dryRun.status}: ${dryRun.error ?? ""}`);
  assert(dryRun.url?.includes("registry.npmjs.org/react"), "Dry-run URL should target the npm registry package endpoint");

  const verdict: JudgmentResult = await judgeChallenge({
    title: protocol.title,
    description: protocol.userFacingSummary,
    type: "oracle",
    rules: protocol.settlementProtocol.judgeInstructions.join("\n"),
    deadlineIso: protocol.timingProtocol.deadline,
    evidencePolicy: "public_oracle",
    evidenceA: null,
    evidenceB: null,
    participantAId: "creator_user",
    participantBId: "opponent_user",
    providerId: "openai",
    model: "gpt-5-mini",
    protocol,
  });
  assert(verdict.source === "oracle", "Judge should enter the data-source oracle path before no-evidence fallback");
  assert(verdict.dataSourceTrace?.sourceKey === "npm_registry_package", "Verdict should expose the selected data-source trace");
  assert(verdict.recommendation === "needs_review", "Future-deadline oracle smoke should not settle early");
  assert(verdict.blockingIssues?.some((issue) => /not ready/i.test(issue)), "Future-deadline oracle should explain not-due status");

  const platformMetricProtocol: ProtocolSpecV2 = {
    ...protocol,
    title: "Study streak platform metric",
    userFacingSummary: "A normal app-metric challenge using proof tokens, not a crypto oracle.",
    rawPrompt: "Make a study streak challenge with a proof token.",
    outcomeType: "completion",
    evidenceProtocol: {
      mode: "platform_metric",
      requiredEvidence: ["Structured proof token"],
      captureInstructions: ["Submit ANSWER metadata."],
      invalidEvidenceRules: ["Missing answer is invalid."],
      requiredMetadata: ["answer"],
    },
    settlementProtocol: {
      mode: "auto_ai_text",
      winCondition: "EXPECTED_ANSWER: STUDY-TOKEN-123. The participant with the expected proof token wins.",
      judgeInstructions: [
        "Read proof token from submitted evidence.",
        "Correct proof token: STUDY-TOKEN-123",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Both or neither participants match the token."],
    },
  };
  const platformMetricVerdict: JudgmentResult = await judgeChallenge({
    title: platformMetricProtocol.title,
    description: platformMetricProtocol.userFacingSummary,
    type: "platform_metric",
    rules: platformMetricProtocol.settlementProtocol.winCondition,
    deadlineIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    evidencePolicy: "platform_metric",
    evidenceA: { type: "text", description: "ANSWER: STUDY-TOKEN-123", metadata: { answer: "STUDY-TOKEN-123" } },
    evidenceB: { type: "text", description: "ANSWER: WRONG-TOKEN", metadata: { answer: "WRONG-TOKEN" } },
    participantAId: "creator_user",
    participantBId: "opponent_user",
    providerId: "openai",
    model: "gpt-5-mini",
    protocol: platformMetricProtocol,
  });
  assert(platformMetricVerdict.source === "deterministic", "Platform metric proof tokens must not be hijacked by crypto/data-source routing");
  assert(platformMetricVerdict.winnerId === "creator_user", "Platform metric objective answer should keep its deterministic winner");
  assert(platformMetricVerdict.recommendation === "settle_winner", "Platform metric objective answer should remain settlement-grade");

  console.log(JSON.stringify({
    ok: true,
    sourceKey: resolvedSourceKey,
    protocolGateAllowed,
    dryRunUrl: dryRun.url,
    verdictSource: verdict.source,
    verdictRecommendation: verdict.recommendation,
    traceStatus: verdict.dataSourceTrace.status,
    platformMetricSource: platformMetricVerdict.source,
    platformMetricRecommendation: platformMetricVerdict.recommendation,
  }, null, 2));
}

void main();
