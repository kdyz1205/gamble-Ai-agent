"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import CenteredComposer from "@/components/CenteredComposer";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { LLM_PROVIDERS, getProviderById } from "@/lib/llm-providers";
import { readOracleLlmPrefs, writeOracleLlmPrefs } from "@/lib/oracle-prefs";

type AppState = "idle" | "generating" | "preview" | "confirming" | "published";
type OraclePrefs = { providerId: string; model: string | null };

const MODEL_TEXT_ALIASES: Array<{ pattern: RegExp; providerId: string }> = [
  { pattern: /^(?:local|llama|ollama)$/i, providerId: "local_ollama" },
  { pattern: /^(?:deepseek|deep seeker)$/i, providerId: "deepseek" },
  { pattern: /^(?:kimi|moonshot)$/i, providerId: "moonshot" },
  { pattern: /^(?:gpt|openai|premium)$/i, providerId: "openai" },
  { pattern: /^(?:claude|anthropic)$/i, providerId: "anthropic" },
];

function initialOraclePrefs(): OraclePrefs {
  const prefs = readOracleLlmPrefs();
  const provider = (prefs.providerId ? getProviderById(prefs.providerId) : undefined) ?? getProviderById("local_ollama");
  return {
    providerId: provider?.id ?? "local_ollama",
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

function rulesFromSpec(spec: api.ChallengeSpec): string {
  return [
    `Objective: ${spec.objective}`,
    `Winning condition: ${spec.winning_condition}`,
    `Evidence: ${spec.required_evidence}`,
    `Recording: ${spec.video_capture_instructions}`,
    `Start: ${spec.start_condition}`,
    `End: ${spec.end_condition}`,
    `Timing: ${spec.timing_method}`,
    `Valid rep: ${spec.valid_repetition_definition}`,
    `Scoring: ${spec.scoring_method}`,
    `Attempts: ${spec.allowed_attempts}`,
    `Anti-cheat: ${spec.anti_cheat_rules.join(" ")}`,
    `AI judging: ${spec.ai_judging_method}`,
    `Dispute: ${spec.dispute_window}. ${spec.fallback_manual_review}`,
    `Settlement: ${spec.payout_rule}`,
    `Safety: ${spec.safety_warning}`,
  ].join("\n");
}

function getBrowserLocationSnapshot(timeoutMs = 3500): Promise<api.LocationSnapshot | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        if (Number.isFinite(lat) && Number.isFinite(lng)) resolve({ lat, lng });
        else resolve(null);
      },
      () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}

export default function Home() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;
  const user = useMemo(
    () => rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined,
    [rawUser],
  );

  const [appState, setAppState] = useState<AppState>("idle");
  const [prompt, setPrompt] = useState("");
  const [spec, setSpec] = useState<api.ChallengeSpec | null>(null);
  const [specModel, setSpecModel] = useState("");
  const [specSource, setSpecSource] = useState<"llm" | "fallback" | "">("");
  const [specProviderId, setSpecProviderId] = useState("");
  const [externalApiCharged, setExternalApiCharged] = useState(false);
  const [oraclePrefs, setOraclePrefs] = useState<OraclePrefs>(() => initialOraclePrefs());
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [openChallenges, setOpenChallenges] = useState<api.ChallengeData[]>([]);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinMessage, setJoinMessage] = useState<string | null>(null);

  const reset = useCallback(() => {
    setAppState("idle");
    setPrompt("");
    setSpec(null);
    setSpecModel("");
    setSpecSource("");
    setSpecProviderId("");
    setExternalApiCharged(false);
    setShareLink(null);
    setPublishedId(null);
    setError(null);
    setCopied(false);
  }, []);

  const handleGenerate = useCallback(async (input: string) => {
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
      const res = await api.generateChallengeSpec(directive.prompt, nextPrefs);
      setSpec(res.spec);
      setSpecModel(res.model);
      setSpecSource(res.source || "");
      setSpecProviderId(res.providerId || nextPrefs.providerId);
      setExternalApiCharged(Boolean(res.externalApiCharged));
      setAppState("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate challenge spec");
      setAppState("idle");
    }
  }, [oraclePrefs]);

  const handleSelectProvider = useCallback((providerId: string) => {
    const provider = getProviderById(providerId);
    if (!provider) return;
    const nextPrefs = { providerId, model: provider.defaultModel };
    setOraclePrefs(nextPrefs);
    writeOracleLlmPrefs(nextPrefs.providerId, nextPrefs.model);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!spec) return;
    if (!user) {
      setShowAuth(true);
      return;
    }

    setError(null);
    setAppState("confirming");
    try {
      const isPublic = spec.public_or_private === "public" || spec.invite_mode === "nearby";
      const locationSnapshot = isPublic ? await getBrowserLocationSnapshot() : null;
      const res = await api.createChallenge({
        title: spec.challenge_title,
        description: spec.objective,
        type: spec.challenge_type,
        rawPrompt: prompt,
        challengeSpecJson: JSON.stringify(spec),
        marketType: "ai_peer_challenge",
        proposition: spec.objective,
        stake: spec.stake_amount,
        stakeToken: "credits",
        currencyType: spec.currency_or_points,
        participationMode: spec.participation_mode,
        deadline: undefined,
        joinWindow: spec.invite_mode,
        proofWindow: "until all participants submit evidence",
        rules: rulesFromSpec(spec),
        evidenceType: spec.participation_mode === "same_camera" ? "same_camera_video" : "video",
        settlementMode: "oracle",
        proofSource: spec.participation_mode === "same_camera" ? "shared_same_camera" : "both_participants",
        arbiter: "ai_then_manual_review",
        fallbackRule: spec.fallback_manual_review,
        disputeWindow: spec.dispute_window,
        aiReview: true,
        isPublic,
        visibility: isPublic ? "public" : "invite_only",
        ...(locationSnapshot
          ? { discoveryLat: locationSnapshot.lat, discoveryLng: locationSnapshot.lng }
          : {}),
      });
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      setPublishedId(res.challenge.id);
      setShareLink(`${origin}/join/${res.challenge.id}`);
      setAppState("published");
      await updateSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm challenge");
      setAppState("preview");
    }
  }, [prompt, spec, updateSession, user]);

  const handleSelectInvite = useCallback((value: api.ChallengeSpec["invite_mode"]) => {
    setSpec((current) => {
      if (!current) return current;
      return {
        ...current,
        invite_mode: value,
        public_or_private: value === "nearby" ? "public" : current.public_or_private,
        participation_mode: value === "same_device" ? "same_camera" : current.participation_mode,
      };
    });
  }, []);

  const handleSelectParticipation = useCallback((value: api.ChallengeSpec["participation_mode"]) => {
    setSpec((current) => {
      if (!current) return current;
      return {
        ...current,
        participation_mode: value,
      };
    });
  }, []);

  const loadOpenChallenges = useCallback(async () => {
    setDiscoveryLoading(true);
    setJoinMessage(null);
    try {
      let locationSnapshot: api.LocationSnapshot | null = null;
      if (typeof navigator !== "undefined" && navigator.geolocation) {
        locationSnapshot = await getBrowserLocationSnapshot(2500);
        if (locationSnapshot && user) {
          void api.updateMyLocation(locationSnapshot).catch(() => null);
        }
      }

      const res = await api.discoverChallenges({
        ...(locationSnapshot ? { lat: locationSnapshot.lat, lng: locationSnapshot.lng } : {}),
        limit: 6,
      });
      const visible = res.challenges.filter((challenge) => (
        challenge.status === "open" &&
        challenge.participants.length < (challenge.maxParticipants ?? 2)
      ));
      setOpenChallenges(visible);
      setDiscoveryMessage(
        locationSnapshot
          ? res.levelMessage
          : "Location not enabled yet. Showing open public challenges globally.",
      );
    } catch (err) {
      setOpenChallenges([]);
      setDiscoveryMessage(err instanceof Error ? err.message : "Could not load open challenges.");
    } finally {
      setDiscoveryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOpenChallenges();
  }, [loadOpenChallenges]);

  const handleJoinChallenge = useCallback(async (challenge: api.ChallengeData) => {
    setJoinMessage(null);
    if (!user) {
      setShowAuth(true);
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

    setJoiningId(challenge.id);
    try {
      await api.acceptChallenge(challenge.id);
      router.push(`/challenge/${challenge.id}/versus`);
    } catch (err) {
      setJoinMessage(err instanceof Error ? err.message : "Could not join this challenge.");
      await loadOpenChallenges();
    } finally {
      setJoiningId(null);
    }
  }, [loadOpenChallenges, router, user]);

  const handleSelectVisibility = useCallback((value: api.ChallengeSpec["public_or_private"]) => {
    setSpec((current) => {
      if (!current) return current;
      return {
        ...current,
        public_or_private: value,
        invite_mode: value === "public" && current.invite_mode === "invite_link" ? "nearby" : current.invite_mode,
      };
    });
  }, []);

  const copyLink = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
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
              <ModelModeBar prefs={oraclePrefs} onSelectProvider={handleSelectProvider} />
              <OpenChallengeStrip
                userId={user?.id}
                challenges={openChallenges}
                loading={discoveryLoading}
                message={discoveryMessage}
                joiningId={joiningId}
                joinMessage={joinMessage}
                onRefresh={loadOpenChallenges}
                onJoin={handleJoinChallenge}
              />
            </motion.div>
          )}

          {appState === "generating" && (
            <LoadingCard title="Generating executable challenge..." body={prompt} />
          )}

          {appState === "preview" && spec && (
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
                spec={spec}
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
                <button onClick={handleConfirm} className="py-4 text-sm font-extrabold rounded-full shadow-sm active:scale-95 transition" style={{ background: "#10B981", color: "#FFFFFF" }}>
                  Confirm challenge
                </button>
                <button onClick={() => setAppState("idle")} className="py-4 text-sm font-extrabold rounded-full border bg-white active:scale-95 transition" style={{ color: "#172033", borderColor: "#E2E8F0" }}>
                  Revise with AI
                </button>
              </div>
            </motion.div>
          )}

          {appState === "confirming" && (
            <LoadingCard title="Creating invite, escrow, and challenge room..." body={spec?.challenge_title || prompt} />
          )}

          {appState === "published" && spec && shareLink && (
            <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              <div className="text-center">
                <h2 className="text-3xl font-extrabold mb-2" style={{ color: "#172033" }}>Challenge is ready</h2>
                <p className="text-sm font-semibold" style={{ color: "#526078" }}>{spec.challenge_title}</p>
              </div>
              <div className="flex items-center gap-2 p-2 bg-white border shadow-sm" style={{ borderColor: "#E2E8F0", borderRadius: "18px" }}>
                <input readOnly value={shareLink} className="flex-1 bg-transparent px-3 py-2 text-sm font-semibold focus:outline-none truncate" style={{ color: "#172033" }} />
                <button onClick={copyLink} className="px-4 py-2 text-sm font-bold rounded-full" style={{ background: copied ? "#A7F3D0" : "#10B981", color: copied ? "#064E3B" : "#FFFFFF" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <button onClick={() => publishedId && router.push(`/challenge/${publishedId}`)} className="py-3 text-sm font-bold rounded-full" style={{ background: "#10B981", color: "#FFFFFF" }}>Challenge room</button>
                <button onClick={() => router.push("/markets")} className="py-3 text-sm font-bold rounded-full bg-white border" style={{ color: "#047857", borderColor: "#D1FAE5" }}>Public list</button>
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
  onRefresh,
  onJoin,
}: {
  userId?: string;
  challenges: api.ChallengeData[];
  loading: boolean;
  message: string;
  joiningId: string | null;
  joinMessage: string | null;
  onRefresh: () => void;
  onJoin: (challenge: api.ChallengeData) => void;
}) {
  return (
    <section className="mt-6 text-left">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-wide" style={{ color: "#047857" }}>Join nearby</p>
          <p className="text-xs font-semibold" style={{ color: "#64748B" }}>
            {message || "Open public challenges waiting for an opponent."}
          </p>
        </div>
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
                  {joiningId === challenge.id ? "Joining..." : mine ? "Open yours" : joined ? "Open room" : "Join challenge"}
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
  onSelectProvider,
}: {
  prefs: OraclePrefs;
  onSelectProvider: (providerId: string) => void;
}) {
  const visible = ["local_ollama", "deepseek", "moonshot", "openai", "anthropic"]
    .map((id) => LLM_PROVIDERS.find((provider) => provider.id === id))
    .filter(Boolean) as typeof LLM_PROVIDERS;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {visible.map((provider) => {
        const selected = prefs.providerId === provider.id;
        return (
          <button
            key={provider.id}
            type="button"
            onClick={() => onSelectProvider(provider.id)}
            className="rounded-full border px-3 py-2 text-xs font-black transition"
            style={{
              borderColor: selected ? "#10B981" : "#DDE7F0",
              background: selected ? "#D1FAE5" : "#FFFFFF",
              color: selected ? "#047857" : "#526078",
            }}
          >
            {provider.shortLabel}
          </button>
        );
      })}
      <span className="rounded-full border px-3 py-2 text-xs font-bold" style={{ borderColor: "#E2E8F0", color: "#64748B", background: "#F8FAFC" }}>
        {prefs.model || getProviderById(prefs.providerId)?.defaultModel || "model"}
      </span>
    </div>
  );
}

function ChallengeSpecPreview({
  spec,
  prompt,
  model,
  source,
  providerId,
  externalApiCharged,
  onSelectInvite,
  onSelectParticipation,
  onSelectVisibility,
}: {
  spec: api.ChallengeSpec;
  prompt: string;
  model: string;
  source: "llm" | "fallback" | "";
  providerId: string;
  externalApiCharged: boolean;
  onSelectInvite: (value: api.ChallengeSpec["invite_mode"]) => void;
  onSelectParticipation: (value: api.ChallengeSpec["participation_mode"]) => void;
  onSelectVisibility: (value: api.ChallengeSpec["public_or_private"]) => void;
}) {
  const opponent = spec.participants.find((p) => p.role === "opponent")?.label || "Opponent";
  const challengePathText = [
    spec.invite_mode.replace(/_/g, " "),
    spec.participation_mode.replace(/_/g, " "),
    "evidence upload",
    "AI judging",
    spec.fallback_manual_review.includes("0.85") ? "manual review if low confidence" : "review gate",
    "point settlement",
  ].join(" -> ");
  const inviteOptions: Array<{ value: api.ChallengeSpec["invite_mode"]; label: string; description: string }> = [
    { value: "invite_link", label: "Invite link", description: "Send Jerry or another opponent a private join link." },
    { value: "nearby", label: "Nearby discovery", description: "Make it public so nearby users can discover and join." },
    { value: "direct_friend", label: "Direct friend", description: "Reserve this for a named friend invite." },
    { value: "same_device", label: "Same device invite", description: "Both people are together and one phone starts the flow." },
  ];
  const participationOptions: Array<{ value: api.ChallengeSpec["participation_mode"]; label: string; description: string }> = [
    { value: "remote_async", label: "Remote async", description: "Each participant records and uploads separately." },
    { value: "remote_live", label: "Remote live", description: "Both participants start around the same time." },
    { value: "same_camera", label: "Same camera", description: "One phone records both participants in a single clip." },
    { value: "in_person", label: "In person", description: "Participants meet and submit one shared or witnessed result." },
  ];
  return (
    <section className="bg-white border shadow-sm" style={{ borderColor: "#E2E8F0", borderRadius: "22px" }}>
      <div className="p-5 border-b" style={{ borderColor: "#EEF2F7" }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#047857" }}>Generated from: {prompt}</p>
        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ color: "#172033" }}>{spec.challenge_title}</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill>{spec.challenge_type.replace(/_/g, " ")}</Pill>
          <Pill>{spec.stake_amount} credits</Pill>
          <Pill>{spec.public_or_private}</Pill>
          <Pill>{spec.participation_mode.replace(/_/g, " ")}</Pill>
          <Pill>vs {opponent}</Pill>
          {model && <Pill>{source === "llm" ? "AI model" : "fallback"}: {model}</Pill>}
          {providerId && <Pill>{externalApiCharged ? "paid API enabled" : "no paid API"}: {providerId}</Pill>}
        </div>
      </div>
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <SpecBlock title="Objective" body={spec.objective} />
        <SpecBlock title="Winner logic" body={spec.winning_condition} />
        <SpecBlock title="Evidence" body={spec.required_evidence} />
        <SpecBlock title="Recording instructions" body={spec.video_capture_instructions} />
        <SpecBlock title="Start / end" body={`${spec.start_condition} ${spec.end_condition}`} />
        <SpecBlock title="Valid rep definition" body={spec.valid_repetition_definition} />
        <SpecBlock title="Scoring method" body={spec.scoring_method} />
        <SpecBlock title="AI judging" body={spec.ai_judging_method} />
        <SpecBlock title="Dispute and review" body={`${spec.dispute_window}. ${spec.fallback_manual_review}`} />
        <SpecBlock title="Settlement" body={spec.payout_rule} />
      </div>
      <div className="grid gap-5 px-5 pb-5">
        <OptionSection
          title="Invite mode"
          subtitle="How the opponent finds or enters this challenge."
          value={spec.invite_mode}
          options={inviteOptions}
          onSelect={(value) => onSelectInvite(value as api.ChallengeSpec["invite_mode"])}
        />
        <OptionSection
          title="Participation mode"
          subtitle="How evidence is captured once the challenge is live."
          value={spec.participation_mode}
          options={participationOptions}
          onSelect={(value) => onSelectParticipation(value as api.ChallengeSpec["participation_mode"])}
        />
        <OptionSection
          title="Visibility"
          subtitle="Whether this is private by link or discoverable."
          value={spec.public_or_private}
          options={[
            { value: "private", label: "Private", description: "Only people with the invite can join." },
            { value: "public", label: "Public / nearby", description: "Open to nearby discovery and public browsing." },
          ]}
          onSelect={(value) => onSelectVisibility(value as api.ChallengeSpec["public_or_private"])}
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
