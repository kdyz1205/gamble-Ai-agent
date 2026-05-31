import assert from "node:assert/strict";
import {
  extractWeatherOracleSpec,
  judgeWeatherOracle,
  normalizeWeatherOracleProtocol,
  weatherProtocolFromPrompt,
} from "../src/lib/weather-oracle";
import type { ProtocolSpecV2 } from "../src/lib/protocol-spec-v2";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const compileNow = new Date("2026-05-23T12:00:00.000Z");
  const protocol = await weatherProtocolFromPrompt("Will it rain in Seattle tomorrow?", "en", compileNow);
  assert.ok(protocol, "weather prompt should compile to an Open-Meteo oracle protocol");
  assert.equal(protocol.evidenceProtocol.mode, "public_oracle");
  assert.equal(protocol.settlementProtocol.mode, "auto_oracle");
  assert.ok(
    protocol.settlementProtocol.judgeInstructions.some((line) => line.startsWith("ORACLE_WEATHER_LATITUDE:")),
    "compiled protocol must lock latitude",
  );
  assert.ok(
    protocol.settlementProtocol.judgeInstructions.some((line) => line.startsWith("ORACLE_WEATHER_LONGITUDE:")),
    "compiled protocol must lock longitude",
  );
  assert.ok(
    protocol.settlementProtocol.judgeInstructions.some((line) => line === "ORACLE_WEATHER_METRIC: precipitation_sum_mm"),
    "compiled protocol must lock precipitation metric",
  );

  const extracted = extractWeatherOracleSpec({ protocol });
  assert.ok(extracted, "stored protocol should extract back into a weather oracle spec");
  assert.equal(extracted.source, "Open-Meteo");
  assert.equal(extracted.metric, "precipitation_sum_mm");
  assert.equal(extracted.condition, "above");

  const chineseProtocol = await weatherProtocolFromPrompt("明天 San Jose 温度不超过 30 度", "zh", compileNow);
  assert.ok(chineseProtocol, "Chinese mixed weather prompt should compile to Open-Meteo oracle protocol");
  const chineseExtracted = extractWeatherOracleSpec({ protocol: chineseProtocol });
  assert.ok(chineseExtracted, "Chinese weather protocol should extract locked oracle fields");
  assert.equal(chineseExtracted.locationName.includes("San Jose"), true);
  assert.equal(chineseExtracted.metric, "temperature_2m_max_c");
  assert.equal(chineseExtracted.condition, "below");
  assert.ok(
    chineseExtracted.targetValue > 30 && chineseExtracted.targetValue < 30.001,
    "not exceed 30C should be represented as an inclusive <= 30 threshold",
  );

  const genericWeatherEvent: ProtocolSpecV2 = {
    version: "2.0",
    title: "San Jose明天温度不超过30度",
    userFacingSummary: "预测明天 San Jose 的最高温度是否不超过30摄氏度。",
    rawPrompt: "明天 San Jose 温度不超过 30 度",
    language: "zh",
    participantMode: "public_market",
    outcomeType: "yes_no",
    evidenceProtocol: {
      mode: "public_oracle",
      requiredEvidence: ["Official weather data for San Jose."],
      captureInstructions: ["Resolve from official weather data."],
      invalidEvidenceRules: ["Screenshots do not override the oracle."],
      requiredMetadata: ["created_at"],
    },
    identityProtocol: {
      mode: "account_only",
      required: true,
      participantBindings: [
        { role: "creator", label: "Creator", expectedPosition: "any" },
        { role: "participant", label: "Participant", expectedPosition: "any" },
      ],
      autoSettlementRequiresIdentityConfidence: 0.85,
    },
    locationProtocol: {
      mode: "nearby_discovery",
      joinRadiusMeters: 500,
      challengeRadiusMeters: 500,
      requiresLiveLocation: true,
      requiresCoPresence: false,
      locationPrivacy: "approximate",
    },
    timingProtocol: {
      startCondition: "Published.",
      endCondition: "Weather data is available.",
      deadline: "48 hours",
      allowedAttempts: "One prediction.",
    },
    settlementProtocol: {
      mode: "auto_oracle",
      winCondition: "Temperature in San Jose tomorrow is 30C or below.",
      judgeInstructions: [
        "DATA_SOURCE_KEY: weather_open_meteo",
        "DATA_SOURCE_PROVIDER: Open-Meteo",
      ],
      autoSettleConfidenceThreshold: 0.85,
      manualReviewTriggers: ["Ambiguous weather data."],
    },
    riskPolicy: {
      riskLevel: "safe",
      allowed: true,
      warnings: [],
      restrictions: [],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 1800,
      judgeMaxTokens: 1200,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
    },
  };
  const normalized = await normalizeWeatherOracleProtocol(genericWeatherEvent, compileNow);
  const normalizedSpec = extractWeatherOracleSpec({ protocol: normalized });
  assert.ok(normalizedSpec, "generic event weather protocol should normalize into locked oracle fields");
  assert.ok(
    normalized.settlementProtocol.judgeInstructions.some((line) => line.startsWith("ORACLE_WEATHER_LATITUDE:")),
    "normalized event must lock latitude",
  );

  const judgeSpec = {
    ...extracted,
    date: todayIso(),
    settlementTime: new Date(Date.now() - 60_000),
  };
  const judged = await judgeWeatherOracle({
    spec: judgeSpec,
    participantAId: "creator_yes",
    participantBId: "opponent_no",
    now: new Date(),
  });
  assert.equal(judged.status, "ready");
  assert.equal(judged.result.source, "oracle");
  assert.equal(judged.result.providerCall?.providerId, "open-meteo");
  assert.ok(
    judged.result.recommendation === "settle_winner" || judged.result.recommendation === "needs_review",
    "weather oracle should either settle from a good snapshot or explicitly request review",
  );

  console.log(JSON.stringify({
    protocolTitle: protocol.title,
    lockedDate: extracted.date,
    lockedLocation: extracted.locationName,
    judgeStatus: judged.status,
    recommendation: judged.result.recommendation,
    winnerId: judged.result.winnerId,
    confidence: judged.result.confidence,
    evidenceQuality: judged.result.evidenceQuality,
    providerId: judged.result.providerCall?.providerId,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
