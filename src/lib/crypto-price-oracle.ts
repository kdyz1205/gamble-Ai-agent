import type { JudgmentResult } from "@/lib/ai-engine";
import { checkCryptoPrice } from "@/lib/oracle-tools";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type CryptoPriceCondition = "above" | "below";

export type CryptoPriceOracleSpec = {
  symbol: string;
  coingeckoId?: string;
  assetName?: string;
  marketCapRank?: number | null;
  currentPriceUsd?: number;
  priceQueriedAt?: string;
  oracleUrl?: string;
  ambiguousAssetMatches?: Array<{ id: string; symbol: string; name: string; marketCapRank: number | null }>;
  condition: CryptoPriceCondition;
  targetUsd: number;
  settlementTime: Date;
  source: "CoinGecko";
};

const SYMBOL_ALIASES: Record<string, string> = {
  bitcoin: "BTC",
  btc: "BTC",
  ethereum: "ETH",
  eth: "ETH",
  solana: "SOL",
  sol: "SOL",
  dogecoin: "DOGE",
  doge: "DOGE",
  ripple: "XRP",
  xrp: "XRP",
  cardano: "ADA",
  ada: "ADA",
  bnb: "BNB",
  binancecoin: "BNB",
  chainlink: "LINK",
  link: "LINK",
  avalanche: "AVAX",
  avax: "AVAX",
  usdc: "USDC",
  usdt: "USDT",
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const NON_ASSET_TICKERS = new Set([
  "USD",
  "AI",
  "API",
  "GPS",
  "KTV",
  "WILL",
  "CAN",
  "REACH",
  "HIT",
  "TOKEN",
  "COIN",
  "PRICE",
  "TODAY",
  "TOMORROW",
]);

function normalizeTicker(candidate: string | undefined | null): string | null {
  const clean = String(candidate ?? "").trim().replace(/^[#$]+/, "").replace(/[.,;:!?)]$/g, "");
  if (!/^[A-Za-z][A-Za-z0-9-]{1,15}$/.test(clean)) return null;
  const upper = clean.toUpperCase();
  if (NON_ASSET_TICKERS.has(upper)) return null;
  return upper;
}

function detectGenericTicker(text: string): string | null {
  const patterns = [
    /\$([A-Za-z][A-Za-z0-9-]{1,15})\b/g,
    /\b([A-Za-z][A-Za-z0-9-]{1,15})\s+(?:token|coin|ticker|币|代币)\b/gi,
    /\b(?:token|coin|ticker|币|代币)\s+([A-Za-z][A-Za-z0-9-]{1,15})\b/gi,
    /\b([A-Z][A-Z0-9-]{1,12})\b(?=[\s\S]{0,80}\b(?:price|token|coin|reach|hit|above|below|over|under|break|目标|价格|到|突破)\b)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const ticker = normalizeTicker(match[1]);
      if (ticker) return ticker;
    }
  }
  return null;
}

function detectSymbol(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [alias, symbol] of Object.entries(SYMBOL_ALIASES)) {
    if (new RegExp(`(?:^|[^a-z0-9])${alias}(?:$|[^a-z0-9])`, "i").test(lower)) return symbol;
  }
  return detectGenericTicker(text);
}

function detectCondition(text: string): CryptoPriceCondition | null {
  const lower = text.toLowerCase();
  if (/(?:>=|>|above|over|higher than|at least|breaks? above|hits?|reach(?:es)?|高于|超过|大于|涨到|突破|站上)/i.test(lower)) {
    return "above";
  }
  if (/(?:<=|<|below|under|lower than|less than|drops? below|跌破|低于|小于|少于)/i.test(lower)) {
    return "below";
  }
  return null;
}

function parsePriceNumber(value: string, suffix?: string | null): number | null {
  const n = Number(value.replace(/[$,\s_]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = (suffix ?? "").trim().toLowerCase();
  if (s === "k") return n * 1000;
  if (s === "万") return n * 10000;
  return n;
}

function detectTargetUsd(text: string): number | null {
  const markedPricePattern = /(?:\$|usd\s*)\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*([kK万]))?|(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK万])/gi;
  const marked = [...text.matchAll(markedPricePattern)]
    .map((match) => parsePriceNumber(match[1] ?? match[3], match[2] ?? match[4]))
    .filter((value): value is number => value !== null);
  if (marked.length > 0) return marked[0];

  const pricePattern = /(?:\$|usd\s*)?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*([kK万]))?/g;
  const matches = [...text.matchAll(pricePattern)]
    .map((match) => parsePriceNumber(match[1], match[2]))
    .filter((value): value is number => value !== null);
  if (matches.length === 0) return null;
  const plausible = matches.filter((value) => value >= 10 && value <= 10_000_000);
  return plausible[0] ?? null;
}

function nextWeekday(now: Date, targetDay: number): Date {
  const out = new Date(now);
  const delta = (targetDay - out.getDay() + 7) % 7 || 7;
  out.setDate(out.getDate() + delta);
  out.setHours(23, 59, 0, 0);
  return out;
}

function parseClock(text: string): { hour: number; minute: number } | null {
  const match = text.match(/(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();
  if (!Number.isFinite(hour) || hour < 0 || hour > 24 || !Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return { hour, minute };
}

function detectSettlementTime(text: string, now = new Date()): Date {
  const marker = text.match(/ORACLE_SETTLEMENT_TIME:\s*([^\n]+)/i)?.[1]?.trim();
  if (marker) {
    const parsed = new Date(marker);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const iso = text.match(/\b\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/)?.[0];
  if (iso) {
    const parsed = new Date(iso);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }

  const inMatch = text.match(/\bin\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b/i);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = inMatch[2].toLowerCase();
    const out = new Date(now);
    if (/min/.test(unit)) out.setMinutes(out.getMinutes() + amount);
    else if (/hour|hr/.test(unit)) out.setHours(out.getHours() + amount);
    else out.setDate(out.getDate() + amount);
    return out;
  }

  for (const [label, day] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b(?:by|on)?\\s*${label}\\b`, "i").test(text)) return nextWeekday(now, day);
  }

  const lower = text.toLowerCase();
  const tomorrow = /\btomorrow\b|明天/.test(lower);
  const today = /\btoday\b|今天/.test(lower);
  const clock = parseClock(text);
  if (tomorrow || today || clock) {
    const out = new Date(now);
    if (tomorrow) out.setDate(out.getDate() + 1);
    if (clock) out.setHours(clock.hour, clock.minute, 0, 0);
    else out.setHours(23, 59, 0, 0);
    if (!tomorrow && !today && out <= now) out.setDate(out.getDate() + 1);
    return out;
  }

  const out = new Date(now);
  out.setDate(out.getDate() + 1);
  out.setHours(23, 59, 0, 0);
  return out;
}

function formatUsd(value: number) {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 1 ? 2 : 6 })}`;
}

function oracleText(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join("\n");
}

export function extractCryptoPriceOracleSpec(input: {
  protocol?: ProtocolSpecV2 | null;
  title?: string | null;
  description?: string | null;
  proposition?: string | null;
  rules?: string | null;
  deadlineIso?: string | null;
  now?: Date;
}): CryptoPriceOracleSpec | null {
  const text = oracleText([
    input.protocol?.rawPrompt,
    input.protocol?.title,
    input.protocol?.userFacingSummary,
    input.protocol?.settlementProtocol.winCondition,
    ...(input.protocol?.settlementProtocol.judgeInstructions ?? []),
    input.title,
    input.description,
    input.proposition,
    input.rules,
  ]);
  if (!/(ORACLE_CRYPTO_SYMBOL|btc|bitcoin|eth|ethereum|sol|solana|doge|xrp|ada|bnb|link|avax|token|coin|ticker|price|reach|hit|above|below|over|under|币|代币|价格)/i.test(text)) return null;
  const explicitSymbol = text.match(/ORACLE_CRYPTO_SYMBOL:\s*([A-Za-z0-9-]+)/i)?.[1]?.toUpperCase();
  const explicitCoinGeckoId = text.match(/ORACLE_COINGECKO_ID:\s*([A-Za-z0-9-]+)/i)?.[1]?.toLowerCase();
  const explicitCondition = text.match(/ORACLE_CONDITION:\s*(above|below)/i)?.[1]?.toLowerCase() as CryptoPriceCondition | undefined;
  const explicitTarget = text.match(/ORACLE_TARGET_USD:\s*([0-9.,]+)/i)?.[1];
  const symbol = explicitSymbol ?? detectSymbol(text);
  const condition = explicitCondition ?? detectCondition(text);
  const targetUsd = explicitTarget ? parsePriceNumber(explicitTarget) : detectTargetUsd(text);
  if (!symbol || !condition || !targetUsd) return null;
  const settlementTime = input.deadlineIso
    ? (() => {
        const parsed = new Date(input.deadlineIso as string);
        return Number.isFinite(parsed.getTime()) ? parsed : detectSettlementTime(text, input.now);
      })()
    : detectSettlementTime(text, input.now);
  return { symbol, coingeckoId: explicitCoinGeckoId, condition, targetUsd, settlementTime, source: "CoinGecko" };
}

export async function cryptoPriceProtocolFromPrompt(
  rawPrompt: string,
  language: ProtocolSpecV2["language"],
  now = new Date(),
): Promise<ProtocolSpecV2 | null> {
  const spec = extractCryptoPriceOracleSpec({ title: rawPrompt, now });
  if (!spec) return null;
  const price = await checkCryptoPrice({ symbol: spec.symbol, coingeckoId: spec.coingeckoId });
  if (!price.ok || !price.data || typeof price.data.priceUsd !== "number") {
    console.warn("[crypto-price-oracle] asset price lookup failed during compile", {
      symbol: spec.symbol,
      coingeckoId: spec.coingeckoId ?? null,
      error: price.error ?? "missing priceUsd",
    });
    return null;
  }
  const priceData = price.data as {
    symbol?: string;
    coingeckoId?: string;
    assetName?: string;
    marketCapRank?: number | null;
    ambiguousSymbolMatches?: Array<{ id: string; symbol: string; name: string; marketCapRank: number | null }>;
    priceUsd: number;
    queriedAt?: string;
    publicUrl?: string;
  };
  const resolvedSpec: CryptoPriceOracleSpec = {
    ...spec,
    symbol: String(priceData.symbol || spec.symbol).toUpperCase(),
    coingeckoId: typeof priceData.coingeckoId === "string" ? priceData.coingeckoId : spec.coingeckoId,
    assetName: typeof priceData.assetName === "string" ? priceData.assetName : undefined,
    marketCapRank: typeof priceData.marketCapRank === "number" ? priceData.marketCapRank : null,
    ambiguousAssetMatches: Array.isArray(priceData.ambiguousSymbolMatches) ? priceData.ambiguousSymbolMatches : [],
    currentPriceUsd: priceData.priceUsd,
    priceQueriedAt: typeof priceData.queriedAt === "string" ? priceData.queriedAt : new Date().toISOString(),
    oracleUrl: typeof priceData.publicUrl === "string" ? priceData.publicUrl : undefined,
  };
  const direction = spec.condition === "above" ? "above" : "below";
  const assetLabel = resolvedSpec.assetName
    ? `${resolvedSpec.symbol} (${resolvedSpec.assetName})`
    : resolvedSpec.symbol;
  const title = `${resolvedSpec.symbol} price ${direction} ${formatUsd(resolvedSpec.targetUsd)}`;
  const settlementIso = resolvedSpec.settlementTime.toISOString();
  const currentPriceText = formatUsd(resolvedSpec.currentPriceUsd ?? 0);
  return {
    version: "2.0",
    title,
    userFacingSummary: `${assetLabel}/USD must be ${direction} ${formatUsd(resolvedSpec.targetUsd)} at the locked settlement time, using CoinGecko spot price. Current setup price is ${currentPriceText}.`,
    rawPrompt,
    language,
    participantMode: "head_to_head",
    outcomeType: "prediction",
    evidenceProtocol: {
      mode: "public_oracle",
      requiredEvidence: ["No user-uploaded evidence is required. The result is resolved from CoinGecko public spot price."],
      captureInstructions: [
        `Setup snapshot: ${assetLabel}/USD was ${currentPriceText} at ${resolvedSpec.priceQueriedAt}.`,
        "At settlement time, the backend fetches the locked CoinGecko asset's USD spot price and stores the snapshot in the judgment.",
      ],
      invalidEvidenceRules: ["Screenshots or self-reports do not override the public oracle snapshot."],
      requiredMetadata: ["oracle_source", "coingecko_id", "symbol", "target_usd", "condition", "settlement_time"],
    },
    identityProtocol: {
      mode: "account_only",
      required: false,
      participantBindings: [
        { role: "creator", label: "Creator / YES side", expectedPosition: "any", requiredQrOrCode: false },
        { role: "opponent", label: "Opponent / NO side", expectedPosition: "any", requiredQrOrCode: false },
      ],
      autoSettlementRequiresIdentityConfidence: 1,
    },
    locationProtocol: {
      mode: "none",
      requiresLiveLocation: false,
      requiresCoPresence: false,
      locationPrivacy: "hidden",
    },
    timingProtocol: {
      startCondition: "Challenge starts after the opponent accepts and stakes are locked.",
      endCondition: `Resolve at ${settlementIso}.`,
      deadline: settlementIso,
      tieBreaker: "If the oracle cannot be fetched, no automatic settlement occurs.",
      allowedAttempts: "One locked prediction.",
    },
    settlementProtocol: {
      mode: "auto_oracle",
      winCondition: `${assetLabel}/USD is ${direction} ${formatUsd(resolvedSpec.targetUsd)} at ${settlementIso}. Creator wins if true; opponent wins if false.`,
      judgeInstructions: [
        "Resolve from CoinGecko simple price API. Do not use LLM inference for the price.",
        `ORACLE_SOURCE: CoinGecko`,
        `ORACLE_CRYPTO_SYMBOL: ${resolvedSpec.symbol}`,
        resolvedSpec.coingeckoId ? `ORACLE_COINGECKO_ID: ${resolvedSpec.coingeckoId}` : null,
        resolvedSpec.assetName ? `ORACLE_ASSET_NAME: ${resolvedSpec.assetName}` : null,
        `ORACLE_SETUP_PRICE_USD: ${resolvedSpec.currentPriceUsd}`,
        `ORACLE_SETUP_QUERIED_AT: ${resolvedSpec.priceQueriedAt}`,
        resolvedSpec.oracleUrl ? `ORACLE_PUBLIC_URL: ${resolvedSpec.oracleUrl}` : null,
        `ORACLE_CONDITION: ${resolvedSpec.condition}`,
        `ORACLE_TARGET_USD: ${resolvedSpec.targetUsd}`,
        `ORACLE_SETTLEMENT_TIME: ${settlementIso}`,
      ].filter((item): item is string => Boolean(item)),
      autoSettleConfidenceThreshold: 0.99,
      manualReviewTriggers: [
        "CoinGecko API is unavailable at settlement time.",
        "Symbol, target, condition, or settlement time is malformed.",
        "The user disputes the selected CoinGecko asset id or ticker mapping.",
        "The challenge is judged before the locked settlement time.",
      ],
    },
    riskPolicy: {
      riskLevel: "medium",
      allowed: true,
      warnings: ["Prediction challenge uses internal credits only; no real-money gambling, cash-out, or prize redemption."],
      restrictions: ["Rules, oracle source, target price, and settlement time are locked after publish."],
    },
    aiBudgetPolicy: {
      compileMaxTokens: 0,
      judgeMaxTokens: 0,
      maxVisionFrames: 0,
      allowEscalation: false,
      estimatedCostTier: "low",
      requireHumanReviewAboveStake: 20,
    },
  };
}

export async function judgeCryptoPriceOracle(input: {
  spec: CryptoPriceOracleSpec;
  participantAId: string;
  participantBId: string | null;
  now?: Date;
}): Promise<{ status: "not_due"; reason: string; settlementTime: string } | { status: "ready"; result: JudgmentResult }> {
  const now = input.now ?? new Date();
  if (now < input.spec.settlementTime) {
    return {
      status: "not_due",
      settlementTime: input.spec.settlementTime.toISOString(),
      reason: `Oracle challenge is not ready until ${input.spec.settlementTime.toISOString()}.`,
    };
  }

  const price = await checkCryptoPrice({ symbol: input.spec.symbol, coingeckoId: input.spec.coingeckoId });
  if (!price.ok || !price.data || typeof price.data.priceUsd !== "number") {
    return {
      status: "ready",
      result: {
        winnerId: null,
        confidence: 0.4,
        evidenceQuality: "unclear",
        recommendation: "needs_review",
        settlementRecommendation: "needs_review",
        blockingIssues: [price.error || "CoinGecko price lookup failed."],
        source: "oracle",
        reasoning: `CoinGecko could not return a usable ${input.spec.symbol}/USD price snapshot, so this challenge requires manual review or retry.`,
      },
    };
  }

  const actual = price.data.priceUsd;
  const assetName = typeof price.data.assetName === "string" ? price.data.assetName : input.spec.assetName;
  const coingeckoId = typeof price.data.coingeckoId === "string" ? price.data.coingeckoId : input.spec.coingeckoId;
  const assetLabel = assetName ? `${input.spec.symbol} (${assetName})` : input.spec.symbol;
  const conditionMet = input.spec.condition === "above"
    ? actual > input.spec.targetUsd
    : actual < input.spec.targetUsd;
  const winnerId = conditionMet ? input.participantAId : input.participantBId;
  return {
    status: "ready",
    result: {
      winnerId,
      confidence: winnerId ? 0.99 : 0.95,
      evidenceQuality: "good",
      recommendation: winnerId ? "settle_winner" : "tie_or_no_winner",
      settlementRecommendation: winnerId ? "settle_winner" : "tie_or_no_winner",
      blockingIssues: winnerId ? [] : ["No opponent participant exists to receive the NO-side win."],
      source: "oracle",
      reasoning:
        `CoinGecko snapshot for ${assetLabel}/USD${coingeckoId ? ` [${coingeckoId}]` : ""} at judgment time was ${formatUsd(actual)}. ` +
        `The locked condition was ${input.spec.condition} ${formatUsd(input.spec.targetUsd)}. ` +
        `The condition was ${conditionMet ? "true" : "false"}, so ${conditionMet ? "the creator/YES side wins" : "the opponent/NO side wins"}.`,
      providerCall: {
        providerId: "coingecko",
        providerLabel: "CoinGecko",
        model: "simple-price",
        requestKind: "text",
        usedApi: true,
        baseUrlHost: "api.coingecko.com",
        httpStatus: null,
        responseId: null,
        responseModel: null,
        durationMs: 0,
        responseFormat: "json",
      },
    },
  };
}
