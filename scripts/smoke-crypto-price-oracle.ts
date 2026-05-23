import assert from "node:assert/strict";
import {
  cryptoPriceProtocolFromPrompt,
  extractCryptoPriceOracleSpec,
} from "../src/lib/crypto-price-oracle";
import { checkCryptoPrice } from "../src/lib/oracle-tools";

const now = new Date("2026-05-23T12:00:00.000Z");
const prompt = "Today I'm gonna bet BEAT token will reach $2.00.";

async function main() {
  const parsed = extractCryptoPriceOracleSpec({ title: prompt, now });
  assert.ok(parsed, "BEAT token prompt should parse as a crypto price oracle challenge");
  assert.equal(parsed.symbol, "BEAT");
  assert.equal(parsed.condition, "above");
  assert.equal(parsed.targetUsd, 2);
  assert.equal(parsed.source, "CoinGecko");

  const price = await checkCryptoPrice({ symbol: "BEAT" });
  assert.equal(price.ok, true, price.error ?? "BEAT price lookup failed");
  assert.equal(price.source, "CoinGecko");
  assert.equal(price.data?.symbol, "BEAT");
  assert.equal(price.data?.coingeckoId, "audiera");
  assert.equal(typeof price.data?.priceUsd, "number");

  const protocol = await cryptoPriceProtocolFromPrompt(prompt, "en", now);
  assert.ok(protocol, "BEAT prompt should compile to a complete oracle protocol");
  assert.equal(protocol.outcomeType, "prediction");
  assert.equal(protocol.evidenceProtocol.mode, "public_oracle");
  assert.equal(protocol.settlementProtocol.mode, "auto_oracle");
  assert.ok(
    protocol.settlementProtocol.judgeInstructions.some((line) => line === "ORACLE_COINGECKO_ID: audiera"),
    "compiled protocol must lock the resolved CoinGecko asset id",
  );
  assert.ok(
    protocol.evidenceProtocol.captureInstructions.some((line) => /Setup snapshot: BEAT/.test(line)),
    "compiled protocol must include the setup-time price snapshot",
  );

  const roundTrip = extractCryptoPriceOracleSpec({ protocol, now });
  assert.equal(roundTrip?.symbol, "BEAT");
  assert.equal(roundTrip?.coingeckoId, "audiera");
  assert.equal(roundTrip?.targetUsd, 2);

  console.log("crypto-price-oracle smoke passed", {
    symbol: price.data?.symbol,
    coingeckoId: price.data?.coingeckoId,
    assetName: price.data?.assetName,
    priceUsd: price.data?.priceUsd,
    protocolTitle: protocol.title,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
