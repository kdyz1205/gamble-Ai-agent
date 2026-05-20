"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import CenteredComposer from "@/components/CenteredComposer";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { DEFAULT_LLM_PROVIDER_ID, LLM_PROVIDERS, getProviderById } from "@/lib/llm-providers";
import { readOracleLlmPrefs, writeOracleLlmPrefs } from "@/lib/oracle-prefs";
import { isOpenForOpponentStatus } from "@/lib/challenge-state-machine";

type AppState = "idle" | "generating" | "preview" | "confirming" | "published";
type OraclePrefs = { providerId: string; model: string | null };
type DiscoveryLocationState = "checking" | "ready" | "global" | "blocked" | "unavailable";
type BrowserLocationStatus = "ready" | "blocked" | "timeout" | "unavailable" | "error";

const MODEL_TEXT_ALIASES: Array<{ pattern: RegExp; providerId: string }> = [
  { pattern: /^(?:local|llama|ollama)$/i, providerId: "local_ollama" },
  { pattern: /^(?:deepseek|deep seeker)$/i, providerId: "deepseek" },
  { pattern: /^(?:kimi|moonshot)$/i, providerId: "moonshot" },
  { pattern: /^(?:gpt|openai|premium)$/i, providerId: "openai" },
  { pattern: /^(?:claude|anthropic)$/i, providerId: "anthropic" },
];

function initialOraclePrefs(): OraclePrefs {
  const prefs = readOracleLlmPrefs();
  const provider = (prefs.providerId ? getProviderById(prefs.providerId) : undefined) ?? getProviderById(DEFAULT_LLM_PROVIDER_ID);
  return {
    providerId: provider?.id ?? DEFAULT_LLM_PROVIDER_ID,
    model: prefs.model ?? provider?.defaultModel ?? null,
  };
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

function detectPromptLanguage(input: string) {
  if (/[\u3400-\u9FFF]/.test(input)) return "zh";
  if (/[A-Za-z]/.test(input)) return "en";
  return "auto";
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
  const [specSource, setSpecSource] = useState<"llm" | "safety_prefilter" | "fallback" | "">("");
  const [specProviderId, setSpecProviderId] = useState("");
  const [providerCall, setProviderCall] = useState<unknown>(null);
  const [externalApiCharged, setExternalApiCharged] = useState(false);
  const [oraclePrefs, setOraclePrefs] = useState<OraclePrefs>(() => initialOraclePrefs());
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [publishedKind, setPublishedKind] = useState<"challenge" | "event">("challenge");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [openChallenges, setOpenChallenges] = useState<api.ChallengeData[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [dailyQuota, setDailyQuota] = useState<api.DailyAiQuotaStatus | null>(null);
  const joiningId: string | null = null;
  const [joinMessage, setJoinMessage] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<DiscoveryLocationState>("checking");

  const reset = useCallback(() => {
    setAppState("idle");
    setPrompt("");
    setProtocol(null);
    setSpecModel("");
    setSpecSource("");
    setSpecProviderId("");
    setProviderCall(null);
    setExternalApiCharged(false);
    setShareLink(null);
    setPublishedId(null);
    setPublishedKind("challenge");
    setError(null);
    setCopied(false);
    setCopyNotice("");
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setDailyQuota(null);
      return;
    }
    let cancelled = false;
    api.getCredits()
      .then((res) => {
        if (!cancelled) setDailyQuota(res.dailyQuota);
      })
      .catch(() => {
        if (!cancelled) setDailyQuota(null);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleGenerate = useCallback(async (input: string) => {
    if (!user) {
      setError("Sign in to use your daily beta AI draft credits.");
      setShowAuth(true);
      return;
    }
    const directive = extractModelDirective(input);
    const nextPrefs = directive.prefs ?? oraclePrefs;
    if (directive.prefs) {
      setOraclePrefs(directive.prefs);
      writeOracleLlmPrefs(directive.prefs.providerId, directive.prefs.model ?? "");
    }
    setPrompt(directive.prompt);
    setError(null);
    setAppState("generating");
    try {
      const res = await api.compileChallengeProtocol(directive.prompt, {
        ...nextPrefs,
        language: detectPromptLanguage(directive.prompt),
        context: {
          surface: "homepage_composer",
          flow: "draft_before_create",
        },
      });
      if (!res.protocol || res.source === "error") {
        throw new Error("AI protocol compilation did not complete with the selected provider/model. No draft was created.");
      }
      setProtocol(res.protocol);
      setSpecModel(res.model);
      setSpecSource(res.source);
      setSpecProviderId(res.providerId || nextPrefs.providerId);
      setProviderCall(res.providerCall ?? null);
      setExternalApiCharged(Boolean(res.externalApiCharged));
      if (res.dailyQuota) setDailyQuota(res.dailyQuota);
      setAppState("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate challenge spec");
      setAppState("idle");
    }
  }, [oraclePrefs, user]);

  const handleSelectOracle = useCallback((providerId: string, model?: string | null) => {
    const provider = getProviderById(providerId);
    if (!provider) return;
    const nextPrefs = { providerId, model: model?.trim() || provider.defaultModel };
    setOraclePrefs(nextPrefs);
    writeOracleLlmPrefs(nextPrefs.providerId, nextPrefs.model);
  }, []);

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
        setShareLink(`${origin}/events/${res.event.id}`);
      } else if (res.challenge) {
        setPublishedKind("challenge");
        setPublishedId(res.challenge.id);
        setShareLink(`${origin}/join/${res.challenge.id}`);
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
      setOpenChallenges([]);
      setLocationState("global");
      setDiscoveryMessage(err instanceof Error ? err.message : "Could not load open challenges.");
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
    const showCopied = (message: string) => {
      setCopied(true);
      setCopyNotice(message);
      setTimeout(() => setCopied(false), 1600);
    };

    if (!navigator.clipboard?.writeText) {
      showCopied("Clipboard is blocked here. Use the visible join link.");
      return;
    }

    navigator.clipboard.writeText(shareLink)
      .then(() => showCopied("Join link copied."))
      .catch(() => showCopied("Clipboard is blocked here. Use the visible join link."));
  }, [shareLink]);

  return (
    <div className="relative min-h-screen flex flex-col" onClick={() => showProfile && setShowProfile(false)}>
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <button onClick={reset} className="text-base font-extrabold tracking-tight" style={{ color: "#172033" }}>
          AI Gamble Agent
        </button>
        <div className="flex items-center gap-3">
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

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-3xl">
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border bg-white shadow-sm" style={{ borderColor: "#D1FAE5", color: "#047857" }}>
                AI
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3" style={{ color: "#172033" }}>
                What do you want to challenge someone on?
              </h1>
              <p className="text-base md:text-lg font-medium mb-7 mx-auto max-w-2xl" style={{ color: "#526078" }}>
                Say one sentence. The AI turns it into rules, participants, evidence, judging, invite flow, disputes, and point settlement.
              </p>
              {error && <ErrorBox message={error} />}
              <CenteredComposer onSubmit={handleGenerate} isActive={false} initialValue={prompt} />
              <ModelModeBar prefs={oraclePrefs} onChange={handleSelectOracle} />
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
            </motion.div>
          )}

          {appState === "generating" && (
            <LoadingCard title="Generating executable challenge..." body={prompt} />
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
                model={specModel}
                source={specSource}
                providerId={specProviderId}
                externalApiCharged={externalApiCharged}
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
            <LoadingCard title="Creating invite, escrow, and challenge room..." body={protocol?.title || prompt} />
          )}

          {appState === "published" && protocol && shareLink && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="text-center">
                <h2 className="text-3xl font-extrabold mb-2" style={{ color: "#172033" }}>{publishedKind === "event" ? "Event is ready" : "Challenge is ready"}</h2>
                <p className="text-sm font-semibold" style={{ color: "#526078" }}>{protocol.title}</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white border shadow-sm" style={{ borderColor: "#E2E8F0", borderRadius: "18px" }}>
                <input readOnly value={shareLink} className="flex-1 bg-transparent px-3 py-2 text-sm font-semibold focus:outline-none truncate" style={{ color: "#172033" }} />
                <button onClick={copyLink} className="px-4 py-2 text-sm font-bold rounded-full" style={{ background: copied ? "#A7F3D0" : "#10B981", color: copied ? "#064E3B" : "#FFFFFF" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {copyNotice && (
                <p className="text-xs font-bold text-center" style={{ color: copied ? "#047857" : "#64748B" }}>
                  {copyNotice}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" onClick={() => { if (publishedId) window.location.href = publishedKind === "event" ? `/events/${publishedId}` : `/challenge/${publishedId}`; }} className="py-3 text-sm font-bold rounded-full" style={{ background: "#10B981", color: "#FFFFFF" }}>{publishedKind === "event" ? "Event lobby" : "Challenge room"}</button>
                <button type="button" onClick={() => { window.location.href = "/markets"; }} className="py-3 text-sm font-bold rounded-full bg-white border" style={{ color: "#047857", borderColor: "#D1FAE5" }}>Public list</button>
                <button onClick={reset} className="py-3 text-sm font-bold rounded-full bg-white border" style={{ color: "#172033", borderColor: "#E2E8F0" }}>New challenge</button>
              </div>
            </motion.div>
          )}
        </div>
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
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
  return (
    <section className="mt-6 text-left">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#047857" }}>Join nearby</p>
          <p className="text-xs font-semibold" style={{ color: "#64748B" }}>
            {message || "Open public challenges waiting for an opponent."}
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
              {locationState === "checking" ? "Asking..." : locationState === "blocked" ? "Try location" : "Enable location"}
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="rounded-full border bg-white px-3 py-2 text-xs font-black disabled:opacity-50"
            style={{ borderColor: "#D1FAE5", color: "#047857" }}
          >
            {loading ? "Checking" : "Refresh"}
          </button>
        </div>
      </div>
      {joinMessage && <ErrorBox message={joinMessage} />}
      <div className="grid gap-2 md:grid-cols-3">
        {loading ? (
          [0, 1, 2].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-2xl border bg-white/70" style={{ borderColor: "#E2E8F0" }} />
          ))
        ) : challenges.length === 0 ? (
          <div className="md:col-span-3 rounded-2xl border bg-white px-4 py-4 text-sm font-semibold" style={{ borderColor: "#E2E8F0", color: "#64748B" }}>
            No open public challenge is waiting right now.
          </div>
        ) : (
          challenges.slice(0, 3).map((challenge) => {
            const mine = userId === challenge.creatorId;
            const joined = Boolean(userId && challenge.participants.some((participant) => participant.user.id === userId));
            const distance = challenge.discovery?.distanceMiles;
            return (
              <article key={challenge.id} className="rounded-2xl border bg-white p-3 shadow-sm" style={{ borderColor: "#E2E8F0" }}>
                <div className="min-h-12">
                  <p className="line-clamp-2 text-sm font-extrabold" style={{ color: "#172033" }}>{challenge.title}</p>
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: "#64748B" }}>
                    @{challenge.creator.username} / {challenge.stake > 0 ? `${challenge.stake} pts` : "free"}
                    {distance != null ? ` / ${distance} mi` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onJoin(challenge)}
                  disabled={joiningId === challenge.id}
                  className="mt-3 w-full rounded-full px-3 py-2 text-xs font-black disabled:opacity-60"
                  style={{ background: mine ? "#F8FAFC" : "#A7F3D0", color: mine ? "#64748B" : "#065F46" }}
                >
                  {joiningId === challenge.id ? "Opening..." : mine ? "Open yours" : joined ? "Open room" : "Review rules"}
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

function LoadingCard({ title, body }: { title: string; body: string }) {
  return (
    <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="w-12 h-12 mx-auto mb-4 rounded-full border-[3px] border-t-transparent" style={{ borderColor: "#10B981", borderTopColor: "transparent" }} animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
      <p className="text-base font-extrabold" style={{ color: "#172033" }}>{title}</p>
      <p className="text-sm font-medium mt-2 max-w-lg mx-auto px-4 py-2 bg-white border" style={{ color: "#526078", borderColor: "#E2E8F0", borderRadius: "999px" }}>{body}</p>
    </motion.div>
  );
}

function ModelModeBar({
  prefs,
  onChange,
}: {
  prefs: OraclePrefs;
  onChange: (providerId: string, model?: string | null) => void;
}) {
  const visible = ["local_ollama", "deepseek", "moonshot", "openai", "anthropic"]
    .map((id) => LLM_PROVIDERS.find((provider) => provider.id === id))
    .filter(Boolean) as typeof LLM_PROVIDERS;
  const selectedProvider = getProviderById(prefs.providerId) ?? getProviderById(DEFAULT_LLM_PROVIDER_ID);
  const selectedModel = prefs.model || selectedProvider?.defaultModel || "";
  const modelOptions = selectedProvider?.models?.length ? selectedProvider.models : selectedModel ? [selectedModel] : [];
  const hasCustomSelectedModel = selectedModel && !modelOptions.includes(selectedModel);

  return (
    <div className="mt-4 flex justify-center">
      <div
        className="flex max-w-full items-center gap-2 rounded-full border bg-white px-3 py-2 shadow-sm"
        style={{ borderColor: "#DDE7F0" }}
      >
        <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: "#047857" }}>
          Model
        </span>
        <select
          value={selectedProvider?.id ?? DEFAULT_LLM_PROVIDER_ID}
          onChange={(event) => {
            const provider = getProviderById(event.target.value);
            onChange(event.target.value, provider?.defaultModel ?? null);
          }}
          className="max-w-[8.5rem] rounded-full border px-2.5 py-1.5 text-xs font-extrabold outline-none"
          style={{ borderColor: "#DDE7F0", color: "#172033", background: "#F8FAFC" }}
          aria-label="AI provider"
        >
          {visible.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.shortLabel}
            </option>
          ))}
        </select>
        <select
          value={selectedModel}
          onChange={(event) => onChange(selectedProvider?.id ?? DEFAULT_LLM_PROVIDER_ID, event.target.value)}
          className="max-w-[11rem] rounded-full border px-2.5 py-1.5 text-xs font-bold outline-none"
          style={{ borderColor: "#DDE7F0", color: "#526078", background: "#FFFFFF" }}
          aria-label="AI model"
        >
          {hasCustomSelectedModel && <option value={selectedModel}>{selectedModel}</option>}
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function ChallengeSpecPreview({
  protocol,
  prompt,
  model,
  source,
  providerId,
  externalApiCharged,
  onSelectInvite,
  onSelectParticipation,
  onSelectVisibility,
}: {
  protocol: api.ProtocolSpecV2;
  prompt: string;
  model: string;
  source: "llm" | "safety_prefilter" | "fallback" | "";
  providerId: string;
  externalApiCharged: boolean;
  onSelectInvite: (value: "invite_link" | "nearby" | "same_device") => void;
  onSelectParticipation: (value: "remote_async" | "remote_live" | "same_camera" | "in_person") => void;
  onSelectVisibility: (value: "public" | "private") => void;
}) {
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
    protocol.identityProtocol.required ? "identity binding" : "account identity",
    protocol.settlementProtocol.mode.replace(/_/g, " "),
    `confidence ${Math.round(protocol.settlementProtocol.autoSettleConfidenceThreshold * 100)}%`,
    protocol.riskPolicy.allowed ? "settlement eligible if gates pass" : "blocked",
  ].join(" -> ");
  const inviteOptions: Array<{ value: "invite_link" | "nearby" | "same_device"; label: string; description: string }> = [
    { value: "invite_link", label: "Invite link", description: "Send Jerry or another opponent a private join link." },
    { value: "nearby", label: "Nearby discovery", description: "Make it public so nearby users can discover and join." },
    { value: "same_device", label: "Same device invite", description: "Both people are together and one phone starts the flow." },
  ];
  const participationOptions: Array<{ value: "remote_async" | "remote_live" | "same_camera" | "in_person"; label: string; description: string }> = [
    { value: "remote_async", label: "Remote async", description: "Each participant records and uploads separately." },
    { value: "remote_live", label: "Remote live", description: "Both participants start around the same time." },
    { value: "same_camera", label: "Same camera", description: "One phone records both participants in a single clip." },
    { value: "in_person", label: "In person", description: "Participants meet and submit one shared or witnessed result." },
  ];
  return (
    <section className="bg-white border shadow-sm" style={{ borderColor: "#E2E8F0", borderRadius: "22px" }}>
      <div className="p-5 border-b" style={{ borderColor: "#EEF2F7" }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#047857" }}>Generated from: {prompt}</p>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: "#172033" }}>{protocol.title}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>{protocol.participantMode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.outcomeType.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.evidenceProtocol.mode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.identityProtocol.mode.replace(/_/g, " ")}</Pill>
          <Pill>{protocol.locationProtocol.locationPrivacy.replace(/_/g, " ")}</Pill>
          <Pill>vs {opponent}</Pill>
          {model && <Pill>{source === "llm" ? "AI model" : source === "safety_prefilter" ? "safety gate" : "fallback"}: {model}</Pill>}
          {providerId && <Pill>{externalApiCharged ? "paid API enabled" : "no paid API"}: {providerId}</Pill>}
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <SpecBlock title="What you are playing" body={protocol.userFacingSummary} />
        <SpecBlock title="Who can join" body={`${protocol.participantMode.replace(/_/g, " ")}. Location mode: ${protocol.locationProtocol.mode.replace(/_/g, " ")}.`} />
        <SpecBlock title="Identity verification" body={`${protocol.identityProtocol.required ? "Required" : "Optional"} via ${protocol.identityProtocol.mode.replace(/_/g, " ")}. Auto-settle requires ${Math.round(protocol.identityProtocol.autoSettlementRequiresIdentityConfidence * 100)}% identity confidence.`} />
        <SpecBlock title="Evidence required" body={protocol.evidenceProtocol.requiredEvidence.join(" ")} />
        <SpecBlock title="Capture instructions" body={protocol.evidenceProtocol.captureInstructions.join(" ")} />
        <SpecBlock title="Winner logic" body={protocol.settlementProtocol.winCondition} />
        <SpecBlock title="AI judging" body={protocol.settlementProtocol.judgeInstructions.join(" ")} />
        <SpecBlock title="Manual review triggers" body={protocol.settlementProtocol.manualReviewTriggers.join(" ")} />
        <SpecBlock title="Safety / risk" body={`${protocol.riskPolicy.riskLevel}. ${protocol.riskPolicy.blockedReason || protocol.riskPolicy.warnings.join(" ") || "No extra warning."}${protocol.riskPolicy.safeAlternative ? ` Safe alternative: ${protocol.riskPolicy.safeAlternative}` : ""}`} />
        <SpecBlock title="AI cost tier" body={`${protocol.aiBudgetPolicy.estimatedCostTier}. Max vision frames: ${protocol.aiBudgetPolicy.maxVisionFrames}. Escalation: ${protocol.aiBudgetPolicy.allowEscalation ? "allowed" : "off"}.`} />
      </div>
      <div className="grid gap-5 px-5 pb-5">
        <OptionSection
          title="Invite mode"
          subtitle="How the opponent finds or enters this challenge."
          value={inviteValue}
          options={inviteOptions}
          onSelect={(value) => onSelectInvite(value as "invite_link" | "nearby" | "same_device")}
        />
        <OptionSection
          title="Participation mode"
          subtitle="How evidence is captured once the challenge is live."
          value={participationValue}
          options={participationOptions}
          onSelect={(value) => onSelectParticipation(value as "remote_async" | "remote_live" | "same_camera" | "in_person")}
        />
        <OptionSection
          title="Visibility"
          subtitle="Whether this is private by link or discoverable."
          value={visibilityValue}
          options={[
            { value: "private", label: "Private", description: "Only people with the invite can join." },
            { value: "public", label: "Public / nearby", description: "Open to nearby discovery and public browsing." },
          ]}
          onSelect={(value) => onSelectVisibility(value as "public" | "private")}
        />
        <div className="grid gap-2 rounded-2xl border p-4" style={{ borderColor: "#D1FAE5", background: "#F8FAFC" }}>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#047857" }}>Selected challenge path</p>
          <p className="text-sm font-bold" style={{ color: "#172033" }}>
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
        <p className="text-xs font-semibold" style={{ color: "#64748B" }}>{subtitle}</p>
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
              <p className="text-xs font-medium mt-1" style={{ color: "#526078" }}>{option.description}</p>
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
      <p className="text-sm font-semibold leading-relaxed" style={{ color: "#172033" }}>{body}</p>
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
