import assert from "node:assert/strict";
import {
  extractWeatherOracleSpec,
  judgeWeatherOracle,
  weatherProtocolFromPrompt,
} from "../src/lib/weather-oracle";

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
