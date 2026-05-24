/**
 * Real-world tools the parse/judge LLM can call to verify prediction markets
 * are actually resolvable. Each tool:
 *  - talks to a free public API (no paid keys required)
 *  - returns a small JSON payload the LLM can reason about
 *  - is safe (no writes, no side effects, public data only)
 *
 * The whole point: when a user says "BTC hits 70k by Friday", the LLM knows
 * current BTC is ~$63k and can decide the threshold is reachable-but-stretch,
 * and can embed a real oracle URL in the challenge so settlement has ground
 * truth instead of self-report.
 */

export interface OracleToolResult {
  ok: boolean;
  source: string;
  data?: Record<string, unknown>;
  error?: string;
}

/** Human-visible type the UI renders under the draft. */
export interface OracleAttachment {
  source: string;          // "CoinGecko" | "Open-Meteo" | ...
  label: string;           // "BTC/USD spot price"
  currentValue?: string;   // "$63,421.00"
  oracleUrl?: string;      // public URL for humans to verify at settlement time
  queriedAt: string;       // ISO timestamp
}

export interface CoinGeckoAssetMatch {
  id: string;
  symbol: string;
  name: string;
  marketCapRank: number | null;
}

export interface CoinGeckoResolvedAsset extends CoinGeckoAssetMatch {
  requested: string;
  resolvedBy: "static_map" | "explicit_id" | "search";
  ambiguousSymbolMatches: CoinGeckoAssetMatch[];
  publicUrl: string;
}

export interface WeatherLocation {
  name: string;
  country?: string | null;
  admin1?: string | null;
  latitude: number;
  longitude: number;
  timezone?: string | null;
}

const COINGECKO_SYMBOL_MAP: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  xrp: "ripple",
  ripple: "ripple",
  ada: "cardano",
  cardano: "cardano",
  matic: "matic-network",
  polygon: "matic-network",
  bnb: "binancecoin",
  link: "chainlink",
  chainlink: "chainlink",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  usdc: "usd-coin",
  usdt: "tether",
  tether: "tether",
};

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Lambda-local in-memory cache for CoinGecko lookups. Free tier is ~10 req/min;
 * under real load a single BTC market spike could send dozens of parses and 429
 * the provider. Cache each symbol for 60s — close enough to "live" for prop
 * markets but cheap enough to survive a 100 rps spike.
 */
type PriceCacheEntry = { data: Record<string, unknown>; cachedAt: number };
const priceCache = new Map<string, PriceCacheEntry>();
const PRICE_CACHE_TTL_MS = 60_000;

type SearchCacheEntry = { asset: CoinGeckoResolvedAsset; cachedAt: number };
const searchCache = new Map<string, SearchCacheEntry>();
const SEARCH_CACHE_TTL_MS = 10 * 60_000;

type WeatherLocationCacheEntry = { location: WeatherLocation; cachedAt: number };
const weatherLocationCache = new Map<string, WeatherLocationCacheEntry>();
const WEATHER_LOCATION_CACHE_TTL_MS = 24 * 60 * 60_000;

const BLOCKED_TICKER_WORDS = new Set(["usd"]);

function coingeckoUrl(id: string) {
  return `https://www.coingecko.com/en/coins/${id}`;
}

function rankMarketCap(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assetFromStaticMap(requested: string, id: string): CoinGeckoResolvedAsset {
  return {
    requested,
    id,
    symbol: requested.toUpperCase(),
    name: id,
    marketCapRank: null,
    resolvedBy: "static_map",
    ambiguousSymbolMatches: [],
    publicUrl: coingeckoUrl(id),
  };
}

function assetFromExplicitId(requested: string, id: string): CoinGeckoResolvedAsset {
  return {
    requested,
    id,
    symbol: requested.toUpperCase(),
    name: id,
    marketCapRank: null,
    resolvedBy: "explicit_id",
    ambiguousSymbolMatches: [],
    publicUrl: coingeckoUrl(id),
  };
}

function normalizeCoinGeckoCoin(value: unknown): CoinGeckoAssetMatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const coin = value as Record<string, unknown>;
  const id = typeof coin.id === "string" ? coin.id.trim() : "";
  const symbol = typeof coin.symbol === "string" ? coin.symbol.trim() : "";
  const name = typeof coin.name === "string" ? coin.name.trim() : "";
  if (!id || !symbol || !name) return null;
  return {
    id,
    symbol,
    name,
    marketCapRank: rankMarketCap(coin.market_cap_rank),
  };
}

function compareCoinGeckoCandidates(query: string) {
  const q = query.trim().toLowerCase();
  return (a: CoinGeckoAssetMatch, b: CoinGeckoAssetMatch) => {
    const score = (item: CoinGeckoAssetMatch) => {
      const id = item.id.toLowerCase();
      const symbol = item.symbol.toLowerCase();
      const name = item.name.toLowerCase();
      if (symbol === q) return 0;
      if (id === q) return 1;
      if (name === q) return 2;
      if (symbol.startsWith(q)) return 3;
      if (id.startsWith(q) || name.startsWith(q)) return 4;
      return 5;
    };
    const scoreDiff = score(a) - score(b);
    if (scoreDiff !== 0) return scoreDiff;
    const rankA = a.marketCapRank ?? Number.MAX_SAFE_INTEGER;
    const rankB = b.marketCapRank ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.id.localeCompare(b.id);
  };
}

export async function resolveCoinGeckoAsset(args: {
  query: string;
  coingeckoId?: string | null;
}): Promise<{ ok: true; asset: CoinGeckoResolvedAsset } | { ok: false; error: string }> {
  const requested = args.query?.trim() || "";
  const raw = requested.toLowerCase();
  const explicitId = args.coingeckoId?.trim();
  if (!requested && !explicitId) return { ok: false, error: "Missing crypto asset symbol or CoinGecko id" };
  if (explicitId) return { ok: true, asset: assetFromExplicitId(requested || explicitId, explicitId) };
  if (BLOCKED_TICKER_WORDS.has(raw)) return { ok: false, error: `"${requested}" is a quote currency, not a crypto asset ticker.` };

  const staticId = COINGECKO_SYMBOL_MAP[raw];
  if (staticId) return { ok: true, asset: assetFromStaticMap(requested, staticId) };

  const cached = searchCache.get(raw);
  if (cached && Date.now() - cached.cachedAt < SEARCH_CACHE_TTL_MS) {
    return { ok: true, asset: cached.asset };
  }

  const url = `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(requested)}`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (res.status === 429) return { ok: false, error: "CoinGecko search rate limit (HTTP 429). Try again in ~30s." };
    if (!res.ok) return { ok: false, error: `CoinGecko search HTTP ${res.status}` };
    const body = (await res.json()) as { coins?: unknown[] };
    const candidates = (body.coins ?? [])
      .map(normalizeCoinGeckoCoin)
      .filter((item): item is CoinGeckoAssetMatch => item !== null)
      .sort(compareCoinGeckoCandidates(requested));
    if (!candidates.length) return { ok: false, error: `CoinGecko could not find a token for "${requested}".` };

    const selected = candidates[0];
    const exactSymbolMatches = candidates
      .filter((item) => item.symbol.toLowerCase() === raw)
      .slice(0, 8);
    const asset: CoinGeckoResolvedAsset = {
      ...selected,
      requested,
      symbol: selected.symbol.toUpperCase(),
      resolvedBy: "search",
      ambiguousSymbolMatches: exactSymbolMatches.filter((item) => item.id !== selected.id),
      publicUrl: coingeckoUrl(selected.id),
    };
    searchCache.set(raw, { asset, cachedAt: Date.now() });
    return { ok: true, asset };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * CoinGecko — free tier, no key. Accepts common tickers (BTC, ETH, SOL…)
 * and returns current USD spot price. Cached 60s in-process.
 */
export async function checkCryptoPrice(args: { symbol: string; coingeckoId?: string | null }): Promise<OracleToolResult> {
  const resolved = await resolveCoinGeckoAsset({ query: args.symbol, coingeckoId: args.coingeckoId });
  if (!resolved.ok) return { ok: false, source: "CoinGecko", error: resolved.error };
  const asset = resolved.asset;
  const id = asset.id;

  // Cache hit — return immediately, refresh queriedAt so the UI shows "Now:".
  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.cachedAt < PRICE_CACHE_TTL_MS) {
    return {
      ok: true,
      source: "CoinGecko",
      data: { ...cached.data, queriedAt: new Date().toISOString(), fromCache: true },
    };
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (res.status === 429) {
      // Rate-limited: serve stale cache if we have ANY, otherwise fail clean.
      if (cached) {
        return {
          ok: true,
          source: "CoinGecko",
          data: { ...cached.data, queriedAt: new Date().toISOString(), fromCache: true, stale: true },
        };
      }
      return { ok: false, source: "CoinGecko", error: "CoinGecko rate limit (HTTP 429). Try again in ~30s." };
    }
    if (!res.ok) return { ok: false, source: "CoinGecko", error: `HTTP ${res.status}` };
    const body = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const row = body[id];
    if (!row || typeof row.usd !== "number") {
      return { ok: false, source: "CoinGecko", error: `Unknown symbol "${args.symbol}"` };
    }
    const data = {
      symbol: asset.symbol.toUpperCase(),
      requestedSymbol: args.symbol.toUpperCase(),
      coingeckoId: id,
      assetName: asset.name,
      marketCapRank: asset.marketCapRank,
      resolvedBy: asset.resolvedBy,
      ambiguousSymbolMatches: asset.ambiguousSymbolMatches,
      priceUsd: row.usd,
      change24hPct: row.usd_24h_change ?? null,
      queriedAt: new Date().toISOString(),
      publicUrl: asset.publicUrl,
    };
    priceCache.set(id, { data, cachedAt: Date.now() });
    return { ok: true, source: "CoinGecko", data };
  } catch (e) {
    // Network failure — fall back to cache if we have it.
    if (cached) {
      return {
        ok: true,
        source: "CoinGecko",
        data: { ...cached.data, queriedAt: new Date().toISOString(), fromCache: true, stale: true },
      };
    }
    return { ok: false, source: "CoinGecko", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function resolveWeatherLocation(query: string): Promise<{ ok: true; location: WeatherLocation } | { ok: false; error: string }> {
  const q = query.trim();
  if (!q) return { ok: false, error: "Missing weather location" };
  const cached = weatherLocationCache.get(q.toLowerCase());
  if (cached && Date.now() - cached.cachedAt < WEATHER_LOCATION_CACHE_TTL_MS) {
    return { ok: true, location: cached.location };
  }

  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `Open-Meteo geocoding HTTP ${res.status}` };
    const body = (await res.json()) as { results?: Array<Record<string, unknown>> };
    const first = body.results?.[0];
    if (!first || typeof first.latitude !== "number" || typeof first.longitude !== "number" || typeof first.name !== "string") {
      return { ok: false, error: `Open-Meteo could not find location "${q}".` };
    }
    const location: WeatherLocation = {
      name: first.name,
      country: typeof first.country === "string" ? first.country : null,
      admin1: typeof first.admin1 === "string" ? first.admin1 : null,
      latitude: first.latitude,
      longitude: first.longitude,
      timezone: typeof first.timezone === "string" ? first.timezone : null,
    };
    weatherLocationCache.set(q.toLowerCase(), { location, cachedAt: Date.now() });
    return { ok: true, location };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Open-Meteo — free, no key, generous rate limits.
 * For weather prediction markets: "Will it rain in Seattle on April 30?"
 */
export async function checkWeatherForecast(args: {
  latitude: number;
  longitude: number;
  date?: string;
}): Promise<OracleToolResult> {
  const { latitude, longitude, date } = args;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return { ok: false, source: "Open-Meteo", error: "latitude and longitude are required numbers" };
  }
  const today = new Date().toISOString().slice(0, 10);
  const useArchive = Boolean(date && date < today);
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
    timezone: "auto",
    ...(date ? { start_date: date, end_date: date } : {}),
  });
  const baseUrl = useArchive
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";
  const url = `${baseUrl}?${params.toString()}`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, source: "Open-Meteo", error: `HTTP ${res.status}` };
    const body = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        weathercode?: number[];
      };
    };
    if (!body.daily?.time?.length) {
      return { ok: false, source: "Open-Meteo", error: "No forecast returned" };
    }
    return {
      ok: true,
      source: "Open-Meteo",
      data: {
        forecast: body.daily.time.map((date, i) => ({
          date,
          tempMaxC: body.daily!.temperature_2m_max?.[i] ?? null,
          tempMinC: body.daily!.temperature_2m_min?.[i] ?? null,
          precipitationMm: body.daily!.precipitation_sum?.[i] ?? null,
          weatherCode: body.daily!.weathercode?.[i] ?? null,
        })),
        queriedAt: new Date().toISOString(),
        requestedDate: date ?? null,
        mode: useArchive ? "archive" : "forecast",
        publicUrl: `https://www.open-meteo.com/en/docs`,
      },
    };
  } catch (e) {
    return { ok: false, source: "Open-Meteo", error: e instanceof Error ? e.message : String(e) };
  }
}

// ────────────────────────────────────────────────────────────────
// OpenAI function-calling tool schema. These are what we send in the
// `tools` array of the chat completion request so the model can invoke
// them by name.
// ────────────────────────────────────────────────────────────────

export interface OpenAiTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const ORACLE_TOOLS: OpenAiTool[] = [
  {
    type: "function",
    function: {
      name: "check_crypto_price",
      description:
        "Look up the current USD spot price of a cryptocurrency via CoinGecko. Call this whenever the user is proposing a bet on a crypto price threshold (e.g. 'BTC hits 70k by Friday', 'ETH above 4000'). Returns current price, 24h change %, and a public URL that humans can open to verify at settlement time. Use the returned current price to decide if the threshold is reachable-but-stretch and attach the oracle so settlement isn't self-report.",
      parameters: {
        type: "object",
        properties: {
          symbol: {
            type: "string",
            description: "Ticker symbol like BTC, ETH, SOL, DOGE, BEAT, or a CoinGecko id.",
          },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_weather_forecast",
      description:
        "Look up a weather forecast from Open-Meteo (free, no key). Call this when the bet hinges on weather (rain, temp) on a future date at a specific location. Returns daily min/max temp (°C), precipitation (mm), weather code.",
      parameters: {
        type: "object",
        properties: {
          latitude: { type: "number", description: "Decimal latitude of the location" },
          longitude: { type: "number", description: "Decimal longitude" },
          date: { type: "string", description: "Optional ISO date (YYYY-MM-DD). Omit for a 7-day forecast." },
        },
        required: ["latitude", "longitude"],
      },
    },
  },
];

/** Execute a tool by name. Returns the JSON we'll feed back to the LLM. */
export async function executeOracleTool(name: string, args: unknown): Promise<OracleToolResult> {
  const a = (args ?? {}) as Record<string, unknown>;
  switch (name) {
    case "check_crypto_price":
      return checkCryptoPrice({ symbol: String(a.symbol ?? "") });
    case "check_weather_forecast":
      return checkWeatherForecast({
        latitude: Number(a.latitude),
        longitude: Number(a.longitude),
        date: typeof a.date === "string" ? a.date : undefined,
      });
    default:
      return { ok: false, source: "unknown", error: `No tool named "${name}"` };
  }
}

/** Pretty-print a tool result into a UI-friendly attachment, if we can. */
export function toAttachment(r: OracleToolResult): OracleAttachment | null {
  if (!r.ok || !r.data) return null;
  if (r.source === "CoinGecko") {
    const d = r.data as { symbol?: string; assetName?: string; priceUsd?: number; publicUrl?: string; queriedAt?: string };
    return {
      source: "CoinGecko",
      label: `${d.symbol}${d.assetName ? ` (${d.assetName})` : ""}/USD spot price`,
      currentValue: typeof d.priceUsd === "number" ? formatUsd(d.priceUsd) : undefined,
      oracleUrl: d.publicUrl,
      queriedAt: d.queriedAt ?? new Date().toISOString(),
    };
  }
  if (r.source === "Open-Meteo") {
    const d = r.data as { forecast?: Array<{ date: string; tempMaxC: number | null; precipitationMm: number | null }>; publicUrl?: string; queriedAt?: string };
    const first = d.forecast?.[0];
    return {
      source: "Open-Meteo",
      label: first ? `Forecast ${first.date}` : "Weather forecast",
      currentValue: first && typeof first.tempMaxC === "number"
        ? `${first.tempMaxC}°C · ${first.precipitationMm ?? 0}mm rain`
        : undefined,
      oracleUrl: d.publicUrl,
      queriedAt: d.queriedAt ?? new Date().toISOString(),
    };
  }
  return null;
}
