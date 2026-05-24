import type { JudgmentResult } from "@/lib/ai-engine";
import { checkWeatherForecast, resolveWeatherLocation } from "@/lib/oracle-tools";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type WeatherOracleMetric = "precipitation_sum_mm" | "temperature_2m_max_c";
export type WeatherOracleCondition = "above" | "below";

export type WeatherOracleSpec = {
  locationName: string;
  latitude: number;
  longitude: number;
  date: string;
  metric: WeatherOracleMetric;
  condition: WeatherOracleCondition;
  targetValue: number;
  targetUnit: "mm" | "c";
  settlementTime: Date;
  source: "Open-Meteo";
};

function oracleText(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join("\n");
}

function dateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function detectDate(text: string, now = new Date()): { date: string; settlementTime: Date } {
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0];
  const out = new Date(now);
  if (iso) {
    const settle = new Date(`${iso}T23:59:00.000Z`);
    return { date: iso, settlementTime: settle };
  }
  const lower = text.toLowerCase();
  if (/\btomorrow\b|明天/.test(lower)) out.setDate(out.getDate() + 1);
  else if (/\bthis weekend\b|\bweekend\b/.test(lower)) {
    const day = out.getDay();
    const daysUntilSaturday = (6 - day + 7) % 7 || 7;
    out.setDate(out.getDate() + daysUntilSaturday);
  }
  out.setHours(23, 59, 0, 0);
  return { date: dateString(out), settlementTime: out };
}

function detectLocation(text: string): string | null {
  const patterns = [
    /\bin\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?:\s+(?:today|tomorrow|this weekend|weekend|next|on|by|over|above|below|under|at|before|\d{4}-\d{2}-\d{2})|[?.!,]|$)/i,
    /\bat\s+([A-Za-z][A-Za-z .'-]{1,60}?)(?:\s+(?:today|tomorrow|this weekend|weekend|next|on|by|over|above|below|under|before|\d{4}-\d{2}-\d{2})|[?.!,]|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]?.trim();
    if (match) return match.replace(/\s+/g, " ");
  }
  return null;
}

function fahrenheitToCelsius(value: number) {
  return (value - 32) / 1.8;
}

function detectWeatherMetric(text: string): {
  metric: WeatherOracleMetric;
  condition: WeatherOracleCondition;
  targetValue: number;
  targetUnit: "mm" | "c";
} | null {
  const lower = text.toLowerCase();
  if (/\brain|raining|precipitation|下雨|降雨/.test(lower)) {
    const noRain = /\b(no rain|not rain|won't rain|without rain)\b|不下雨/.test(lower);
    return {
      metric: "precipitation_sum_mm",
      condition: noRain ? "below" : "above",
      targetValue: 0.1,
      targetUnit: "mm",
    };
  }

  const temp = text.match(/(?:temperature|temp|high|low|气温|温度)[\s\S]{0,60}?\b(?:above|over|higher than|at least|>=|>|below|under|less than|<=|<)?\s*(\d+(?:\.\d+)?)\s*(°?\s*[fFcC])?/i)
    ?? text.match(/\b(?:above|over|higher than|at least|>=|>|below|under|less than|<=|<)\s*(\d+(?:\.\d+)?)\s*(°?\s*[fFcC])\b/i);
  if (!temp) return null;
  const rawValue = Number(temp[1]);
  if (!Number.isFinite(rawValue)) return null;
  const unitText = (temp[2] ?? "c").toLowerCase().replace(/\s+/g, "");
  const targetWasFahrenheit = unitText.includes("f");
  const condition = /below|under|less than|<=|</i.test(text) ? "below" : "above";
  return {
    metric: "temperature_2m_max_c",
    condition,
    targetValue: targetWasFahrenheit ? fahrenheitToCelsius(rawValue) : rawValue,
    targetUnit: "c",
  };
}

function formatValue(value: number, unit: "mm" | "c") {
  if (unit === "mm") return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}mm`;
  return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}C`;
}

export function extractWeatherOracleSpec(input: {
  protocol?: ProtocolSpecV2 | null;
  title?: string | null;
  description?: string | null;
  proposition?: string | null;
  rules?: string | null;
  deadlineIso?: string | null;
  now?: Date;
}): WeatherOracleSpec | null {
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
  if (!/(ORACLE_WEATHER|weather|rain|raining|temperature|temp|气温|温度|下雨|降雨)/i.test(text)) return null;

  const explicitLocation = text.match(/ORACLE_WEATHER_LOCATION:\s*([^\n]+)/i)?.[1]?.trim();
  const explicitLat = Number(text.match(/ORACLE_WEATHER_LATITUDE:\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  const explicitLng = Number(text.match(/ORACLE_WEATHER_LONGITUDE:\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  const explicitDate = text.match(/ORACLE_WEATHER_DATE:\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  const explicitMetric = text.match(/ORACLE_WEATHER_METRIC:\s*(precipitation_sum_mm|temperature_2m_max_c)/i)?.[1] as WeatherOracleMetric | undefined;
  const explicitCondition = text.match(/ORACLE_WEATHER_CONDITION:\s*(above|below)/i)?.[1] as WeatherOracleCondition | undefined;
  const explicitTarget = Number(text.match(/ORACLE_WEATHER_TARGET:\s*(-?\d+(?:\.\d+)?)/i)?.[1]);
  const explicitUnit = text.match(/ORACLE_WEATHER_TARGET_UNIT:\s*(mm|c)/i)?.[1] as "mm" | "c" | undefined;
  const explicitSettlementTime = text.match(/ORACLE_SETTLEMENT_TIME:\s*([^\n]+)/i)?.[1]?.trim();

  const detected = detectWeatherMetric(text);
  const locationName = explicitLocation ?? detectLocation(text);
  const date = explicitDate
    ? { date: explicitDate, settlementTime: new Date(`${explicitDate}T23:59:00.000Z`) }
    : detectDate(text, input.now);

  if (!locationName || (!detected && !explicitMetric)) return null;
  if (!Number.isFinite(explicitLat) || !Number.isFinite(explicitLng)) return null;
  const metric = explicitMetric ?? detected!.metric;
  const condition = explicitCondition ?? detected!.condition;
  const targetValue = Number.isFinite(explicitTarget) ? explicitTarget : detected!.targetValue;
  const targetUnit = explicitUnit ?? detected!.targetUnit;
  return {
    locationName,
    latitude: explicitLat,
    longitude: explicitLng,
    date: date.date,
    metric,
    condition,
    targetValue,
    targetUnit,
    settlementTime: explicitSettlementTime
      ? new Date(explicitSettlementTime)
      : input.deadlineIso ? new Date(input.deadlineIso) : date.settlementTime,
    source: "Open-Meteo",
  };
}

export async function weatherProtocolFromPrompt(
  rawPrompt: string,
  language: ProtocolSpecV2["language"],
  now = new Date(),
): Promise<ProtocolSpecV2 | null> {
  const detected = detectWeatherMetric(rawPrompt);
  const locationQuery = detectLocation(rawPrompt);
  if (!detected || !locationQuery) return null;
  const location = await resolveWeatherLocation(locationQuery);
  if (!location.ok) {
    console.warn("[weather-oracle] location lookup failed during compile", {
      locationQuery,
      error: location.error,
    });
    return null;
  }
  const when = detectDate(rawPrompt, now);
  const setup = await checkWeatherForecast({
    latitude: location.location.latitude,
    longitude: location.location.longitude,
    date: when.date,
  });
  const locationLabel = [
    location.location.name,
    location.location.admin1,
    location.location.country,
  ].filter(Boolean).join(", ");
  const metricLabel = detected.metric === "precipitation_sum_mm" ? "precipitation" : "daily high temperature";
  const direction = detected.condition === "above" ? "above" : "below";
  const targetText = formatValue(detected.targetValue, detected.targetUnit);
  const title = `${location.location.name} ${metricLabel} ${direction} ${targetText}`;
  const setupForecast = setup.ok && Array.isArray(setup.data?.forecast) ? setup.data.forecast : null;
  const setupLine = setupForecast
    ? `Setup snapshot from Open-Meteo for ${when.date}: ${JSON.stringify(setupForecast[0])}.`
    : `Setup snapshot unavailable: ${setup.error ?? "Open-Meteo did not return forecast data"}.`;

  return {
    version: "2.0",
    title,
    userFacingSummary: `${locationLabel} ${metricLabel} must be ${direction} ${targetText} on ${when.date}, resolved by Open-Meteo.`,
    rawPrompt,
    language,
    participantMode: "head_to_head",
    outcomeType: "prediction",
    evidenceProtocol: {
      mode: "public_oracle",
      requiredEvidence: ["No user-uploaded evidence is required. The result is resolved from Open-Meteo public weather data."],
      captureInstructions: [setupLine, "At settlement time, the backend fetches the locked Open-Meteo daily weather metric and stores the snapshot in the judgment."],
      invalidEvidenceRules: ["Screenshots or self-reports do not override the public weather oracle snapshot."],
      requiredMetadata: ["oracle_source", "latitude", "longitude", "weather_date", "weather_metric", "condition", "target_value"],
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
      endCondition: `Resolve after ${when.date} daily weather data is available.`,
      deadline: when.settlementTime.toISOString(),
      tieBreaker: "If the weather oracle cannot be fetched, no automatic settlement occurs.",
      allowedAttempts: "One locked weather prediction.",
    },
    settlementProtocol: {
      mode: "auto_oracle",
      winCondition: `${locationLabel} ${metricLabel} is ${direction} ${targetText} on ${when.date}. Creator wins if true; opponent wins if false.`,
      judgeInstructions: [
        "Resolve from Open-Meteo daily weather data. Do not use LLM inference for the weather outcome.",
        "ORACLE_SOURCE: Open-Meteo",
        `ORACLE_WEATHER_LOCATION: ${locationLabel}`,
        `ORACLE_WEATHER_LATITUDE: ${location.location.latitude}`,
        `ORACLE_WEATHER_LONGITUDE: ${location.location.longitude}`,
        `ORACLE_WEATHER_DATE: ${when.date}`,
        `ORACLE_WEATHER_METRIC: ${detected.metric}`,
        `ORACLE_WEATHER_CONDITION: ${detected.condition}`,
        `ORACLE_WEATHER_TARGET: ${detected.targetValue}`,
        `ORACLE_WEATHER_TARGET_UNIT: ${detected.targetUnit}`,
        `ORACLE_SETTLEMENT_TIME: ${when.settlementTime.toISOString()}`,
      ],
      autoSettleConfidenceThreshold: 0.99,
      manualReviewTriggers: [
        "Open-Meteo API is unavailable at settlement time.",
        "Location, date, metric, target, or condition is malformed.",
        "The challenge is judged before the locked settlement time.",
      ],
    },
    riskPolicy: {
      riskLevel: "medium",
      allowed: true,
      warnings: ["Prediction challenge uses internal credits only; no real-money gambling, cash-out, or prize redemption."],
      restrictions: ["Rules, oracle source, location, metric, target, and settlement date are locked after publish."],
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

export async function judgeWeatherOracle(input: {
  spec: WeatherOracleSpec;
  participantAId: string;
  participantBId: string | null;
  now?: Date;
}): Promise<{ status: "not_due"; reason: string; settlementTime: string } | { status: "ready"; result: JudgmentResult }> {
  const now = input.now ?? new Date();
  if (now < input.spec.settlementTime) {
    return {
      status: "not_due",
      settlementTime: input.spec.settlementTime.toISOString(),
      reason: `Weather oracle challenge is not ready until ${input.spec.settlementTime.toISOString()}.`,
    };
  }

  const weather = await checkWeatherForecast({
    latitude: input.spec.latitude,
    longitude: input.spec.longitude,
    date: input.spec.date,
  });
  const forecast = weather.ok && Array.isArray(weather.data?.forecast) ? weather.data.forecast : null;
  const first = forecast
    ? forecast[0] as { precipitationMm?: number | null; tempMaxC?: number | null }
    : null;
  const actual = input.spec.metric === "precipitation_sum_mm"
    ? first?.precipitationMm
    : first?.tempMaxC;
  if (!weather.ok || !first || typeof actual !== "number") {
    return {
      status: "ready",
      result: {
        winnerId: null,
        confidence: 0.4,
        evidenceQuality: "unclear",
        recommendation: "needs_review",
        settlementRecommendation: "needs_review",
        blockingIssues: [weather.error || "Open-Meteo weather lookup failed."],
        source: "oracle",
        reasoning: `Open-Meteo could not return a usable ${input.spec.metric} snapshot for ${input.spec.locationName} on ${input.spec.date}, so this challenge requires manual review or retry.`,
      },
    };
  }

  const conditionMet = input.spec.condition === "above"
    ? actual > input.spec.targetValue
    : actual < input.spec.targetValue;
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
        `Open-Meteo snapshot for ${input.spec.locationName} on ${input.spec.date} returned ${input.spec.metric}=${actual}. ` +
        `The locked condition was ${input.spec.condition} ${input.spec.targetValue}. ` +
        `The condition was ${conditionMet ? "true" : "false"}, so ${conditionMet ? "the creator/YES side wins" : "the opponent/NO side wins"}.`,
      providerCall: {
        providerId: "open-meteo",
        providerLabel: "Open-Meteo",
        model: "daily-weather",
        requestKind: "text",
        usedApi: true,
        baseUrlHost: "api.open-meteo.com",
        httpStatus: null,
        responseId: null,
        responseModel: null,
        durationMs: 0,
        responseFormat: "json",
      },
    },
  };
}
