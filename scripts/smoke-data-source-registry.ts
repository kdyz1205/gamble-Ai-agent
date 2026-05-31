import assert from "node:assert/strict";
import { LIVE_FETCH_DATA_SOURCE_KEYS } from "../src/lib/data-source-adapter-keys";
import {
  executeDataSourceAdapter,
  type DataSourceAdapterResult,
} from "../src/lib/data-source-adapters";
import {
  DATA_SOURCE_TOPICS,
  type DataSourceTopic,
} from "../src/lib/data-source-catalog";
import {
  applyDataSourceGateToProtocol,
  canAutoSettleWithDataSource,
  canRunProtocolGatedDataSource,
  getDataSourceAdapter,
  implementedDataSourceAdapters,
  listDataSourceAdapters,
  resolveDataSourceForPrompt,
  summarizeDataSourceCoverage,
} from "../src/lib/data-source-registry";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function assertCatalogShape(topics: DataSourceTopic[]) {
  assert.equal(topics.length, 100, "catalog must keep 100 external data-source topics");
  assert.equal(new Set(topics.map((topic) => topic.dataSource.sourceKey)).size, 100, "source keys must be unique");
  for (const topic of topics) {
    const source = getDataSourceAdapter(topic.dataSource.sourceKey);
    assert.ok(source, `missing registry source for ${topic.dataSource.sourceKey}`);
    assert.equal(source.provider, topic.dataSource.provider);
    assert.equal(source.endpoint, topic.dataSource.endpoint);
    assert.deepEqual(source.requiredFields, topic.dataSource.requiredFields);
    assert.equal(
      canAutoSettleWithDataSource(topic.dataSource.sourceKey),
      topic.dataSource.adapterStatus === "implemented" && topic.resolutionMethod === "public_api_oracle",
      `proven auto-settle gate mismatch for ${topic.dataSource.sourceKey}`,
    );
    assert.equal(
      canRunProtocolGatedDataSource(topic.dataSource.sourceKey),
      (topic.dataSource.adapterStatus === "implemented" && topic.resolutionMethod === "public_api_oracle") ||
        LIVE_FETCH_DATA_SOURCE_KEYS.includes(topic.dataSource.sourceKey as typeof LIVE_FETCH_DATA_SOURCE_KEYS[number]),
      `protocol-gated oracle gate mismatch for ${topic.dataSource.sourceKey}`,
    );
  }
}

function example(prompt: string, expectedSourceKey: string, expectedProtocolGate: boolean) {
  const match = resolveDataSourceForPrompt(prompt);
  assert.ok(match, `expected data-source match for ${prompt}`);
  assert.equal(match.source.sourceKey, expectedSourceKey);
  assert.equal(match.autoSettlementGate.allowed, expectedProtocolGate, prompt);
  return {
    prompt,
    sourceKey: match.source.sourceKey,
    provider: match.source.provider,
    adapterStatus: match.source.adapterStatus,
    autoSettleProven: canAutoSettleWithDataSource(match.source.sourceKey),
    protocolGateAllowed: match.autoSettlementGate.allowed,
    reason: match.autoSettlementGate.reason,
  };
}

function makeOracleProtocol(rawPrompt: string): ProtocolSpecV2 {
  return {
    version: "2.0",
    title: rawPrompt,
    userFacingSummary: rawPrompt,
    rawPrompt,
    language: "en",
    participantMode: "head_to_head",
    outcomeType: "prediction",
    evidenceProtocol: {
      mode: "public_oracle",
      requiredEvidence: ["Resolve from external source."],
      captureInstructions: ["Lock source fields before publish."],
      invalidEvidenceRules: ["Screenshots do not override the source."],
      requiredMetadata: ["source"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent", expectedPosition: "any", requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode: "none",
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "After acceptance.",
      endCondition: "At settlement time.",
      deadline: "2026-05-24T23:59:00.000Z",
      allowedAttempts: "One prediction.",
    },
    settlementProtocol: {
      mode: "auto_oracle",
      winCondition: rawPrompt,
      judgeInstructions: ["Resolve from the external source."],
      autoSettleConfidenceThreshold: 0.99,
      manualReviewTriggers: [],
    },
    riskPolicy: {
      riskLevel: "medium",
      allowed: true,
      warnings: [],
      restrictions: [],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 0,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
    },
  };
}

function assertProtocolGate() {
  const secProtocol = applyDataSourceGateToProtocol(makeOracleProtocol("Will Tesla file an 8-K before the market opens tomorrow?"));
  assert.equal(secProtocol.settlementProtocol.mode, "auto_oracle");
  assert.match(secProtocol.settlementProtocol.judgeInstructions.join("\n"), /DATA_SOURCE_KEY: sec_edgar_submissions/);
  assert.doesNotMatch(secProtocol.settlementProtocol.manualReviewTriggers.join("\n"), /raw fetch adapter is connected/);

  const btcProtocol = applyDataSourceGateToProtocol(makeOracleProtocol("Will BTC go above $100,000 tomorrow?"));
  assert.equal(btcProtocol.settlementProtocol.mode, "auto_oracle");
  assert.match(btcProtocol.settlementProtocol.judgeInstructions.join("\n"), /DATA_SOURCE_KEY: crypto_price_coingecko/);
}

async function assertEverySourceHasRunner() {
  const results = await Promise.all(
    listDataSourceAdapters().map((source) => executeDataSourceAdapter({ sourceKey: source.sourceKey, dryRun: true })),
  );
  assert.equal(results.length, 102);
  assert.equal(results.filter((result) => result.status === "not_registered").length, 0);
  assert.equal(results.filter((result) => result.handled).length, 102);
  for (const sourceKey of LIVE_FETCH_DATA_SOURCE_KEYS) {
    const result = results.find((item) => item.sourceKey === sourceKey);
    assert.ok(result, `missing adapter result for ${sourceKey}`);
    assert.ok(
      result.status === "dry_run" || result.status === "requires_params",
      `expected ${sourceKey} to be a live adapter or require params; got ${result.status}`,
    );
  }
  return {
    totalRunnerHandled: results.filter((result) => result.handled).length,
    liveFetchAdapters: LIVE_FETCH_DATA_SOURCE_KEYS.length,
    runnerStatus: results.reduce<Record<string, number>>((acc, result) => {
      acc[result.status] = (acc[result.status] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

async function liveProbe(sourceKey: string, params: Record<string, unknown>) {
  const result = await executeDataSourceAdapter({ sourceKey, params, timeoutMs: 12_000 });
  assert.equal(result.handled, true);
  assert.equal(result.ok, true, `${sourceKey} live probe failed: ${result.error}`);
  return summarizeProbe(result);
}

function summarizeProbe(result: DataSourceAdapterResult) {
  return {
    sourceKey: result.sourceKey,
    status: result.status,
    httpStatus: result.httpStatus,
    url: result.url,
    dataShape: Array.isArray(result.data)
      ? `array(${result.data.length})`
      : result.data && typeof result.data === "object"
        ? `object(${Object.keys(result.data as Record<string, unknown>).slice(0, 8).join(",")})`
        : typeof result.data,
  };
}

async function runLiveProbes() {
  return Promise.all([
    liveProbe("npm_registry_package", { package: "zod" }),
    liveProbe("pypi_json", { package: "pandas" }),
    liveProbe("cloudflare_dns_over_https", { domain: "example.com", record_type: "TXT" }),
    liveProbe("github_releases", { owner: "vercel", repo: "next.js" }),
    liveProbe("sec_edgar_submissions", { cik: "0001318605" }),
  ]);
}

async function main() {
  assertCatalogShape(DATA_SOURCE_TOPICS);
  assertProtocolGate();
  const runner = await assertEverySourceHasRunner();
  const examples = [
    example("Will BTC go above $100,000 tomorrow?", "crypto_price_coingecko", true),
    example("Will it rain in Seattle tomorrow?", "weather_open_meteo", true),
    example("Will Tesla file an 8-K before the market opens tomorrow?", "sec_edgar_submissions", true),
    example("Will the FDA announce a Class I food recall involving peanut butter this month?", "openfda_food_enforcement", true),
    example("Will repository vercel/next.js publish a GitHub release before Friday?", "github_releases", true),
    example("Will next publish version of npm package zod be at least 4.2.0 by Friday?", "npm_registry_package", true),
    example("Will pandas publish a new PyPI release before next Monday?", "pypi_json", true),
    example("Will Docker Hub publish a python image tag named 3.13-alpine this week?", "dockerhub_tags", true),
    example("Will invoice in_123 be marked paid before 5 PM?", "stripe_invoice", false),
    example("Will domain example.com publish a TXT record containing verify-stubborn by midnight?", "cloudflare_dns_over_https", true),
  ];

  console.log(JSON.stringify({
    totalCatalogTopics: DATA_SOURCE_TOPICS.length,
    totalRuntimeSources: listDataSourceAdapters().length,
    implementedSources: implementedDataSourceAdapters().map((source) => source.sourceKey),
    coverage: summarizeDataSourceCoverage(),
    runner,
    liveProbes: process.argv.includes("--live") ? await runLiveProbes() : "skipped; pass --live to call external providers",
    examples,
  }, null, 2));
}

main();
