import {
  DATA_SOURCE_TOPICS,
  type AdapterStatus,
  type DataSourceTopic,
} from "@/lib/data-source-catalog";
import { LIVE_FETCH_DATA_SOURCE_KEY_SET } from "@/lib/data-source-adapter-keys";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type DataSourceResolutionMethod = DataSourceTopic["resolutionMethod"];

export type RegisteredDataSource = {
  sourceKey: string;
  topicKey: string;
  promptExample: string;
  provider: string;
  endpoint: string;
  docsUrl: string;
  adapterStatus: AdapterStatus;
  resolutionMethod: DataSourceResolutionMethod;
  requiredFields: string[];
  autoSettleAllowed: boolean;
  connectionStatus:
    | "auto_settle_implemented"
    | "live_fetch_connected"
    | "oauth_required"
    | "api_key_required"
    | "provider_contract_required"
    | "document_ai_required"
    | "adapter_scaffolded";
  accuracyModel: "deterministic_api" | "user_authorized_api" | "document_extraction" | "manual_review";
  limitation: string;
};

export type DataSourceMatch = {
  source: RegisteredDataSource;
  matchedBy: "implemented_core" | "catalog_keyword" | "catalog_source_key" | "none";
  confidence: number;
  autoSettlementGate: {
    allowed: boolean;
    reason: string;
  };
};

const CORE_IMPLEMENTED_SOURCES: RegisteredDataSource[] = [
  {
    sourceKey: "crypto_price_coingecko",
    topicKey: "crypto_price_threshold",
    promptExample: "Will BTC go above $100,000 tomorrow?",
    provider: "CoinGecko",
    endpoint: "https://api.coingecko.com/api/v3/simple/price",
    docsUrl: "https://docs.coingecko.com/reference/simple-price",
    adapterStatus: "implemented",
    resolutionMethod: "public_api_oracle",
    requiredFields: ["coingecko_id", "symbol", "target_usd", "condition", "settlement_time"],
    autoSettleAllowed: true,
    connectionStatus: "auto_settle_implemented",
    accuracyModel: "deterministic_api",
    limitation: "Only deterministic after the asset id, target, condition, and settlement time are locked.",
  },
  {
    sourceKey: "weather_open_meteo",
    topicKey: "weather_threshold",
    promptExample: "Will it rain in Seattle tomorrow?",
    provider: "Open-Meteo",
    endpoint: "https://api.open-meteo.com/v1/forecast",
    docsUrl: "https://open-meteo.com/en/docs",
    adapterStatus: "implemented",
    resolutionMethod: "public_api_oracle",
    requiredFields: ["latitude", "longitude", "date", "metric", "target_value", "condition"],
    autoSettleAllowed: true,
    connectionStatus: "auto_settle_implemented",
    accuracyModel: "deterministic_api",
    limitation: "Weather forecasts can change before settlement; final judgment must use the locked date/location metric snapshot.",
  },
];

function registeredFromCatalog(topic: DataSourceTopic): RegisteredDataSource {
  const resolutionMethod = topic.resolutionMethod;
  const adapterStatus = topic.dataSource.adapterStatus;
  const accuracyModel: RegisteredDataSource["accuracyModel"] =
    resolutionMethod === "oauth_user_api"
      ? "user_authorized_api"
      : resolutionMethod === "document_ocr"
        ? "document_extraction"
        : adapterStatus === "implemented"
          ? "deterministic_api"
          : "manual_review";

  return {
    sourceKey: topic.dataSource.sourceKey,
    topicKey: topic.topicKey,
    promptExample: topic.prompt,
    provider: topic.dataSource.provider,
    endpoint: topic.dataSource.endpoint,
    docsUrl: topic.dataSource.docsUrl,
    adapterStatus,
    resolutionMethod,
    requiredFields: topic.dataSource.requiredFields,
    autoSettleAllowed: adapterStatus === "implemented" && resolutionMethod === "public_api_oracle",
    connectionStatus: connectionStatusFor(topic),
    accuracyModel,
    limitation: limitationFor(topic),
  };
}

function connectionStatusFor(topic: DataSourceTopic): RegisteredDataSource["connectionStatus"] {
  if (topic.dataSource.adapterStatus === "implemented" && topic.resolutionMethod === "public_api_oracle") {
    return "auto_settle_implemented";
  }
  if (LIVE_FETCH_DATA_SOURCE_KEY_SET.has(topic.dataSource.sourceKey)) return "live_fetch_connected";
  if (topic.resolutionMethod === "oauth_user_api") return "oauth_required";
  if (topic.resolutionMethod === "document_ocr") return "document_ai_required";
  if (/operator-specific|contract|required|platform export|partner API/i.test(`${topic.dataSource.endpoint} ${topic.dataSource.docsUrl}`)) {
    return "provider_contract_required";
  }
  if (/(api key|developer\.|portal|aviationstack|tomtom|wmata|wsdot|nrel|eia|fred|etherscan|covalent|reservoir|twitch|spotify|tmdb|open states|electricity maps)/i.test(`${topic.dataSource.provider} ${topic.dataSource.endpoint} ${topic.dataSource.docsUrl}`)) {
    return "api_key_required";
  }
  return "adapter_scaffolded";
}

function limitationFor(topic: DataSourceTopic): string {
  if (topic.dataSource.adapterStatus === "implemented") {
    return "Implemented adapter can auto-settle only when all required fields are locked and the provider returns a fresh usable response.";
  }
  if (LIVE_FETCH_DATA_SOURCE_KEY_SET.has(topic.dataSource.sourceKey)) {
    return "Raw live fetch is connected, but an outcome-specific evaluator is still required before automatic settlement can be enabled.";
  }
  if (topic.resolutionMethod === "oauth_user_api") {
    return "Requires the user to connect and authorize their account before any data can be fetched or judged.";
  }
  if (topic.resolutionMethod === "document_ocr") {
    return "Requires document/image extraction and confidence checks; not deterministic until the OCR adapter exists.";
  }
  if (/operator-specific|contract|required|platform export|partner API/i.test(`${topic.dataSource.endpoint} ${topic.dataSource.docsUrl}`)) {
    return "Requires a provider-specific contract, API key, export, or partner integration before automatic judgment.";
  }
  return "Public source is identified, but no runtime adapter is implemented yet; auto-settlement must be blocked.";
}

const CATALOG_SOURCES = DATA_SOURCE_TOPICS.map(registeredFromCatalog);
const ALL_SOURCES = [...CORE_IMPLEMENTED_SOURCES, ...CATALOG_SOURCES];
const SOURCE_BY_KEY = new Map(ALL_SOURCES.map((source) => [source.sourceKey, source]));

type KeywordRule = {
  sourceKey: string;
  confidence: number;
  pattern: RegExp;
};

const KEYWORD_RULES: KeywordRule[] = [
  { sourceKey: "crypto_price_coingecko", confidence: 0.96, pattern: /\b(?:btc|bitcoin|eth|ethereum|sol|solana|doge|xrp|bnb|link|avax|token|coin|ticker|crypto|price)\b|[$#][a-z0-9-]{2,15}/i },
  { sourceKey: "weather_open_meteo", confidence: 0.96, pattern: /\b(?:weather|rain|raining|temperature|temp|precipitation|forecast)\b|天气|下雨|降雨|气温|温度/i },
  { sourceKey: "usgs_earthquake", confidence: 0.88, pattern: /\b(?:earthquake|magnitude|seismic|quake)\b/i },
  { sourceKey: "usgs_volcano_notice", confidence: 0.84, pattern: /\b(?:volcano|volcanic|kilauea|eruption|alert level)\b/i },
  { sourceKey: "openaq_measurements", confidence: 0.86, pattern: /\b(?:pm2\.?5|air quality|aqi|pollution)\b/i },
  { sourceKey: "nasa_firms", confidence: 0.84, pattern: /\b(?:wildfire|fire hotspot|firms)\b/i },
  { sourceKey: "noaa_water_prediction", confidence: 0.84, pattern: /\b(?:river|flood stage|gauge height|water level)\b/i },
  { sourceKey: "noaa_tides_currents", confidence: 0.84, pattern: /\b(?:tide|harbor high tide|tidal)\b/i },
  { sourceKey: "nhc_active_storms", confidence: 0.84, pattern: /\b(?:hurricane|tropical storm|storm watch|storm warning)\b/i },
  { sourceKey: "noaa_swpc_flare", confidence: 0.84, pattern: /\b(?:solar flare|m-class|x-class flare)\b/i },
  { sourceKey: "noaa_swpc_kp", confidence: 0.84, pattern: /\b(?:kp index|geomagnetic)\b/i },
  { sourceKey: "mta_gtfs_realtime", confidence: 0.84, pattern: /\b(?:subway|train arrive|gtfs|times square)\b/i },
  { sourceKey: "gbfs_station_status", confidence: 0.84, pattern: /\b(?:bike share|citi bike|open docks|gbfs)\b/i },
  { sourceKey: "aviationstack_flight_status", confidence: 0.82, pattern: /\b(?:flight|cancelled|departure|arrive|airline)\b/i },
  { sourceKey: "openfda_food_enforcement", confidence: 0.88, pattern: /\b(?:fda|food recall|class i recall|recall)\b/i },
  { sourceKey: "cpsc_recalls", confidence: 0.82, pattern: /\b(?:cpsc|product recall|consumer product)\b/i },
  { sourceKey: "sec_edgar_submissions", confidence: 0.9, pattern: /\b(?:sec|edgar|8-k|10-k|10-q|filing|file an)\b/i },
  { sourceKey: "fred_dgs10", confidence: 0.86, pattern: /\b(?:10-year treasury|treasury yield|dgs10)\b/i },
  { sourceKey: "bls_cpi", confidence: 0.86, pattern: /\b(?:cpi|consumer price index|inflation print)\b/i },
  { sourceKey: "eia_gasoline", confidence: 0.84, pattern: /\b(?:gasoline price|gas price|eia)\b/i },
  { sourceKey: "npm_registry_package", confidence: 0.88, pattern: /\b(?:npm package|npm download|npm registry)\b/i },
  { sourceKey: "pypi_json", confidence: 0.86, pattern: /\b(?:pypi|python package|python release|package downloads)\b/i },
  { sourceKey: "dockerhub_tags", confidence: 0.84, pattern: /\b(?:docker hub|docker pull|container image|docker image)\b/i },
  { sourceKey: "github_releases", confidence: 0.9, pattern: /\b(?:github release|repo(?:sitory)? release|publish a release)\b/i },
  { sourceKey: "stripe_invoice", confidence: 0.9, pattern: /\b(?:stripe invoice|invoice .*paid|in_[a-z0-9]+)\b/i },
  { sourceKey: "shopify_orders", confidence: 0.86, pattern: /\b(?:shopify|paid orders|store orders)\b/i },
  { sourceKey: "linear_graphql", confidence: 0.86, pattern: /\b(?:linear issue|eng-\d+|move to done)\b/i },
  { sourceKey: "jira_agile_sprint", confidence: 0.86, pattern: /\b(?:jira|sprint|story points)\b/i },
  { sourceKey: "notion_database_query", confidence: 0.84, pattern: /\b(?:notion|habit database)\b/i },
  { sourceKey: "google_calendar_events", confidence: 0.86, pattern: /\b(?:google calendar|calendar meeting|attend every)\b/i },
  { sourceKey: "slack_reactions", confidence: 0.84, pattern: /\b(?:slack|thumbs-up|reaction)\b/i },
  { sourceKey: "google_document_ai_receipt", confidence: 0.82, pattern: /\b(?:receipt|invoice image|total after tax)\b/i },
  { sourceKey: "oura_sleep", confidence: 0.84, pattern: /\b(?:oura|sleep score)\b/i },
  { sourceKey: "fitbit_sleep", confidence: 0.84, pattern: /\b(?:fitbit|hours of sleep|sleep log)\b/i },
  { sourceKey: "cloudflare_dns_over_https", confidence: 0.88, pattern: /\b(?:dns|txt record|domain .*record)\b/i },
  { sourceKey: "crtsh_certificate_transparency", confidence: 0.86, pattern: /\b(?:ssl certificate|certificate expiring|crt\.sh)\b/i },
  { sourceKey: "http_robots_txt", confidence: 0.86, pattern: /\b(?:robots\.txt|disallow)\b/i },
  { sourceKey: "rss_atom_feed", confidence: 0.82, pattern: /\b(?:rss|atom feed|feed publish)\b/i },
];

function gateFor(source: RegisteredDataSource): DataSourceMatch["autoSettlementGate"] {
  if (source.autoSettleAllowed) {
    return {
      allowed: true,
      reason: `${source.provider} adapter is implemented and can auto-settle only after required fields are locked.`,
    };
  }
  if (source.adapterStatus === "oauth_required") {
    return {
      allowed: false,
      reason: `${source.provider} requires user OAuth/account authorization before judging; no auto-settlement until that adapter exists and the user connects it.`,
    };
  }
  if (source.connectionStatus === "live_fetch_connected") {
    return {
      allowed: true,
      reason: `${source.provider} live fetch is connected; auto-settlement is allowed only when the router fetch succeeds, the selected AI judge explains the result from returned data, and protocol gates pass.`,
    };
  }
  return {
    allowed: false,
    reason: `${source.provider} is identified, but adapterStatus=${source.adapterStatus}; no auto-settlement until a runtime adapter is implemented and verified.`,
  };
}

export function listDataSourceAdapters() {
  return [...ALL_SOURCES];
}

export function getDataSourceAdapter(sourceKey: string) {
  return SOURCE_BY_KEY.get(sourceKey) ?? null;
}

export function implementedDataSourceAdapters() {
  return ALL_SOURCES.filter((source) => source.adapterStatus === "implemented");
}

export function canAutoSettleWithDataSource(sourceKey: string) {
  const source = getDataSourceAdapter(sourceKey);
  return Boolean(source?.autoSettleAllowed || source?.connectionStatus === "live_fetch_connected");
}

export function resolveDataSourceForPrompt(prompt: string): DataSourceMatch | null {
  const text = prompt.trim();
  if (!text) return null;
  for (const source of ALL_SOURCES) {
    if (new RegExp(`\\b${source.sourceKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text)) {
      return {
        source,
        matchedBy: "catalog_source_key",
        confidence: 0.92,
        autoSettlementGate: gateFor(source),
      };
    }
  }
  for (const rule of KEYWORD_RULES) {
    const source = getDataSourceAdapter(rule.sourceKey);
    if (source && rule.pattern.test(text)) {
      return {
        source,
        matchedBy: source.adapterStatus === "implemented" ? "implemented_core" : "catalog_keyword",
        confidence: rule.confidence,
        autoSettlementGate: gateFor(source),
      };
    }
  }
  return null;
}

export function summarizeDataSourceCoverage() {
  return ALL_SOURCES.reduce<Record<string, number>>((acc, source) => {
    acc.total = (acc.total ?? 0) + 1;
    acc[`adapterStatus:${source.adapterStatus}`] = (acc[`adapterStatus:${source.adapterStatus}`] ?? 0) + 1;
    acc[`resolutionMethod:${source.resolutionMethod}`] = (acc[`resolutionMethod:${source.resolutionMethod}`] ?? 0) + 1;
    acc[`connectionStatus:${source.connectionStatus}`] = (acc[`connectionStatus:${source.connectionStatus}`] ?? 0) + 1;
    if (source.autoSettleAllowed) acc.autoSettleAllowed = (acc.autoSettleAllowed ?? 0) + 1;
    return acc;
  }, {});
}

export function applyDataSourceGateToProtocol(protocol: ProtocolSpecV2): ProtocolSpecV2 {
  const wantsOracle =
    protocol.evidenceProtocol.mode === "public_oracle" ||
    protocol.evidenceProtocol.mode === "platform_metric" ||
    protocol.settlementProtocol.mode === "auto_oracle";
  if (!wantsOracle) return protocol;

  const sourceText = [
    protocol.rawPrompt,
    protocol.title,
    protocol.userFacingSummary,
    protocol.settlementProtocol.winCondition,
    ...protocol.settlementProtocol.judgeInstructions,
  ].join("\n");
  const match = resolveDataSourceForPrompt(sourceText);
  const missingReason = "No implemented data-source adapter matched this public-oracle protocol; manual review is required.";
  const allowed = Boolean(match?.autoSettlementGate.allowed);
  const reason = match?.autoSettlementGate.reason ?? missingReason;
  const source = match?.source;

  const dataSourceLines = source
    ? [
        `DATA_SOURCE_KEY: ${source.sourceKey}`,
        `DATA_SOURCE_PROVIDER: ${source.provider}`,
        `DATA_SOURCE_STATUS: ${source.adapterStatus}`,
        `DATA_SOURCE_ENDPOINT: ${source.endpoint}`,
        `DATA_SOURCE_REQUIRED_FIELDS: ${source.requiredFields.join(", ")}`,
      ]
    : ["DATA_SOURCE_STATUS: unmatched"];

  if (allowed) {
    return {
      ...protocol,
      settlementProtocol: {
        ...protocol.settlementProtocol,
        judgeInstructions: [
          ...protocol.settlementProtocol.judgeInstructions,
          ...dataSourceLines.filter((line) => !protocol.settlementProtocol.judgeInstructions.includes(line)),
        ],
      },
    };
  }

  return {
    ...protocol,
    settlementProtocol: {
      ...protocol.settlementProtocol,
      mode: "manual_review",
      judgeInstructions: [
        ...protocol.settlementProtocol.judgeInstructions,
        ...dataSourceLines.filter((line) => !protocol.settlementProtocol.judgeInstructions.includes(line)),
        `AUTO_SETTLEMENT_BLOCKED: ${reason}`,
      ],
      manualReviewTriggers: [
        ...new Set([
          ...protocol.settlementProtocol.manualReviewTriggers,
          reason,
        ]),
      ],
    },
    riskPolicy: {
      ...protocol.riskPolicy,
      warnings: [
        ...new Set([
          ...protocol.riskPolicy.warnings,
          "This challenge has an external truth source, but automatic settlement is disabled until the required adapter is implemented and verified.",
        ]),
      ],
      restrictions: [
        ...new Set([
          ...protocol.riskPolicy.restrictions,
          reason,
        ]),
      ],
    },
  };
}
