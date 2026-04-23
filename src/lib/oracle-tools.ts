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
 * CoinGecko — free tier, no key. Accepts common tickers (BTC, ETH, SOL…)
 * and returns current USD spot price.
 */
export async function checkCryptoPrice(args: { symbol: string }): Promise<OracleToolResult> {
  const raw = args.symbol?.trim().toLowerCase() || "";
  const id = COINGECKO_SYMBOL_MAP[raw] ?? raw; // fall through to raw in case AI passed the coingecko id directly
  if (!id) return { ok: false, source: "CoinGecko", error: "Missing symbol" };

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 7000);
    const res = await fetch(url, { signal: ac.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    if (!res.ok) return { ok: false, source: "CoinGecko", error: `HTTP ${res.status}` };
    const body = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number }>;
    const row = body[id];
    if (!row || typeof row.usd !== "number") {
      return { ok: false, source: "CoinGecko", error: `Unknown symbol "${args.symbol}"` };
    }
    return {
      ok: true,
      source: "CoinGecko",
      data: {
        symbol: args.symbol.toUpperCase(),
        coingeckoId: id,
        priceUsd: row.usd,
        change24hPct: row.usd_24h_change ?? null,
        queriedAt: new Date().toISOString(),
        publicUrl: `https://www.coingecko.com/en/coins/${id}`,
      },
    };
  } catch (e) {
    return { ok: false, source: "CoinGecko", error: e instanceof Error ? e.message : String(e) };
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
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
    timezone: "auto",
    ...(date ? { start_date: date, end_date: date } : {}),
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
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
            description: "Ticker symbol like BTC, ETH, SOL, DOGE, or a CoinGecko id.",
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
    const d = r.data as { symbol?: string; priceUsd?: number; publicUrl?: string; queriedAt?: string };
    return {
      source: "CoinGecko",
      label: `${d.symbol}/USD spot price`,
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
