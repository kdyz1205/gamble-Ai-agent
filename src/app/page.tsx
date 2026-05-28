"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import CenteredComposer from "@/components/CenteredComposer";
import AuthModal from "@/components/AuthModal";
import BrandMark from "@/components/BrandMark";
import * as api from "@/lib/api-client";
import { challengeUsesChineseCopy } from "@/lib/challenge-display";
import { DEFAULT_LLM_PROVIDER_ID, LLM_PROVIDERS, getProviderById } from "@/lib/llm-providers";
import { readOracleLlmPrefs, writeOracleLlmPrefs } from "@/lib/oracle-prefs";
import { isOpenForOpponentStatus } from "@/lib/challenge-state-machine";
import { HOMEPAGE_CHALLENGE_LOOPS } from "@/lib/challenge-loop-catalog";

type AppState = "idle" | "generating" | "preview" | "confirming" | "published";
type OraclePrefs = { providerId: string; model: string | null };
type ModelAccessChoice = "free" | "premium";
type LanguageMode = api.ProtocolSpecV2["language"];
type DiscoveryLocationState = "checking" | "ready" | "global" | "blocked" | "unavailable";
type BrowserLocationStatus = "ready" | "blocked" | "timeout" | "unavailable" | "error";

const FREE_FALLBACK_AI_ACCESS: api.AiAccessStatus = {
  plan: "free",
  tier: "free",
  label: "Free",
  isPremium: false,
  role: "user",
  internalFlags: {
    developerOverride: false,
    premiumOverride: false,
    forcePremiumAll: false,
    creditsPurchased: false,
    stripeSubscription: false,
  },
  allowedModelTier: "free",
  isDeveloper: false,
  canUsePremiumModels: false,
  maxJudgeTier: 1,
  reason: "free beta account",
  freeTextModel: { providerId: "deepseek", model: "deepseek-v4-flash" },
  freeVisionModel: { providerId: "google", model: "gemini-3.1-flash-lite" },
  premiumTextModel: { providerId: "deepseek", model: "deepseek-v4-pro" },
  premiumVisionModel: { providerId: "openai", model: "gpt-5.5" },
  upgradeRequiredMessage:
    "This challenge needs a Premium judge model. Free mode uses slower low-cost models and may ask for manual review instead of forcing a weak verdict.",
};

const COMPILE_REQUEST_TIMEOUT_MS = 45_000;

const MODEL_TEXT_ALIASES: Array<{ pattern: RegExp; providerId: string }> = [
  { pattern: /^(?:local|llama|ollama)$/i, providerId: "local_ollama" },
  { pattern: /^(?:deepseek|deep seeker)$/i, providerId: "deepseek" },
  { pattern: /^(?:kimi|moonshot)$/i, providerId: "moonshot" },
  { pattern: /^(?:gpt|openai|premium)$/i, providerId: "openai" },
  { pattern: /^(?:claude|anthropic)$/i, providerId: "anthropic" },
];

const PREFERRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "gpt-4o-mini": "gpt-5.4-mini",
  "gpt-4o": "gpt-5.5",
  "o4-mini": "gpt-5.4-mini",
  "o3-mini": "gpt-5.4-mini",
  "claude-sonnet-4-20250514": "claude-sonnet-4-6",
  "claude-opus-4-20250514": "claude-opus-4-7",
  "gemini-2.0-flash": "gemini-3.5-flash",
  "gemini-2.5-flash": "gemini-3.5-flash",
  "gemini-2.5-pro": "gemini-3.1-pro",
  "gemini-2.5-pro-preview-05-06": "gemini-3.1-pro",
  "kimi-k2-0711-preview": "kimi-k2.6",
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
  "deepseek-v4-flash": "deepseek-v4-pro",
};

const REFERRAL_STORAGE_KEY = "axelrod_referral";
const GTM_STORAGE_KEY = "axelrod_gtm";
const MODEL_TIER_STORAGE_KEY = "axelrod_model_tier";

function withLaunchTracking(path: string, username?: string | null) {
  if (typeof window === "undefined") return path;
  const url = new URL(path, window.location.origin);
  if (username) url.searchParams.set("ref", username);
  url.searchParams.set("utm_source", "invite");
  url.searchParams.set("utm_medium", "share");
  url.searchParams.set("utm_campaign", "beta_launch");
  return url.toString();
}

function readStoredGtm() {
  if (typeof window === "undefined") return { ref: "", source: "", campaign: "", landingUrl: "" };
  const storedRef = window.localStorage.getItem(REFERRAL_STORAGE_KEY) || "";
  const stored = window.localStorage.getItem(GTM_STORAGE_KEY);
  if (!stored) return { ref: storedRef, source: "", campaign: "", landingUrl: window.location.href };
  try {
    const parsed = JSON.parse(stored) as { source?: string; campaign?: string; landingUrl?: string };
    return {
      ref: storedRef,
      source: parsed.source || "",
      campaign: parsed.campaign || "",
      landingUrl: parsed.landingUrl || window.location.href,
    };
  } catch {
    return { ref: storedRef, source: "", campaign: "", landingUrl: window.location.href };
  }
}

function initialOraclePrefs(): OraclePrefs {
  const prefs = readOracleLlmPrefs();
  const provider = (prefs.providerId ? getProviderById(prefs.providerId) : undefined) ?? getProviderById(DEFAULT_LLM_PROVIDER_ID);
  const storedModel = prefs.model?.trim() || "";
  const preferredStoredModel = PREFERRED_MODEL_REPLACEMENTS[storedModel] ?? storedModel;
  const modelIsCurrent =
    preferredStoredModel &&
    (!provider?.models.length || provider.models.includes(preferredStoredModel));
  return {
    providerId: provider?.id ?? DEFAULT_LLM_PROVIDER_ID,
    model: modelIsCurrent ? preferredStoredModel : provider?.defaultModel ?? null,
  };
}

function initialModelAccessChoice(): ModelAccessChoice {
  if (typeof window === "undefined") return "free";
  return window.localStorage.getItem(MODEL_TIER_STORAGE_KEY) === "premium" ? "premium" : "free";
}

function writeModelAccessChoice(value: ModelAccessChoice) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MODEL_TIER_STORAGE_KEY, value);
}

function resolveAccessTierPrefs(
  aiAccess: api.AiAccessStatus | null,
  tier: ModelAccessChoice,
  fallback: OraclePrefs,
): OraclePrefs {
  const model = tier === "premium" ? aiAccess?.premiumTextModel : aiAccess?.freeTextModel;
  return model ? { providerId: model.providerId, model: model.model } : fallback;
}

function shortAiError(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error || ""))
    .replace(/^AI protocol compilation failed:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/UserDailyQuota|Foreign key constraint|constraint violated|Session user/i.test(message)) {
    return "Your local session is stale. Sign out and sign in again before creating a challenge.";
  }
  if (/Daily AI limit reached/i.test(message)) {
    const reset = message.match(/resets at ([^.]+)\.?/i)?.[1];
    return `Daily AI limit reached${reset ? ` until ${reset}` : ""}. Use Free/Premium accordingly or try after reset.`;
  }
  if (/premium|upgrade|needs premium|requires premium/i.test(message)) {
    return "Premium model required. Free mode uses low-cost AI for simple drafts and verdicts.";
  }
  if (/insufficient_quota|exceeded your current quota/i.test(message)) {
    return "The selected AI provider has no API credits right now. Try DeepSeek/Free AI or add provider billing.";
  }
  if (/ByteString|value of 65279|invalid character/i.test(message)) {
    return "AI provider key has hidden characters. Retry after the latest deploy cleans the key automatically.";
  }
  if (/quota/i.test(message)) {
    return message || "AI quota check failed. Refresh and try again.";
  }
  if (/not configured|no configured ai provider|api key/i.test(message)) {
    return "AI routing is not connected yet. Try again later.";
  }
  if (/rate limit|429/i.test(message)) {
    return "AI is rate limited. Try again shortly.";
  }
  if (/AbortError|aborted|cancelled|canceled/i.test(message)) {
    return "AI draft request stopped before it finished. Try again, or refresh if the page was open during a deploy.";
  }
  if (/timed out|timeout/i.test(message)) {
    return "AI draft request timed out before the server returned a result. Try again, or refresh if the page was open during a deploy.";
  }
  return message || "Could not generate challenge.";
}

function providerFromAlias(value: string) {
  const normalized = value.trim();
  return MODEL_TEXT_ALIASES.find((item) => item.pattern.test(normalized))?.providerId ?? null;
}

function extractModelDirective(input: string): { prompt: string; prefs: OraclePrefs | null } {
  const prefix = input.match(/^\s*(?:\/model|use model|use|using)\s+([a-zA-Z ]+?)\s*[:,-]\s*(.+)$/i);
  if (prefix) {
    const providerId = providerFromAlias(prefix[1]);
    const provider = providerId ? getProviderById(providerId) : null;
    if (providerId && provider) return { prompt: prefix[2].trim(), prefs: { providerId, model: provider.defaultModel } };
  }

  const suffix = input.match(/^(.+?)\s+(?:\/model|use model|use|using)\s+([a-zA-Z ]+)\s*$/i);
  if (suffix) {
    const providerId = providerFromAlias(suffix[2]);
    const provider = providerId ? getProviderById(providerId) : null;
    if (providerId && provider) return { prompt: suffix[1].trim(), prefs: { providerId, model: provider.defaultModel } };
  }

  return { prompt: input.trim(), prefs: null };
}

function detectPromptLanguage(input: string): LanguageMode {
  if (/[\u3400-\u9FFF]/.test(input)) return "zh";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
}

function resolveCompileLanguage(input: string, languageMode?: LanguageMode): LanguageMode {
  if (languageMode && languageMode !== "auto") return languageMode;
  return detectPromptLanguage(input);
}

function protocolLanguageLabel(language: LanguageMode | null | undefined) {
  if (language === "zh") return "中文";
  if (language === "en") return "English";
  return "Auto";
}

function protocolLanguageStatus(language: LanguageMode | null | undefined) {
  if (language === "zh") return "Chinese";
  if (language === "en") return "English";
  return "Auto";
}

function requestBrowserLocation(timeoutMs = 3500): Promise<{
  snapshot: api.LocationSnapshot | null;
  status: BrowserLocationStatus;
}> {
  if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ snapshot: null, status: "unavailable" });
  }
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ snapshot: null, status: "timeout" });
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          resolve({ snapshot: { lat, lng }, status: "ready" });
        } else {
          resolve({ snapshot: null, status: "error" });
        }
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({
          snapshot: null,
          status: err.code === err.PERMISSION_DENIED
            ? "blocked"
            : err.code === err.TIMEOUT ? "timeout" : "error",
        });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

async function getBrowserLocationSnapshot(timeoutMs = 3500): Promise<api.LocationSnapshot | null> {
  const result = await requestBrowserLocation(timeoutMs);
  return result.snapshot;
}

export default function Home() {
  const router = useRouter();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const sessionLoading = sessionStatus === "loading";
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;
  const user = useMemo(
    () => rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined,
    [rawUser],
  );

  const [appState, setAppState] = useState<AppState>("idle");
  const [prompt, setPrompt] = useState("");
  const [protocol, setProtocol] = useState<api.ProtocolSpecV2 | null>(null);
  const [specModel, setSpecModel] = useState("");
  const [specProviderId, setSpecProviderId] = useState("");
  const [providerCall, setProviderCall] = useState<unknown>(null);
  const [oraclePrefs, setOraclePrefs] = useState<OraclePrefs>(() => initialOraclePrefs());
  const [modelAccessChoice, setModelAccessChoice] = useState<ModelAccessChoice>(() => initialModelAccessChoice());
  const [debugModelOverride, setDebugModelOverride] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedKind, setPublishedKind] = useState<"challenge" | "event">("challenge");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [launchNotice, setLaunchNotice] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [openChallenges, setOpenChallenges] = useState<api.ChallengeData[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [dailyQuota, setDailyQuota] = useState<api.DailyAiQuotaStatus | null>(null);
  const [aiAccess, setAiAccess] = useState<api.AiAccessStatus | null>(null);
  const visibleAiAccess = aiAccess ?? FREE_FALLBACK_AI_ACCESS;
  const effectiveOraclePrefs = useMemo<OraclePrefs>(() => {
    if ((visibleAiAccess.isDeveloper || visibleAiAccess.role === "admin") && debugModelOverride) {
      return oraclePrefs;
    }
    if (modelAccessChoice === "premium" && visibleAiAccess.canUsePremiumModels) {
      return resolveAccessTierPrefs(visibleAiAccess, "premium", oraclePrefs);
    }
    return resolveAccessTierPrefs(visibleAiAccess, "free", oraclePrefs);
  }, [debugModelOverride, modelAccessChoice, oraclePrefs, visibleAiAccess]);
  const joiningId: string | null = null;
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<DiscoveryLocationState>("checking");
  const [referralNotice, setReferralNotice] = useState("");
  const [personalInviteLink, setPersonalInviteLink] = useState("");
  const [referralStats, setReferralStats] = useState<{
    invitedCount: number;
    bonusEarned: number;
    inviteLink: string | null;
  } | null>(null);
  const [paymentPolicy, setPaymentPolicy] = useState<api.PaymentPolicyStatus | null>(null);
  const compileAbortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    compileAbortRef.current?.abort();
    compileAbortRef.current = null;
    setAppState("idle");
    setPrompt("");
    setProtocol(null);
    setSpecModel("");
    setSpecProviderId("");
    setProviderCall(null);
    setShareLink(null);
    setPublishedId(null);
    setPublishedKind("challenge");
    setError(null);
    setCopied(false);
    setCopyNotice("");
    setLaunchNotice("");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const ref = (url.searchParams.get("ref") || url.searchParams.get("r") || "").trim().replace(/^@+/, "");
    const source = url.searchParams.get("utm_source") || "";
    const campaign = url.searchParams.get("utm_campaign") || "";
    if (ref) {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
      window.localStorage.setItem(GTM_STORAGE_KEY, JSON.stringify({
        source,
        campaign,
        landingUrl: window.location.href,
      }));
    }
  }, []);

  useEffect(() => {
    setPersonalInviteLink(user?.username ? withLaunchTracking("/", user.username) : "");
  }, [user?.username]);

  const refreshReferralStats = useCallback(async () => {
    if (!user?.id) {
      setReferralStats(null);
      return;
    }
    try {
      const stats = await api.getReferralStats();
      setReferralStats({
        invitedCount: stats.invitedCount,
        bonusEarned: stats.bonusEarned,
        inviteLink: stats.inviteLink,
      });
      if (stats.inviteLink) setPersonalInviteLink(stats.inviteLink);
    } catch {
      setReferralStats(null);
    }
  }, [user?.id]);

  useEffect(() => {
    void refreshReferralStats();
  }, [refreshReferralStats]);

  useEffect(() => {
    let cancelled = false;
    api.getPaymentPolicy()
      .then((policy) => {
        if (!cancelled) setPaymentPolicy(policy);
      })
      .catch(() => {
        if (!cancelled) setPaymentPolicy(null);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const stored = readStoredGtm();
    if (!stored.ref) return;
    let cancelled = false;
    api.claimReferral({
      ref: stored.ref,
      source: stored.source || "invite",
      campaign: stored.campaign || "beta_launch",
      landingUrl: stored.landingUrl,
    })
      .then(async (res) => {
        if (cancelled) return;
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
        window.localStorage.removeItem(GTM_STORAGE_KEY);
        if (res.claimed) {
          setReferralNotice(`Invite bonus unlocked: +${res.bonus ?? 10} pts from ${res.referrer?.username || "your friend"}.`);
          await updateSession();
          await refreshReferralStats();
        }
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [refreshReferralStats, updateSession, user?.id]);

  useEffect(() => {
    if (!user || sessionLoading) {
      setDailyQuota(null);
      setAiAccess(null);
      return;
    }
    let cancelled = false;
    api.getCredits()
      .then((res) => {
        if (!cancelled) {
          setDailyQuota(res.dailyQuota);
          setAiAccess(res.aiAccess ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDailyQuota(null);
          setAiAccess(null);
        }
      });
    return () => { cancelled = true; };
  }, [sessionLoading, user]);

  useEffect(() => {
    const freeModel = aiAccess?.freeTextModel;
    if (!aiAccess) return;
    if (!aiAccess.canUsePremiumModels) {
      setModelAccessChoice("free");
      writeModelAccessChoice("free");
      setDebugModelOverride(false);
    } else if (typeof window !== "undefined" && !window.localStorage.getItem(MODEL_TIER_STORAGE_KEY)) {
      setModelAccessChoice("premium");
      writeModelAccessChoice("premium");
    }
    if (!freeModel || aiAccess.canUsePremiumModels || (oraclePrefs.providerId === freeModel.providerId && oraclePrefs.model === freeModel.model)) return;
    const freePrefs = { providerId: freeModel.providerId, model: freeModel.model };
    setOraclePrefs(freePrefs);
    writeOracleLlmPrefs(freePrefs.providerId, freePrefs.model);
  }, [aiAccess, oraclePrefs]);

  const handleGenerate = useCallback(async (input: string, languageMode?: LanguageMode) => {
    if (!user) {
      setError("Sign in to use AI drafts.");
      setShowAuth(true);
      return;
    }
    const directive = extractModelDirective(input);
    const nextPrefs = directive.prefs ?? effectiveOraclePrefs;
    if (directive.prefs) {
      setOraclePrefs(directive.prefs);
      setDebugModelOverride(true);
      writeOracleLlmPrefs(directive.prefs.providerId, directive.prefs.model ?? "");
    }
    setPrompt(directive.prompt);
    setError(null);
    setAppState("generating");
    compileAbortRef.current?.abort();
    const controller = new AbortController();
    compileAbortRef.current = controller;
    const timeout = window.setTimeout(
      () => controller.abort(new DOMException("AI compile request timed out", "TimeoutError")),
      COMPILE_REQUEST_TIMEOUT_MS,
    );
    try {
      const res = await api.compileChallengeProtocol(directive.prompt, {
        ...nextPrefs,
        language: resolveCompileLanguage(directive.prompt, languageMode),
        context: {
          surface: "homepage_composer",
          flow: "draft_before_create",
        },
        signal: controller.signal,
      });
      if (!res.protocol || res.source === "error") {
        throw new Error("AI protocol compilation did not complete with the selected provider/model. No draft was created.");
      }
      setProtocol(res.protocol);
      setSpecModel(res.model);
      setSpecProviderId(res.providerId || nextPrefs.providerId);
      setProviderCall(res.providerCall ?? null);
      if (res.dailyQuota) setDailyQuota(res.dailyQuota);
      if (res.aiAccess) setAiAccess(res.aiAccess);
      if (res.modelAccess?.downgraded) {
        const downgradedPrefs = { providerId: res.modelAccess.providerId, model: res.modelAccess.model };
        setOraclePrefs(downgradedPrefs);
        writeOracleLlmPrefs(downgradedPrefs.providerId, downgradedPrefs.model);
      }
      setAppState("preview");
    } catch (err) {
      setError(shortAiError(err));
      setAppState("idle");
    } finally {
      window.clearTimeout(timeout);
      if (compileAbortRef.current === controller) compileAbortRef.current = null;
    }
  }, [effectiveOraclePrefs, user]);

  const handleCancelGenerate = useCallback(() => {
    compileAbortRef.current?.abort(new DOMException("AI draft generation cancelled", "AbortError"));
    compileAbortRef.current = null;
    setError("AI draft generation was stopped. Try again when you are ready.");
    setAppState("idle");
  }, []);

  const handleLaunchPrompt = useCallback((value: string) => {
    setPrompt(value);
    void handleGenerate(value);
  }, [handleGenerate]);

  const handleSelectOracle = useCallback((providerId: string, model?: string | null) => {
    const provider = getProviderById(providerId);
    if (!provider) return;
    const requestedModel = model?.trim() || provider.defaultModel;
    const preferredModel = PREFERRED_MODEL_REPLACEMENTS[requestedModel] ?? requestedModel;
    const safeModel =
      preferredModel && (!provider.models.length || provider.models.includes(preferredModel))
        ? preferredModel
        : provider.defaultModel;
    const nextPrefs = { providerId, model: safeModel };
    setOraclePrefs(nextPrefs);
    setDebugModelOverride(true);
    writeOracleLlmPrefs(nextPrefs.providerId, nextPrefs.model);
  }, []);

  const handleSelectModelAccess = useCallback((tier: ModelAccessChoice) => {
    if (tier === "premium" && !visibleAiAccess.canUsePremiumModels) {
      setError(visibleAiAccess.upgradeRequiredMessage || "Premium AI needs an active Premium plan.");
      return;
    }
    const nextPrefs = resolveAccessTierPrefs(visibleAiAccess, tier, oraclePrefs);
    setModelAccessChoice(tier);
    setDebugModelOverride(false);
    setOraclePrefs(nextPrefs);
    writeModelAccessChoice(tier);
    writeOracleLlmPrefs(nextPrefs.providerId, nextPrefs.model ?? "");
    setError(null);
  }, [oraclePrefs, visibleAiAccess]);

  const handleConfirm = useCallback(async () => {
    if (!protocol) return;
    if (!user) {
      setShowAuth(true);
      return;
    }

    setError(null);
    setAppState("confirming");
    try {
      const usesLocation = protocol.locationProtocol.mode !== "none";
      const isDiscoverable = ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode);
      const isPublic = isDiscoverable || protocol.participantMode === "mass_crowd" || protocol.participantMode === "public_market";
      const locationSnapshot = usesLocation ? await getBrowserLocationSnapshot() : null;
      const res = await api.createChallenge({
        protocol,
        rawPrompt: protocol.rawPrompt || prompt,
        compilerProviderId: specProviderId,
        compilerModel: specModel,
        providerCall,
        marketType: "ai_peer_challenge",
        stake: 0,
        stakeToken: "credits",
        proofSource: protocol.evidenceProtocol.mode === "same_camera_video" ? "shared_same_camera" : "both_participants",
        arbiter: "ai_then_manual_review",
        aiReview: true,
        isPublic,
        visibility: isPublic ? "public" : "invite_only",
        ...(locationSnapshot
          ? { discoveryLat: locationSnapshot.lat, discoveryLng: locationSnapshot.lng }
          : {}),
      });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      if (res.event) {
        setPublishedKind("event");
        setPublishedId(res.event.id);
        setShareLink(withLaunchTracking(`${origin}/events/${res.event.id}`, user.username));
      } else if (res.challenge) {
        setPublishedKind("challenge");
        setPublishedId(res.challenge.id);
        setShareLink(withLaunchTracking(`${origin}/join/${res.challenge.id}`, user.username));
      } else {
        throw new Error("Create returned no challenge or event.");
      }
      setAppState("published");
      await updateSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm challenge");
      setAppState("preview");
    }
  }, [prompt, protocol, providerCall, specModel, specProviderId, updateSession, user]);

  const handleSelectInvite = useCallback((value: "invite_link" | "nearby" | "same_device") => {
    setProtocol((current) => {
      if (!current) return current;
      const locationProtocol: api.ProtocolSpecV2["locationProtocol"] = value === "nearby"
        ? {
            ...current.locationProtocol,
            mode: "nearby_discovery",
            joinRadiusMeters: current.locationProtocol.joinRadiusMeters ?? 500,
            challengeRadiusMeters: current.locationProtocol.challengeRadiusMeters ?? 500,
            requiresLiveLocation: true,
            locationPrivacy: "approximate",
          }
        : {
            ...current.locationProtocol,
            mode: value === "same_device" ? "same_place_required" : "none",
            requiresLiveLocation: value === "same_device",
            requiresCoPresence: value === "same_device",
            locationPrivacy: value === "same_device" ? "precise_live_only" : "hidden",
          };
      return {
        ...current,
        evidenceProtocol: value === "same_device"
          ? { ...current.evidenceProtocol, mode: "same_camera_video" }
          : current.evidenceProtocol,
        identityProtocol: value === "same_device"
          ? {
              ...current.identityProtocol,
              mode: "left_right_assignment",
              required: true,
              participantBindings: current.identityProtocol.participantBindings.map((binding) => ({
                ...binding,
                expectedPosition: binding.role === "creator" ? "left" : binding.role === "opponent" ? "right" : binding.expectedPosition ?? "any",
                requiredQrOrCode: true,
              })),
            }
          : current.identityProtocol,
        locationProtocol,
      };
    });
  }, []);

  const handleSelectParticipation = useCallback((value: "remote_async" | "remote_live" | "same_camera" | "in_person") => {
    setProtocol((current) => {
      if (!current) return current;
      const videoMode = value === "same_camera" || value === "in_person" ? "same_camera_video" : "separate_video";
      return {
        ...current,
        evidenceProtocol: { ...current.evidenceProtocol, mode: videoMode },
        identityProtocol: {
          ...current.identityProtocol,
          mode: value === "same_camera" || value === "in_person" ? "left_right_assignment" : "liveness_phrase",
          required: true,
          participantBindings: current.identityProtocol.participantBindings.map((binding) => ({
            ...binding,
            expectedPosition: value === "same_camera" || value === "in_person"
              ? binding.role === "creator" ? "left" : binding.role === "opponent" ? "right" : binding.expectedPosition ?? "any"
              : "any",
            requiredQrOrCode: true,
          })),
        },
        locationProtocol: value === "in_person"
          ? {
              ...current.locationProtocol,
              mode: "same_place_required",
              requiresCoPresence: true,
              requiresLiveLocation: true,
              locationPrivacy: "precise_live_only",
            }
          : current.locationProtocol,
      };
    });
  }, []);

  const loadOpenChallenges = useCallback(async (options?: { promptForLocation?: boolean }) => {
    setDiscoveryLoading(true);
    setJoinMessage(null);
    setLocationState("checking");
    try {
      const locationResult = await requestBrowserLocation(options?.promptForLocation ? 10_000 : 3500);
      const locationSnapshot = locationResult.snapshot;
      if (locationSnapshot && user) {
        void api.updateMyLocation(locationSnapshot).catch(() => null);
      }

      const res = await api.discoverChallenges({
        ...(locationSnapshot ? { lat: locationSnapshot.lat, lng: locationSnapshot.lng } : {}),
        limit: 6,
      });
      const visible = res.challenges.filter((challenge) => (
        isOpenForOpponentStatus(challenge.status) &&
        challenge.participants.length < (challenge.maxParticipants ?? 2)
      ));
      setOpenChallenges(visible);
      setLocationState(
        locationSnapshot
          ? "ready"
          : locationResult.status === "blocked"
            ? "blocked"
            : locationResult.status === "unavailable" ? "unavailable" : "global",
      );
      setDiscoveryMessage(
        locationSnapshot
          ? res.levelMessage
          : locationResult.status === "blocked"
            ? "Location blocked. Allow location in your browser to sort nearby; showing global challenges for now."
            : locationResult.status === "unavailable"
              ? "This browser cannot share location. Showing open public challenges globally."
              : "Location not enabled yet. Tap Enable location to sort nearby; showing global challenges for now.",
      );
    } catch (err) {
      console.warn("[discover] failed to load open challenges", err);
      setOpenChallenges([]);
      setLocationState("global");
      setDiscoveryMessage("Nearby discovery is temporarily unavailable. You can still create and share a challenge by link.");
    } finally {
      setDiscoveryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOpenChallenges({ promptForLocation: true });
  }, [loadOpenChallenges]);

  const handleJoinChallenge = useCallback(async (challenge: api.ChallengeData) => {
    setJoinMessage(null);
    if (!user) {
      router.push(`/join/${challenge.id}`);
      return;
    }
    if (challenge.creatorId === user.id) {
      router.push(`/challenge/${challenge.id}`);
      return;
    }
    if (challenge.participants.some((participant) => participant.user.id === user.id)) {
      router.push(`/challenge/${challenge.id}/versus`);
      return;
    }

    router.push(`/join/${challenge.id}`);
  }, [router, user]);

  const handleSelectVisibility = useCallback((value: "public" | "private") => {
    setProtocol((current) => {
      if (!current) return current;
      return {
        ...current,
        locationProtocol: value === "public"
          ? {
              ...current.locationProtocol,
              mode: ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(current.locationProtocol.mode)
                ? current.locationProtocol.mode
                : "nearby_discovery",
              joinRadiusMeters: current.locationProtocol.joinRadiusMeters ?? 500,
              challengeRadiusMeters: current.locationProtocol.challengeRadiusMeters ?? 500,
              requiresLiveLocation: true,
              locationPrivacy: "approximate",
            }
          : {
              ...current.locationProtocol,
              mode: "none",
              requiresLiveLocation: false,
              requiresCoPresence: false,
              locationPrivacy: "hidden",
            },
      };
    });
  }, []);

  const copyLink = useCallback(() => {
    if (!shareLink) return;
    const zhCopy = protocol?.language === "zh";
    const showCopied = (message: string) => {
      setCopied(true);
      setCopyNotice(message);
      setTimeout(() => setCopied(false), 1600);
    };

    if (!navigator.clipboard?.writeText) {
      showCopied(zhCopy ? "剪贴板被浏览器阻止。请手动复制上面的邀请链接。" : "Clipboard is blocked here. Use the visible join link.");
      return;
    }

    navigator.clipboard.writeText(shareLink)
      .then(() => showCopied(zhCopy ? "邀请链接已复制。" : "Join link copied."))
      .catch(() => showCopied(zhCopy ? "剪贴板被浏览器阻止。请手动复制上面的邀请链接。" : "Clipboard is blocked here. Use the visible join link."));
  }, [protocol?.language, shareLink]);

  const copyLaunchText = useCallback((text: string, label: string) => {
    const zhCopy = protocol?.language === "zh";
    const done = (message: string) => {
      setLaunchNotice(message);
      setTimeout(() => setLaunchNotice(""), 2200);
    };
    if (!navigator.clipboard?.writeText) {
      done(zhCopy ? "剪贴板被浏览器阻止。请手动复制模板文字。" : "Clipboard is blocked. Use the visible text.");
      return;
    }
    navigator.clipboard.writeText(text)
      .then(() => done(zhCopy ? `${label}已复制。` : `${label} copied.`))
      .catch(() => done(zhCopy ? "剪贴板被浏览器阻止。请手动复制模板文字。" : "Clipboard is blocked. Use the visible text."));
  }, [protocol?.language]);

  const copyPersonalInvite = useCallback(() => {
    if (!personalInviteLink) return;
    const done = (message: string) => {
      setReferralNotice(message);
      setTimeout(() => setReferralNotice(""), 2600);
    };
    if (!navigator.clipboard?.writeText) {
      done("Clipboard is blocked. Use the visible invite link.");
      return;
    }
    navigator.clipboard.writeText(personalInviteLink)
      .then(() => done("Personal invite link copied."))
      .catch(() => done("Clipboard is blocked. Use the visible invite link."));
  }, [personalInviteLink]);

  const sharePublishedChallenge = useCallback(async () => {
    if (!shareLink || !protocol) return;
    const zhCopy = protocol.language === "zh";
    const text = zhCopy ? `来加入我的 AI 判定挑战：${protocol.title}` : `Join my AI-judged challenge: ${protocol.title}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: protocol.title, text, url: shareLink });
        return;
      } catch {
        // User cancelled or share sheet failed; fall through to X intent.
      }
    }
    const intent = new URL("https://twitter.com/intent/tweet");
    intent.searchParams.set("text", `${text}\n${shareLink}`);
    window.open(intent.toString(), "_blank", "noopener,noreferrer");
  }, [protocol, shareLink]);

  return (
    <div className="relative min-h-screen flex flex-col" onClick={() => showProfile && setShowProfile(false)}>
      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
        <button onClick={reset} className="flex items-center gap-2 text-base font-black tracking-tight" style={{ color: "#172033" }}>
          <BrandMark className="h-9 w-9" />
          <span>Axelrod</span>
        </button>
        <div className="flex items-center gap-2 sm:gap-3">
          {appState !== "idle" && (
            <button onClick={reset} className="text-xs font-bold uppercase tracking-wide" style={{ color: "#64748B" }}>
              New
            </button>
          )}
          <button onClick={() => router.push("/markets")} className="text-xs font-bold uppercase tracking-wide" style={{ color: "#64748B" }}>
            Join
          </button>
          {user ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
                className="flex items-center gap-2 px-3 py-1.5 border shadow-sm"
                style={{ background: "#FFFFFF", borderColor: "#E2E8F0", borderRadius: "999px" }}
              >
                <span className="w-6 h-6 flex items-center justify-center text-[11px] font-bold" style={{ background: "#C7F9CC", color: "#14532D", borderRadius: "999px" }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-semibold" style={{ color: "#172033" }}>{user.username}</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5" style={{ background: "#FFEDD5", color: "#9A3412", borderRadius: "999px" }}>{user.credits ?? 0} pts</span>
                {dailyQuota && (
                  <span className="text-[11px] font-bold px-1.5 py-0.5" style={{ background: "#DBEAFE", color: "#1D4ED8", borderRadius: "999px" }}>
                    AI {dailyQuota.judge.remaining}/{dailyQuota.judge.limit}
                  </span>
                )}
              </button>
              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    className="absolute top-full right-0 mt-2 w-52 z-50 lp-glass"
                    style={{ borderRadius: "18px", boxShadow: "0 8px 30px rgba(15,23,42,0.08)" }}
                    initial={{ opacity: 0, y: -4, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.96 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                      <p className="text-sm font-bold" style={{ color: "#172033" }}>{user.username}</p>
                      <p className="text-xs truncate" style={{ color: "#64748B" }}>{user.email || ""}</p>
                      {dailyQuota && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5 text-[11px] font-bold" style={{ color: "#334155" }}>
                          <div className="px-2 py-1 rounded-lg" style={{ background: "#F8FAFC" }}>
                            Drafts {dailyQuota.spec.remaining}/{dailyQuota.spec.limit}
                          </div>
                          <div className="px-2 py-1 rounded-lg" style={{ background: "#F8FAFC" }}>
                            Verdicts {dailyQuota.judge.remaining}/{dailyQuota.judge.limit}
                          </div>
                          <div className="col-span-2 px-2 py-1 rounded-lg" style={{ background: "#F8FAFC" }}>
                            Video verdicts {dailyQuota.videoJudge.remaining}/{dailyQuota.videoJudge.limit}
                          </div>
                          <div className="col-span-2 px-2 py-1 rounded-lg" style={{ background: "#F8FAFC" }}>
                            Voice {dailyQuota.transcribe.remaining}/{dailyQuota.transcribe.limit}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-2 space-y-0.5">
                      <button onClick={() => { setShowProfile(false); router.push("/me"); }} className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl hover:bg-[#ECFDF5]" style={{ color: "#172033" }}>Wallet / profile</button>
                      <button onClick={() => { setShowProfile(false); router.push("/markets"); }} className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl hover:bg-[#ECFDF5]" style={{ color: "#172033" }}>My challenges</button>
                      <button onClick={() => { setShowProfile(false); signOut(); reset(); }} className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl hover:bg-[#FFE5EA]" style={{ color: "#991B1B" }}>Sign out</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : sessionLoading ? (
            <div className="px-4 py-2 text-sm font-bold shadow-sm" style={{ color: "#64748B", background: "#FFFFFF", borderRadius: "999px", border: "1px solid #E2E8F0" }}>
              Checking...
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)} className="px-4 py-2 text-sm font-bold shadow-sm active:scale-95 transition-transform" style={{ color: "#064E3B", background: "#A7F3D0", borderRadius: "999px" }}>
              Sign in
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-16 pt-4 sm:px-6 lg:pt-8">
        <div className="mx-auto w-full max-w-7xl">
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto grid max-w-6xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 pt-8 sm:pt-12 lg:pt-16">
                <h1 className="max-w-4xl text-5xl font-black tracking-[-0.065em] sm:text-6xl lg:text-7xl" style={{ color: "#101827", lineHeight: 0.92 }}>
                  Bet anything you can prove.
                </h1>
                <p className="mt-5 max-w-2xl text-base font-semibold leading-relaxed sm:text-xl" style={{ color: "#526078" }}>
                  Say it once. Axelrod turns it into a challenge your friend can join, record, and settle.
                </p>
                <div className="mt-7">
                  {error && <ErrorBox message={error} />}
                  <CenteredComposer onSubmit={handleGenerate} isActive={false} initialValue={prompt} onQuotaChange={setDailyQuota} />
                  <ModelModeBar
                    prefs={effectiveOraclePrefs}
                    aiAccess={visibleAiAccess}
                    selectedTier={modelAccessChoice}
                    debugModelOverride={debugModelOverride}
                    onSelectTier={handleSelectModelAccess}
                    onChange={handleSelectOracle}
                  />
                  <LaunchPromptStrip onPick={handleLaunchPrompt} />
                </div>
              </section>

              <aside className="grid gap-4">
                <HomeStatusCard policy={paymentPolicy} />
                {user && (
                  <LaunchInviteCard
                    inviteLink={personalInviteLink}
                    notice={referralNotice}
                    invitedCount={referralStats?.invitedCount ?? 0}
                    bonusEarned={referralStats?.bonusEarned ?? 0}
                    onCopy={copyPersonalInvite}
                  />
                )}
                <OpenChallengeStrip
                  userId={user?.id}
                  challenges={openChallenges}
                  loading={discoveryLoading}
                  message={discoveryMessage}
                  joiningId={joiningId}
                  joinMessage={joinMessage}
                  locationState={locationState}
                  onRefresh={loadOpenChallenges}
                  onEnableLocation={() => loadOpenChallenges({ promptForLocation: true })}
                  onJoin={handleJoinChallenge}
                />
              </aside>
            </motion.div>
          )}

          {appState === "generating" && (
            <LoadingCard title="Building challenge..." body={prompt} onCancel={handleCancelGenerate} />
          )}

          {appState === "preview" && protocol && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <button onClick={reset} className="px-3 py-2 text-xs font-bold rounded-full bg-white border" style={{ color: "#526078", borderColor: "#E2E8F0" }}>
                  Start over
                </button>
                <button onClick={() => setAppState("idle")} className="px-3 py-2 text-xs font-bold rounded-full bg-white border" style={{ color: "#047857", borderColor: "#D1FAE5" }}>
                  Edit sentence
                </button>
              </div>
              {error && <ErrorBox message={error} />}
              <ChallengeSpecPreview
                protocol={protocol}
                prompt={prompt}
                onSelectInvite={handleSelectInvite}
                onSelectParticipation={handleSelectParticipation}
                onSelectVisibility={handleSelectVisibility}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={handleConfirm}
                  disabled={!protocol.riskPolicy.allowed}
                  className="py-4 text-sm font-extrabold rounded-full shadow-sm active:scale-95 transition disabled:opacity-60"
                  style={{ background: protocol.riskPolicy.allowed ? "#10B981" : "#CBD5E1", color: "#FFFFFF" }}
                >
                  {protocol.riskPolicy.allowed ? "Confirm challenge" : "Blocked by safety policy"}
                </button>
                <button onClick={() => setAppState("idle")} className="py-4 text-sm font-extrabold rounded-full border bg-white active:scale-95 transition" style={{ color: "#172033", borderColor: "#E2E8F0" }}>
                  Revise with AI
                </button>
              </div>
            </motion.div>
          )}

          {appState === "confirming" && (
            <LoadingCard title="Creating room..." body={protocol?.title || prompt} />
          )}

          {appState === "published" && protocol && shareLink && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="text-center">
                <h2 className="text-3xl font-extrabold mb-2" style={{ color: "#172033" }}>
                  {protocol.language === "zh" ? (publishedKind === "event" ? "活动已创建" : "挑战已创建") : (publishedKind === "event" ? "Event ready" : "Challenge ready")}
                </h2>
                <p className="text-sm font-semibold" style={{ color: "#526078" }}>{protocol.title}</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white border shadow-sm" style={{ borderColor: "#E2E8F0", borderRadius: "18px" }}>
                <input readOnly value={shareLink} className="flex-1 bg-transparent px-3 py-2 text-sm font-semibold focus:outline-none truncate" style={{ color: "#172033" }} />
                <button onClick={copyLink} className="px-4 py-2 text-sm font-bold rounded-full" style={{ background: copied ? "#A7F3D0" : "#10B981", color: copied ? "#064E3B" : "#FFFFFF" }}>
                  {copied ? (protocol.language === "zh" ? "已复制" : "Copied") : (protocol.language === "zh" ? "复制" : "Copy")}
                </button>
              </div>
              {copyNotice && (
                <p className="text-xs font-bold text-center" style={{ color: copied ? "#047857" : "#64748B" }}>
                  {copyNotice}
                </p>
              )}
              <PublishedLaunchKit
                title={protocol.title}
                shareLink={shareLink}
                notice={launchNotice}
                onCopy={copyLaunchText}
                zhCopy={protocol.language === "zh"}
              />
              <div className="grid gap-2 sm:grid-cols-4">
                <button type="button" onClick={() => { if (publishedId) window.location.href = publishedKind === "event" ? `/events/${publishedId}` : `/challenge/${publishedId}`; }} className="py-3 text-sm font-bold rounded-full" style={{ background: "#10B981", color: "#FFFFFF" }}>
                  {protocol.language === "zh" ? (publishedKind === "event" ? "活动大厅" : "挑战房间") : (publishedKind === "event" ? "Event lobby" : "Challenge room")}
                </button>
                <button type="button" onClick={sharePublishedChallenge} className="py-3 text-sm font-bold rounded-full" style={{ background: "#A7F3D0", color: "#065F46" }}>{protocol.language === "zh" ? "立即分享" : "Share now"}</button>
                <button type="button" onClick={() => { window.location.href = "/markets"; }} className="py-3 text-sm font-bold rounded-full bg-white border" style={{ color: "#047857", borderColor: "#D1FAE5" }}>{protocol.language === "zh" ? "挑战管理" : "Challenge board"}</button>
                <button onClick={reset} className="py-3 text-sm font-bold rounded-full bg-white border" style={{ color: "#172033", borderColor: "#E2E8F0" }}>{protocol.language === "zh" ? "新挑战" : "New challenge"}</button>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
  );
}

function LaunchInviteCard({
  inviteLink,
  notice,
  invitedCount,
  bonusEarned,
  onCopy,
}: {
  inviteLink: string;
  notice: string;
  invitedCount: number;
  bonusEarned: number;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-[22px] border bg-white/95 p-4 text-left shadow-sm" style={{ borderColor: "#D1FAE5", boxShadow: "0 18px 48px rgba(15,23,42,0.07)" }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#047857" }}>Beta invite</p>
          <p className="text-sm font-bold" style={{ color: "#172033" }}>
            +10 pts each invite
          </p>
          <p className="mt-1 text-xs font-semibold" style={{ color: "#64748B" }}>
            {invitedCount} joined - {bonusEarned} pts earned
          </p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          className="shrink-0 rounded-full px-4 py-2 text-xs font-black"
          style={{ background: "#A7F3D0", color: "#065F46" }}
        >
          Copy invite
        </button>
      </div>
      <input
        readOnly
        value={inviteLink}
        className="mt-3 w-full truncate rounded-xl border bg-[#F8FAFC] px-3 py-2 text-xs font-semibold outline-none"
        style={{ borderColor: "#E2E8F0", color: "#526078" }}
      />
      {notice && (
        <p className="mt-2 text-xs font-bold" style={{ color: "#047857" }}>
          {notice}
        </p>
      )}
    </section>
  );
}

function HomeStatusCard({ policy }: { policy: api.PaymentPolicyStatus | null }) {
  const cashAllowed = Boolean(policy?.cashStakeAllowed);
  return (
    <section className="rounded-[28px] border bg-white/80 p-4 text-left shadow-sm backdrop-blur-xl" style={{ borderColor: "rgba(148,163,184,0.24)", boxShadow: "0 22px 70px rgba(15,23,42,0.08)" }}>
      <div className="grid grid-cols-3 gap-2">
        <StatusChip label="Say" value="1 line" />
        <StatusChip label="Record" value="proof" />
        <StatusChip label="Settle" value="win" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border px-3 py-2" style={{ borderColor: "#E2E8F0", background: "#F8FAFC" }}>
        <span className="text-xs font-black uppercase tracking-wide" style={{ color: "#64748B" }}>
          Stakes
        </span>
        <span className="rounded-full px-3 py-1 text-[11px] font-black" style={{ background: cashAllowed ? "#ECFDF5" : "#FFFFFF", color: cashAllowed ? "#047857" : "#64748B" }}>
          {cashAllowed ? "cash allowed" : "pts only"}
        </span>
      </div>
    </section>
  );
}

function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-[#F8FAFC] px-3 py-3" style={{ borderColor: "#E2E8F0" }}>
      <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "#64748B" }}>{label}</p>
      <p className="mt-1 truncate text-sm font-black" style={{ color: "#172033" }}>{value}</p>
    </div>
  );
}

function PublishedLaunchKit({
  title,
  shareLink,
  notice,
  onCopy,
  zhCopy = false,
}: {
  title: string;
  shareLink: string;
  notice: string;
  onCopy: (text: string, label: string) => void;
  zhCopy?: boolean;
}) {
  const templates = zhCopy
    ? [
        {
          label: "私信朋友",
          body: `我发起了一个 AI 判定挑战：${title}\n从这里加入：${shareLink}\n同意规则、提交证据后，AI 会推荐赢家。`,
        },
        {
          label: "群聊",
          body: `挑战已创建：${title}\n加入后先确认规则，再提交证据，AI 会给出判定建议。\n${shareLink}`,
        },
        {
          label: "公开发布",
          body: `来试试我的 Axelrod 挑战：${title}\n${shareLink}`,
        },
      ]
    : [
        {
          label: "Friend DM",
          body: `I made an AI-judged challenge for us: ${title}\nJoin here: ${shareLink}\nWinner gets the credits after evidence review.`,
        },
        {
          label: "Group chat",
          body: `Challenge is live: ${title}\nJoin, accept the rules, submit evidence, and let the AI recommend the winner.\n${shareLink}`,
        },
        {
          label: "Public post",
          body: `Try my Axelrod challenge: ${title}\n${shareLink}`,
        },
      ];

  return (
    <section className="rounded-[24px] border bg-white/95 p-4 text-left shadow-sm" style={{ borderColor: "#D1FAE5", boxShadow: "0 18px 48px rgba(15,23,42,0.07)" }}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: "#047857" }}>
            {zhCopy ? "分享" : "Share"}
          </p>
          <h3 className="mt-1 text-xl font-black tracking-tight" style={{ color: "#172033" }}>
            {zhCopy ? "发给 3 个朋友" : "Send to 3 people"}
          </h3>
        </div>
        <span className="w-fit rounded-full px-3 py-1 text-[11px] font-black" style={{ background: "#ECFDF5", color: "#047857" }}>
          {zhCopy ? "已追踪" : "tracked"}
        </span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {templates.map((template) => (
          <button
            key={template.label}
            type="button"
            onClick={() => onCopy(template.body, template.label)}
            className="rounded-[18px] border bg-[#F8FAFC] p-3 text-left transition hover:bg-white active:scale-[0.99]"
            style={{ borderColor: "#E2E8F0" }}
          >
            <p className="text-sm font-black" style={{ color: "#172033" }}>{template.label}</p>
            <p className="mt-2 line-clamp-2 text-xs font-semibold leading-relaxed" style={{ color: "#64748B" }}>
              {template.body}
            </p>
          </button>
        ))}
      </div>
      {notice && (
        <p className="mt-3 text-xs font-bold" style={{ color: "#047857" }}>{notice}</p>
      )}
    </section>
  );
}

function LaunchPromptStrip({ onPick }: { onPick: (prompt: string) => void }) {
  const visible = HOMEPAGE_CHALLENGE_LOOPS.slice(0, 4);
  const hidden = HOMEPAGE_CHALLENGE_LOOPS.slice(4);
  return (
    <section className="mt-5">
      <div className="flex flex-wrap gap-2">
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.prompt)}
            className="group rounded-full border bg-white/70 px-4 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:bg-white active:scale-[0.99]"
            style={{ borderColor: "rgba(148,163,184,0.24)", boxShadow: "0 10px 28px rgba(15,23,42,0.04)" }}
          >
            <span className="text-sm font-extrabold transition group-hover:text-[#047857]" style={{ color: "#172033" }}>{item.title}</span>
          </button>
        ))}
      </div>
      {hidden.length > 0 && (
        <details className="mt-3 w-fit">
          <summary className="cursor-pointer rounded-full border bg-white/50 px-4 py-2 text-xs font-black" style={{ borderColor: "rgba(148,163,184,0.24)", color: "#64748B" }}>
            More
          </summary>
          <div className="mt-2 flex max-w-2xl flex-wrap gap-2">
            {hidden.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPick(item.prompt)}
                className="rounded-full border bg-white/90 px-4 py-2 text-sm font-extrabold shadow-sm transition hover:bg-white active:scale-[0.99]"
                style={{ borderColor: "#E2E8F0", color: "#172033" }}
              >
                {item.title}
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function OpenChallengeStrip({
  userId,
  challenges,
  loading,
  message,
  joiningId,
  joinMessage,
  locationState,
  onRefresh,
  onEnableLocation,
  onJoin,
}: {
  userId?: string;
  challenges: api.ChallengeData[];
  loading: boolean;
  message: string;
  joiningId: string | null;
  joinMessage: string | null;
  locationState: DiscoveryLocationState;
  onRefresh: () => void;
  onEnableLocation: () => void;
  onJoin: (challenge: api.ChallengeData) => void;
}) {
  const canAskForLocation = locationState !== "ready" && locationState !== "unavailable";
  const stripZh = challenges.some((challenge) => challengeUsesChineseCopy(challenge));
  return (
    <section className="text-left">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#047857" }}>{stripZh ? "附近挑战" : "Join"}</p>
          <p className="text-xs font-semibold" style={{ color: "#64748B" }}>
            {message || "Nearby + public"}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {canAskForLocation && (
            <button
              type="button"
              onClick={onEnableLocation}
              disabled={loading}
              className="rounded-full border px-3 py-2 text-xs font-black disabled:opacity-50"
              style={{ borderColor: "#10B981", color: "#065F46", background: "#D1FAE5" }}
            >
              {locationState === "checking"
                ? stripZh ? "请求中..." : "Asking..."
                : locationState === "blocked"
                  ? stripZh ? "重试位置" : "Try location"
                  : stripZh ? "开启位置" : "Enable location"}
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border bg-white px-3 py-2 text-xs font-black disabled:opacity-50"
            style={{ borderColor: "#D1FAE5", color: "#047857" }}
          >
            {loading ? (stripZh ? "检查中" : "Checking") : (stripZh ? "刷新" : "Refresh")}
          </button>
        </div>
      </div>
      {joinMessage && <ErrorBox message={joinMessage} />}
      <div className="grid gap-2">
        {loading ? (
          [0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-[18px] border bg-white/70" style={{ borderColor: "#E2E8F0" }} />
          ))
        ) : challenges.length === 0 ? (
          <div className="rounded-[18px] border bg-white/95 px-4 py-4 text-sm font-semibold shadow-sm" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
            {stripZh ? "暂无开放挑战。" : "No one waiting yet."}
          </div>
        ) : (
          challenges.slice(0, 3).map((challenge) => {
            const mine = userId === challenge.creatorId;
            const joined = Boolean(userId && challenge.participants.some((participant) => participant.user.id === userId));
            const distance = challenge.discovery?.distanceMiles;
            const zhCopy = challengeUsesChineseCopy(challenge);
            return (
              <article key={challenge.id} className="rounded-[20px] border bg-white/95 p-3 shadow-sm" style={{ borderColor: "#E2E8F0", boxShadow: "0 12px 34px rgba(15,23,42,0.05)" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-extrabold" style={{ color: "#172033" }}>{challenge.title}</p>
                    <p className="mt-1 text-[11px] font-semibold" style={{ color: "#64748B" }}>
                      @{challenge.creator.username} / {challenge.stake > 0 ? `${challenge.stake} ${zhCopy ? "积分" : "pts"}` : zhCopy ? "免费" : "free"}
                      {distance != null ? ` / ${distance} mi` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase" style={{ background: "#F8FAFC", color: "#64748B" }}>
                    {challenge.participants.length}/{challenge.maxParticipants ?? 2}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onJoin(challenge)}
                  disabled={joiningId === challenge.id}
                  className="mt-3 w-full rounded-full px-3 py-2 text-xs font-black disabled:opacity-60"
                  style={{ background: mine ? "#F8FAFC" : "#A7F3D0", color: mine ? "#64748B" : "#065F46" }}
                >
                  {joiningId === challenge.id
                    ? zhCopy ? "打开中..." : "Opening..."
                    : mine
                      ? zhCopy ? "打开我的" : "Open yours"
                      : joined
                        ? zhCopy ? "进入房间" : "Open room"
                        : zhCopy ? "查看规则" : "Review rules"}
                </button>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-4 px-4 py-3 text-sm font-bold bg-white border" style={{ color: "#991B1B", borderColor: "#FECACA", borderRadius: "16px" }}>
      {message}
    </div>
  );
}

function LoadingCard({ title, body, onCancel }: { title: string; body: string; onCancel?: () => void }) {
  return (
    <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="w-12 h-12 mx-auto mb-4 rounded-full border-[3px] border-t-transparent" style={{ borderColor: "#10B981", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
      <p className="text-base font-extrabold" style={{ color: "#172033" }}>{title}</p>
      <p className="line-clamp-1 text-sm font-medium mt-2 max-w-lg mx-auto px-4 py-2 bg-white border" style={{ color: "#526078", borderColor: "#E2E8F0", borderRadius: "999px" }}>{body}</p>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 px-5 py-2 text-xs font-extrabold rounded-full bg-white border shadow-sm active:scale-95 transition"
          style={{ color: "#526078", borderColor: "#E2E8F0" }}
        >
          Stop
        </button>
      )}
    </motion.div>
  );
}

function ModelModeBar({
  prefs,
  aiAccess,
  selectedTier,
  debugModelOverride,
  onSelectTier,
  onChange,
}: {
  prefs: OraclePrefs;
  aiAccess: api.AiAccessStatus | null;
  selectedTier: ModelAccessChoice;
  debugModelOverride: boolean;
  onSelectTier: (tier: ModelAccessChoice) => void;
  onChange: (providerId: string, model?: string | null) => void;
}) {
  const selectedProvider = getProviderById(prefs.providerId) ?? getProviderById(DEFAULT_LLM_PROVIDER_ID);
  const selectedModel = prefs.model || selectedProvider?.defaultModel || "";
  const canUsePremium = Boolean(aiAccess?.canUsePremiumModels);
  const activeTier: ModelAccessChoice = selectedTier === "premium" && canUsePremium ? "premium" : "free";
  const planLabel = debugModelOverride ? "Custom" : activeTier === "premium" ? "Premium" : "Free";
  const planCopy = debugModelOverride ? "Developer routing" : activeTier === "premium" ? "Best judge" : "Basic judge";
  const canDebugRouting = process.env.NODE_ENV !== "production" || aiAccess?.isDeveloper || aiAccess?.role === "admin";
  const visibleProviders = ["local_ollama", "deepseek", "moonshot", "openai", "anthropic", "google", "xai", "groq", "mistral", "together", "fireworks"]
    .map((id) => LLM_PROVIDERS.find((provider) => provider.id === id))
    .filter(Boolean) as typeof LLM_PROVIDERS;
  const modelOptions = selectedProvider?.models?.length ? selectedProvider.models : selectedModel ? [selectedModel] : [];
  const hasCustomSelectedModel = selectedModel && !modelOptions.includes(selectedModel);
  const tierChoices: Array<{
    id: ModelAccessChoice;
    label: string;
    kicker: string;
    disabled: boolean;
  }> = [
    { id: "free", label: "Free AI", kicker: "basic", disabled: false },
    { id: "premium", label: "Premium AI", kicker: canUsePremium ? "best" : "locked", disabled: !canUsePremium },
  ];

  return (
    <details className="group mt-3 w-fit">
      <summary
        className="list-none cursor-pointer rounded-full border bg-white/70 px-4 py-2 text-xs font-black shadow-sm transition hover:bg-white"
        style={{ borderColor: "rgba(148,163,184,0.28)", color: "#526078" }}
      >
        <span className="text-[#047857]">Plan</span>
        <span className="ml-2">{planLabel}</span>
      </summary>
      <div
        className="mt-2 grid min-w-[18rem] gap-2 rounded-[22px] border bg-white/95 p-3 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        style={{ borderColor: "rgba(148,163,184,0.28)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-black" style={{ color: "#172033" }}>{planLabel}</p>
            <p className="text-xs font-semibold" style={{ color: "#64748B" }}>{planCopy}</p>
          </div>
          <span
            className="rounded-full px-3 py-1 text-[11px] font-black"
            style={{
              background: activeTier === "premium" || debugModelOverride ? "#DCFCE7" : "#F8FAFC",
              color: activeTier === "premium" || debugModelOverride ? "#047857" : "#64748B",
            }}
          >
            {planLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {tierChoices.map((choice) => {
            const selected = !debugModelOverride && activeTier === choice.id;
            return (
              <button
                key={choice.id}
                type="button"
                disabled={choice.disabled}
                onClick={() => onSelectTier(choice.id)}
                className="rounded-[16px] border px-3 py-3 text-left transition disabled:cursor-not-allowed"
                style={{
                  borderColor: selected ? "#10B981" : "rgba(148,163,184,0.28)",
                  background: choice.disabled ? "#F1F5F9" : selected ? "#ECFDF5" : "#FFFFFF",
                  color: choice.disabled ? "#94A3B8" : selected ? "#047857" : "#172033",
                  opacity: choice.disabled ? 0.58 : 1,
                }}
                aria-disabled={choice.disabled}
              >
                <span className="block text-sm font-black">{choice.label}</span>
                <span className="mt-1 block text-[10px] font-black uppercase tracking-wide">{choice.kicker}</span>
              </button>
            );
          })}
        </div>
        {canDebugRouting && (
          <details className="rounded-[18px] border bg-slate-50 p-3" style={{ borderColor: "#E2E8F0" }}>
            <summary className="cursor-pointer list-none text-[11px] font-black uppercase tracking-wide" style={{ color: "#334155" }}>
              Debug model routing
            </summary>
            <div className="mt-3 grid gap-2">
              {aiAccess?.isDeveloper && (
                <p className="text-[10px] font-bold" style={{ color: "#047857" }}>
                  Dev override active. Public plan still shows Premium.
                </p>
              )}
              <select
                value={selectedProvider?.id ?? DEFAULT_LLM_PROVIDER_ID}
                onChange={(event) => {
                  const provider = getProviderById(event.target.value);
                  onChange(event.target.value, provider?.defaultModel ?? null);
                }}
                className="w-full rounded-xl border px-3 py-2 text-xs font-extrabold outline-none"
                style={{ borderColor: "#DDE7F0", color: "#172033", background: "#FFFFFF" }}
                aria-label="Debug AI provider"
              >
                {visibleProviders.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.shortLabel}
                  </option>
                ))}
              </select>
              <select
                value={selectedModel}
                onChange={(event) => onChange(selectedProvider?.id ?? DEFAULT_LLM_PROVIDER_ID, event.target.value)}
                className="w-full rounded-xl border px-3 py-2 text-xs font-bold outline-none"
                style={{ borderColor: "#DDE7F0", color: "#526078", background: "#FFFFFF" }}
                aria-label="Debug AI model"
              >
                {hasCustomSelectedModel && <option value={selectedModel}>{selectedModel}</option>}
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
          </details>
        )}
      </div>
    </details>
  );
}

function ChallengeSpecPreview({
  protocol,
  prompt,
  onSelectInvite,
  onSelectParticipation,
  onSelectVisibility,
}: {
  protocol: api.ProtocolSpecV2;
  prompt: string;
  onSelectInvite: (value: "invite_link" | "nearby" | "same_device") => void;
  onSelectParticipation: (value: "remote_async" | "remote_live" | "same_camera" | "in_person") => void;
  onSelectVisibility: (value: "public" | "private") => void;
}) {
  const isSolo = protocol.participantMode === "solo";
  const opponent = protocol.identityProtocol.participantBindings.find((p) => p.role === "opponent")?.label || "Opponent";
  const inviteValue =
    protocol.locationProtocol.mode === "nearby_discovery" || protocol.locationProtocol.mode === "walk_to_join" ? "nearby" :
      protocol.locationProtocol.mode === "same_place_required" ? "same_device" : "invite_link";
  const participationValue =
    protocol.evidenceProtocol.mode === "same_camera_video" ? "same_camera" :
      protocol.locationProtocol.requiresCoPresence ? "in_person" : "remote_async";
  const visibilityValue = ["nearby_discovery", "walk_to_join", "mass_local_event"].includes(protocol.locationProtocol.mode) ? "public" : "private";
  const challengePathText = [
    protocol.locationProtocol.mode.replace(/_/g, " "),
    protocol.evidenceProtocol.mode.replace(/_/g, " "),
    protocol.identityProtocol.required ? "identity" : "account",
    protocol.settlementProtocol.mode.replace(/_/g, " "),
    `confidence ${Math.round(protocol.settlementProtocol.autoSettleConfidenceThreshold * 100)}%`,
    protocol.riskPolicy.allowed ? "settle if gates pass" : "blocked",
  ].join(" / ");
  const languageLabel = protocolLanguageLabel(protocol.language);
  const languageStatus = protocolLanguageStatus(protocol.language);
  const inviteOptions: Array<{ value: "invite_link" | "nearby" | "same_device"; label: string; description: string }> = [
    { value: "invite_link", label: "Invite link", description: "Private link." },
    { value: "nearby", label: "Nearby", description: "Public radar." },
    { value: "same_device", label: "Same device", description: "One phone." },
  ];
  const participationOptions: Array<{ value: "remote_async" | "remote_live" | "same_camera" | "in_person"; label: string; description: string }> = [
    { value: "remote_async", label: "Async", description: "Separate uploads." },
    { value: "remote_live", label: "Live", description: "Same time." },
    { value: "same_camera", label: "Same camera", description: "One clip." },
    { value: "in_person", label: "In person", description: "Together." },
  ];
  return (
    <section className="bg-white border shadow-sm" aria-label={`Challenge preview, ${languageStatus}`} style={{ borderColor: "#E2E8F0", borderRadius: "22px" }}>
      <div className="p-5 border-b" style={{ borderColor: "#EEF2F7" }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#047857" }}>Prompt</p>
        <p className="mb-3 line-clamp-2 text-sm font-semibold" style={{ color: "#526078" }}>{prompt}</p>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: "#172033" }}>{protocol.title}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>language: {languageLabel}</Pill>
          <Pill>{protocol.participantMode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.outcomeType.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.evidenceProtocol.mode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.identityProtocol.mode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.locationProtocol.locationPrivacy.replace(/_/g, " ")}</Pill>
          <Pill>{isSolo ? "solo proof" : `vs ${opponent}`}</Pill>
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <SpecBlock title="Goal" body={protocol.userFacingSummary} />
        <SpecBlock title="Players" body={isSolo ? "Solo proof. No opponent required." : `${protocol.participantMode.replace(/_/g, " ")} vs ${opponent}.`} />
        <SpecBlock title="Proof" body={protocol.evidenceProtocol.requiredEvidence.join(" ")} />
        <SpecBlock title="Win" body={protocol.settlementProtocol.winCondition} />
      </div>
      <details className="mx-5 mb-5 rounded-2xl border bg-[#F8FAFC] p-4" style={{ borderColor: "#E2E8F0" }}>
        <summary className="cursor-pointer text-xs font-black uppercase tracking-wide" style={{ color: "#047857" }}>
          Details
        </summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <SpecBlock title="Identity" body={`${protocol.identityProtocol.required ? "Required" : "Optional"} via ${protocol.identityProtocol.mode.replace(/_/g, " ")}. Gate: ${Math.round(protocol.identityProtocol.autoSettlementRequiresIdentityConfidence * 100)}%.`} />
          <SpecBlock title="Capture" body={protocol.evidenceProtocol.captureInstructions.join(" ")} />
          <SpecBlock title="AI judge" body={protocol.settlementProtocol.judgeInstructions.join(" ")} />
          <SpecBlock title="Review" body={protocol.settlementProtocol.manualReviewTriggers.join(" ")} />
          <SpecBlock title="Risk" body={`${protocol.riskPolicy.riskLevel}. ${protocol.riskPolicy.blockedReason || protocol.riskPolicy.warnings.join(" ") || "No extra warning."}${protocol.riskPolicy.safeAlternative ? ` Safe alternative: ${protocol.riskPolicy.safeAlternative}` : ""}`} />
          <SpecBlock title="Cost" body={`${protocol.aiBudgetPolicy.estimatedCostTier}. Frames: ${protocol.aiBudgetPolicy.maxVisionFrames}. Escalation: ${protocol.aiBudgetPolicy.allowEscalation ? "on" : "off"}.`} />
        </div>
      </details>
      <div className="grid gap-5 px-5 pb-5">
        <OptionSection
          title="Invite mode"
          subtitle=""
          value={inviteValue}
          options={inviteOptions}
          onSelect={(value) => onSelectInvite(value as "invite_link" | "nearby" | "same_device")}
        />
        <OptionSection
          title="Participation mode"
          subtitle=""
          value={participationValue}
          options={participationOptions}
          onSelect={(value) => onSelectParticipation(value as "remote_async" | "remote_live" | "same_camera" | "in_person")}
        />
        <OptionSection
          title="Visibility"
          subtitle=""
          value={visibilityValue}
          options={[
            { value: "private", label: "Private", description: "Invite only." },
            { value: "public", label: "Public / nearby", description: "Discoverable." },
          ]}
          onSelect={(value) => onSelectVisibility(value as "public" | "private")}
        />
        <div className="grid gap-2 rounded-2xl border p-4" style={{ borderColor: "#D1FAE5", background: "#F8FAFC" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#047857" }}>Path</p>
          <p className="line-clamp-2 text-sm font-bold" style={{ color: "#172033" }}>
            {challengePathText}
          </p>
        </div>
      </div>
    </section>
  );
}

function OptionSection({
  title,
  subtitle,
  value,
  options,
  onSelect,
}: {
  title: string;
  subtitle: string;
  value: string;
  options: Array<{ value: string; label: string; description: string }>;
  onSelect: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#047857" }}>{title}</p>
        {subtitle && <p className="text-xs font-semibold" style={{ color: "#64748B" }}>{subtitle}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              onClick={() => onSelect(option.value)}
              className="rounded-xl border p-3 text-left transition active:scale-[0.99]"
              style={{
                borderColor: selected ? "#10B981" : "#E2E8F0",
                background: selected ? "#ECFDF5" : "#F8FAFC",
                boxShadow: selected ? "0 0 0 2px rgba(16,185,129,0.12)" : "none",
              }}
            >
              <p className="text-sm font-extrabold" style={{ color: "#172033" }}>{option.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpecBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "#64748B" }}>{title}</p>
      <p className="line-clamp-3 text-sm font-semibold leading-relaxed" style={{ color: "#172033" }}>{body}</p>
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="px-3 py-1 text-xs font-bold rounded-full" style={{ background: "#ECFDF5", color: "#047857" }}>
      {children}
    </span>
  );
}
