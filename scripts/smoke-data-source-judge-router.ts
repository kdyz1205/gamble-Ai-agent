import { judgeChallenge, type JudgmentResult } from "../src/lib/ai-engine";
import { canAutoSettleWithDataSource, resolveDataSourceForPrompt } from "../src/lib/data-source-registry";
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
assert(canAutoSettleWithDataSource("npm_registry_package"), "canAutoSettleWithDataSource should allow live-fetch router sources");
const resolvedSourceKey = match.source.sourceKey;
const gateAllowed = match.autoSettlementGate.allowed;

async function main() {
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
    model: "gpt-4o-mini",
    protocol,
  });
  assert(verdict.source === "oracle", "Judge should enter the data-source oracle path before no-evidence fallback");
  assert(verdict.dataSourceTrace?.sourceKey === "npm_registry_package", "Verdict should expose the selected data-source trace");
  assert(verdict.recommendation === "needs_review", "Future-deadline oracle smoke should not settle early");
  assert(verdict.blockingIssues?.some((issue) => /not ready/i.test(issue)), "Future-deadline oracle should explain not-due status");

  console.log(JSON.stringify({
    ok: true,
    sourceKey: resolvedSourceKey,
    gateAllowed,
    dryRunUrl: dryRun.url,
    verdictSource: verdict.source,
    verdictRecommendation: verdict.recommendation,
    traceStatus: verdict.dataSourceTrace.status,
  }, null, 2));
}

void main();
