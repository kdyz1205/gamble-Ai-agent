export const INTERNAL_STAKE_TOKEN = "credits";

export type PaymentJurisdiction = {
  country: string | null;
  region: string | null;
  source: "vercel" | "cloudflare" | "header" | "body" | "unknown";
};

export type PaymentPolicyStatus = {
  jurisdiction: PaymentJurisdiction;
  internalCreditsAllowed: true;
  cashStakeAllowed: boolean;
  cashTopupAllowed: boolean;
  stripeSupporterCheckoutAllowed: boolean;
  realMoneyWageringConfigured: boolean;
  hardBlocked: boolean;
  reason: string | null;
  allowedCountries: string[];
  allowedRegions: string[];
  blockedCountries: string[];
  blockedRegions: string[];
  hardBlockedCountries: string[];
};

const CASH_STAKE_TOKENS = new Set([
  "cash",
  "usd",
  "usdc",
  "usdt",
  "eth",
  "stripe",
  "fiat",
  "real_money",
]);

const HARD_BLOCKED_COUNTRIES = new Set(["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]);
const PUBLIC_HARD_BLOCKED_COUNTRIES = ["US"];

export function normalizeStakeToken(value: unknown): string {
  if (typeof value !== "string") return INTERNAL_STAKE_TOKEN;
  const token = value.trim().toLowerCase();
  return token || INTERNAL_STAKE_TOKEN;
}

function normalizeList(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const country = value.trim().toUpperCase();
  return country || null;
}

function normalizeRegion(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const region = value.trim().toUpperCase();
  return region || null;
}

function readHeader(headers: Headers, name: string): string | null {
  return headers.get(name) || headers.get(name.toLowerCase()) || null;
}

export function paymentJurisdictionFromRequest(
  req: Request,
  body?: Record<string, unknown>,
): PaymentJurisdiction {
  const headers = req.headers;
  const vercelCountry = normalizeCountry(readHeader(headers, "x-vercel-ip-country"));
  const vercelRegion = normalizeRegion(readHeader(headers, "x-vercel-ip-country-region"));
  if (vercelCountry) return { country: vercelCountry, region: vercelRegion, source: "vercel" };

  const cloudflareCountry = normalizeCountry(readHeader(headers, "cf-ipcountry"));
  if (cloudflareCountry) {
    return {
      country: cloudflareCountry,
      region: normalizeRegion(readHeader(headers, "cf-region-code")),
      source: "cloudflare",
    };
  }

  const headerCountry = normalizeCountry(readHeader(headers, "x-country") || readHeader(headers, "x-user-country"));
  if (headerCountry) {
    return {
      country: headerCountry,
      region: normalizeRegion(readHeader(headers, "x-region") || readHeader(headers, "x-user-region")),
      source: "header",
    };
  }

  const bodyCountry = normalizeCountry(body?.jurisdictionCountry);
  if (bodyCountry) {
    return {
      country: bodyCountry,
      region: normalizeRegion(body?.jurisdictionRegion),
      source: "body",
    };
  }

  return { country: null, region: null, source: "unknown" };
}

export function isCashStakeToken(stakeToken: string): boolean {
  return CASH_STAKE_TOKENS.has(normalizeStakeToken(stakeToken));
}

export function isRealMoneyJurisdictionAllowed(jurisdiction: PaymentJurisdiction | null | undefined): boolean {
  const country = normalizeCountry(jurisdiction?.country);
  const region = normalizeRegion(jurisdiction?.region);
  if (!country) return false;
  if (HARD_BLOCKED_COUNTRIES.has(country)) return false;

  const blockedCountries = new Set(normalizeList(process.env.REAL_MONEY_BLOCKED_COUNTRIES));
  if (blockedCountries.has(country)) return false;

  const blockedRegions = new Set(normalizeList(process.env.REAL_MONEY_BLOCKED_REGIONS));
  const regionKey = region ? `${country}-${region}` : null;
  if (regionKey && blockedRegions.has(regionKey)) return false;

  const allowedRegions = new Set(normalizeList(process.env.REAL_MONEY_ALLOWED_REGIONS));
  if (regionKey && allowedRegions.has(regionKey)) return true;

  const allowedCountries = new Set(normalizeList(process.env.REAL_MONEY_ALLOWED_COUNTRIES));
  return allowedCountries.has(country);
}

export function realMoneyWageringEnabled(jurisdiction?: PaymentJurisdiction | null): boolean {
  return (
    process.env.REAL_MONEY_WAGERING_ENABLED === "true" &&
    process.env.LEGAL_REAL_MONEY_APPROVED === "true" &&
    process.env.PAYMENT_PROCESSOR_WAGERING_APPROVED === "true" &&
    isRealMoneyJurisdictionAllowed(jurisdiction)
  );
}

function realMoneyBaseConfigured(): boolean {
  return (
    process.env.REAL_MONEY_WAGERING_ENABLED === "true" &&
    process.env.LEGAL_REAL_MONEY_APPROVED === "true" &&
    process.env.PAYMENT_PROCESSOR_WAGERING_APPROVED === "true"
  );
}

function jurisdictionBlockReason(jurisdiction: PaymentJurisdiction): string | null {
  const country = normalizeCountry(jurisdiction.country);
  const region = normalizeRegion(jurisdiction.region);
  if (!country) return "unknown_jurisdiction";
  if (HARD_BLOCKED_COUNTRIES.has(country)) return "hard_blocked_country";
  const blockedCountries = new Set(normalizeList(process.env.REAL_MONEY_BLOCKED_COUNTRIES));
  if (blockedCountries.has(country)) return "blocked_country";
  const blockedRegions = new Set(normalizeList(process.env.REAL_MONEY_BLOCKED_REGIONS));
  const regionKey = region ? `${country}-${region}` : null;
  if (regionKey && blockedRegions.has(regionKey)) return "blocked_region";
  if (!isRealMoneyJurisdictionAllowed(jurisdiction)) return "not_allowlisted";
  if (!realMoneyBaseConfigured()) return "real_money_flags_disabled";
  return null;
}

export function paymentPolicyStatus(jurisdiction: PaymentJurisdiction): PaymentPolicyStatus {
  const cashStakeAllowed = isStakeTokenAllowed("usdc", jurisdiction);
  return {
    jurisdiction,
    internalCreditsAllowed: true,
    cashStakeAllowed,
    cashTopupAllowed: usdcCreditTopupEnabled(jurisdiction),
    stripeSupporterCheckoutAllowed: stripeCheckoutEnabled(),
    realMoneyWageringConfigured: realMoneyBaseConfigured(),
    hardBlocked: jurisdictionBlockReason(jurisdiction) === "hard_blocked_country",
    reason: cashStakeAllowed ? null : jurisdictionBlockReason(jurisdiction),
    allowedCountries: normalizeList(process.env.REAL_MONEY_ALLOWED_COUNTRIES),
    allowedRegions: normalizeList(process.env.REAL_MONEY_ALLOWED_REGIONS),
    blockedCountries: normalizeList(process.env.REAL_MONEY_BLOCKED_COUNTRIES),
    blockedRegions: normalizeList(process.env.REAL_MONEY_BLOCKED_REGIONS),
    hardBlockedCountries: PUBLIC_HARD_BLOCKED_COUNTRIES,
  };
}

export function isStakeTokenAllowed(stakeToken: string, jurisdiction?: PaymentJurisdiction | null): boolean {
  const normalized = normalizeStakeToken(stakeToken);
  if (normalized === INTERNAL_STAKE_TOKEN) return true;
  return isCashStakeToken(normalized) && realMoneyWageringEnabled(jurisdiction);
}

export function moneyModeBlock(stakeToken: string, jurisdiction?: PaymentJurisdiction | null) {
  const normalized = normalizeStakeToken(stakeToken);
  return {
    error: "Real-money staking is compliance locked.",
    code: "compliance_locked",
    stakeToken: normalized,
    jurisdiction: jurisdiction ?? { country: null, region: null, source: "unknown" },
    allowedStakeToken: INTERNAL_STAKE_TOKEN,
    message:
      "Use internal non-redeemable credits here. Cash, USDC, ETH, Stripe-funded stakes, deposits, and payouts stay disabled in the United States, unknown jurisdictions, and any country/region not explicitly allowlisted.",
    requiredFlags: [
      "REAL_MONEY_WAGERING_ENABLED=true",
      "LEGAL_REAL_MONEY_APPROVED=true",
      "PAYMENT_PROCESSOR_WAGERING_APPROVED=true",
      "REAL_MONEY_ALLOWED_COUNTRIES=<comma-separated ISO countries outside the US>",
    ],
    hardBlockedCountries: PUBLIC_HARD_BLOCKED_COUNTRIES,
  };
}

export function stripeCheckoutEnabled(): boolean {
  return process.env.ENABLE_STRIPE_CHECKOUT === "true" && Boolean(process.env.STRIPE_SECRET_KEY);
}

export function usdcCreditTopupEnabled(jurisdiction?: PaymentJurisdiction | null): boolean {
  return process.env.ENABLE_USDC_CREDIT_TOPUP === "true" && realMoneyWageringEnabled(jurisdiction);
}
