import { getDataSourceAdapter, listDataSourceAdapters, type RegisteredDataSource } from "@/lib/data-source-registry";

export type DataSourceAdapterStatus =
  | "live"
  | "dry_run"
  | "requires_params"
  | "requires_api_key"
  | "requires_oauth"
  | "requires_provider_contract"
  | "requires_document_ai"
  | "adapter_scaffolded"
  | "manual_review"
  | "not_registered"
  | "error";

export type DataSourceAdapterResult = {
  ok: boolean;
  handled: boolean;
  sourceKey: string;
  provider?: string;
  endpoint?: string;
  status: DataSourceAdapterStatus;
  url?: string;
  httpStatus?: number;
  fetchedAt: string;
  requiredFields?: string[];
  missingFields?: string[];
  error?: string;
  data?: unknown;
};

type AdapterParams = Record<string, unknown>;

type LiveAdapter = {
  required: string[];
  buildUrl: (params: AdapterParams) => string;
  headers?: (params: AdapterParams) => HeadersInit;
  parse?: (response: Response, text: string) => unknown;
};

function stringParam(params: AdapterParams, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberParam(params: AdapterParams, key: string) {
  const value = params[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function encode(value: string | number) {
  return encodeURIComponent(String(value));
}

function query(base: string, params: Record<string, string | number | boolean | undefined | null>) {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function jsonOrText(response: Response, text: string) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function xmlOrText(_response: Response, text: string) {
  return text;
}

const LIVE_ADAPTERS: Record<string, LiveAdapter> = {
  usgs_earthquake: {
    required: ["latitude", "longitude", "radius_km", "min_magnitude", "start_time", "end_time"],
    buildUrl: (params) => query("https://earthquake.usgs.gov/fdsnws/event/1/query", {
      format: "geojson",
      latitude: numberParam(params, "latitude"),
      longitude: numberParam(params, "longitude"),
      maxradiuskm: numberParam(params, "radius_km"),
      minmagnitude: numberParam(params, "min_magnitude"),
      starttime: stringParam(params, "start_time"),
      endtime: stringParam(params, "end_time"),
    }),
  },
  noaa_swpc_flare: {
    required: [],
    buildUrl: () => "https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json",
  },
  noaa_swpc_kp: {
    required: [],
    buildUrl: () => "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json",
  },
  nhc_active_storms: {
    required: [],
    buildUrl: () => "https://www.nhc.noaa.gov/CurrentStorms.json",
  },
  noaa_ndbc: {
    required: ["station_id"],
    buildUrl: (params) => `https://www.ndbc.noaa.gov/data/realtime2/${encode(stringParam(params, "station_id") ?? "")}.txt`,
    parse: xmlOrText,
  },
  openfda_food_enforcement: {
    required: [],
    buildUrl: (params) => {
      const search = [
        stringParam(params, "classification") ? `classification:"${stringParam(params, "classification")}"` : null,
        stringParam(params, "product_description") ? `product_description:${stringParam(params, "product_description")}` : null,
      ].filter(Boolean).join("+AND+");
      return query("https://api.fda.gov/food/enforcement.json", {
        search: search || undefined,
        limit: numberParam(params, "limit") ?? 10,
      });
    },
  },
  cpsc_recalls: {
    required: [],
    buildUrl: (params) => query("https://www.saferproducts.gov/RestWebServices/Recall", {
      format: "json",
      ProductType: stringParam(params, "product_name") ?? undefined,
    }),
  },
  sec_edgar_submissions: {
    required: ["cik"],
    buildUrl: (params) => {
      const cik = (stringParam(params, "cik") ?? "").replace(/\D/g, "").padStart(10, "0");
      return `https://data.sec.gov/submissions/CIK${cik}.json`;
    },
    headers: () => ({ "user-agent": process.env.SEC_USER_AGENT || "AxelrodChallenge/0.1 contact@example.com" }),
  },
  bls_cpi: {
    required: [],
    buildUrl: () => "https://api.bls.gov/publicAPI/v2/timeseries/data/CUUR0000SA0",
  },
  bls_unrate: {
    required: [],
    buildUrl: () => "https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000",
  },
  courtlistener_recap: {
    required: ["docket_id"],
    buildUrl: (params) => `https://www.courtlistener.com/api/rest/v3/dockets/${encode(stringParam(params, "docket_id") ?? "")}/`,
  },
  npm_registry_package: {
    required: ["package"],
    buildUrl: (params) => `https://registry.npmjs.org/${encode(stringParam(params, "package") ?? "")}`,
  },
  dockerhub_tags: {
    required: ["repository"],
    buildUrl: (params) => {
      const repository = stringParam(params, "repository") ?? "";
      return query(`https://hub.docker.com/v2/repositories/${repository.replace(/^library\//, "library/")}/tags`, {
        page_size: numberParam(params, "limit") ?? 25,
      });
    },
  },
  pypi_json: {
    required: ["package"],
    buildUrl: (params) => `https://pypi.org/pypi/${encode(stringParam(params, "package") ?? "")}/json`,
  },
  wikimedia_pageviews: {
    required: ["project", "article", "start", "end"],
    buildUrl: (params) => {
      const project = stringParam(params, "project") ?? "en.wikipedia.org";
      const article = encode(stringParam(params, "article") ?? "");
      const start = stringParam(params, "start") ?? "";
      const end = stringParam(params, "end") ?? start;
      return `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${encode(project)}/all-access/user/${article}/daily/${encode(start)}/${encode(end)}`;
    },
  },
  arxiv_api: {
    required: ["query"],
    buildUrl: (params) => query("http://export.arxiv.org/api/query", {
      search_query: stringParam(params, "query"),
      max_results: numberParam(params, "limit") ?? 10,
    }),
    parse: xmlOrText,
  },
  crossref_works: {
    required: ["title_query"],
    buildUrl: (params) => query("https://api.crossref.org/works", {
      "query.title": stringParam(params, "title_query"),
      rows: numberParam(params, "limit") ?? 10,
    }),
  },
  hn_firebase: {
    required: ["item_id"],
    buildUrl: (params) => `https://hacker-news.firebaseio.com/v0/item/${encode(stringParam(params, "item_id") ?? "")}.json`,
  },
  stackexchange_questions: {
    required: ["question_id"],
    buildUrl: (params) => query(`https://api.stackexchange.com/2.3/questions/${encode(stringParam(params, "question_id") ?? "")}`, {
      site: stringParam(params, "site") ?? "stackoverflow",
      filter: "default",
    }),
  },
  steam_current_players: {
    required: ["app_id"],
    buildUrl: (params) => query("https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/", {
      appid: stringParam(params, "app_id"),
    }),
  },
  apple_rss_top_apps: {
    required: [],
    buildUrl: (params) => {
      const country = stringParam(params, "country") ?? "us";
      const limit = numberParam(params, "rank") ?? numberParam(params, "limit") ?? 10;
      return `https://rss.applemarketingtools.com/api/v2/${encode(country)}/apps/top-free/${encode(limit)}/apps.json`;
    },
  },
  github_releases: {
    required: ["owner", "repo"],
    buildUrl: (params) => `https://api.github.com/repos/${encode(stringParam(params, "owner") ?? "")}/${encode(stringParam(params, "repo") ?? "")}/releases`,
    headers: () => ({ "user-agent": "AxelrodChallenge/0.1" }),
  },
  cloudflare_dns_over_https: {
    required: ["domain", "record_type"],
    buildUrl: (params) => query("https://cloudflare-dns.com/dns-query", {
      name: stringParam(params, "domain"),
      type: stringParam(params, "record_type") ?? "TXT",
    }),
    headers: () => ({ accept: "application/dns-json" }),
  },
  crtsh_certificate_transparency: {
    required: ["domain"],
    buildUrl: (params) => query("https://crt.sh/", {
      q: stringParam(params, "domain"),
      output: "json",
    }),
  },
  http_robots_txt: {
    required: ["domain"],
    buildUrl: (params) => {
      const domain = stringParam(params, "domain") ?? "";
      return `https://${domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}/robots.txt`;
    },
    parse: xmlOrText,
  },
  rss_atom_feed: {
    required: ["feed_url"],
    buildUrl: (params) => stringParam(params, "feed_url") ?? "",
    parse: xmlOrText,
  },
};

function missingFields(required: string[], params: AdapterParams) {
  return required.filter((field) => {
    const value = params[field];
    return value === undefined || value === null || String(value).trim() === "";
  });
}

function statusForNonLiveSource(source: RegisteredDataSource): DataSourceAdapterStatus {
  if (source.connectionStatus === "oauth_required") return "requires_oauth";
  if (source.connectionStatus === "api_key_required") return "requires_api_key";
  if (source.connectionStatus === "provider_contract_required") return "requires_provider_contract";
  if (source.connectionStatus === "document_ai_required") return "requires_document_ai";
  return "adapter_scaffolded";
}

function nonLiveMessage(source: RegisteredDataSource) {
  if (source.connectionStatus === "oauth_required") return "User OAuth/account connection is required before this source can be fetched.";
  if (source.connectionStatus === "api_key_required") return "Provider API key or paid account is required before this source can be fetched.";
  if (source.connectionStatus === "provider_contract_required") return "Provider-specific endpoint/contract/export is required before this source can be fetched.";
  if (source.connectionStatus === "document_ai_required") return "Document/OCR adapter is required before this source can be fetched.";
  return source.limitation;
}

export function dataSourceAdapterCatalog() {
  return listDataSourceAdapters().map((source) => ({
    sourceKey: source.sourceKey,
    provider: source.provider,
    connectionStatus: source.connectionStatus,
    adapterStatus: source.adapterStatus,
    autoSettleAllowed: source.autoSettleAllowed,
    hasLiveFetch: Boolean(LIVE_ADAPTERS[source.sourceKey]),
    requiredFields: source.requiredFields,
    limitation: source.limitation,
  }));
}

export async function executeDataSourceAdapter(input: {
  sourceKey: string;
  params?: AdapterParams;
  dryRun?: boolean;
  timeoutMs?: number;
}): Promise<DataSourceAdapterResult> {
  const fetchedAt = new Date().toISOString();
  const source = getDataSourceAdapter(input.sourceKey);
  if (!source) {
    return {
      ok: false,
      handled: false,
      sourceKey: input.sourceKey,
      status: "not_registered",
      fetchedAt,
      error: `Unknown data source: ${input.sourceKey}`,
    };
  }

  const adapter = LIVE_ADAPTERS[source.sourceKey];
  const params = input.params ?? {};
  if (!adapter) {
    return {
      ok: false,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: statusForNonLiveSource(source),
      fetchedAt,
      requiredFields: source.requiredFields,
      error: nonLiveMessage(source),
    };
  }

  const missing = missingFields(adapter.required, params);
  if (missing.length > 0) {
    return {
      ok: false,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: "requires_params",
      fetchedAt,
      requiredFields: adapter.required,
      missingFields: missing,
      error: `Missing required adapter params: ${missing.join(", ")}`,
    };
  }

  const url = adapter.buildUrl(params);
  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      ok: false,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: "error",
      fetchedAt,
      requiredFields: adapter.required,
      error: "Adapter produced an invalid URL.",
    };
  }

  if (input.dryRun) {
    return {
      ok: true,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: "dry_run",
      url,
      fetchedAt,
      requiredFields: adapter.required,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: adapter.headers?.(params),
    });
    const text = await response.text();
    clearTimeout(timeout);
    return {
      ok: response.ok,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: response.ok ? "live" : "error",
      url,
      httpStatus: response.status,
      fetchedAt,
      requiredFields: adapter.required,
      error: response.ok ? undefined : `HTTP ${response.status}`,
      data: (adapter.parse ?? jsonOrText)(response, text),
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      ok: false,
      handled: true,
      sourceKey: source.sourceKey,
      provider: source.provider,
      endpoint: source.endpoint,
      status: "error",
      url,
      fetchedAt,
      requiredFields: adapter.required,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
