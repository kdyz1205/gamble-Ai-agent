/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";
import EvidenceUploader from "./EvidenceUploader";
import { acceptanceContract, compactChallengeRules, parseChallengeRules, settlementSummary } from "@/lib/challenge-display";
import {
  isAiReviewStatus,
  isEvidenceWindowStatus,
  isOpenForOpponentStatus,
  isVerdictReadyStatus,
  statusLabel as lifecycleStatusLabel,
} from "@/lib/challenge-state-machine";

const TIER_COST: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 25 };
const TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Haiku", 2: "Sonnet", 3: "Opus" };
const TIER_DESC: Record<1 | 2 | 3, string> = {
  1: "Fast & efficient",
  2: "Balanced judgment",
  3: "Maximum intelligence",
};

function statusColor(s: string) {
  const m: Record<string, { color: string; bg: string; border: string }> = {
    open:    { color: "#a78bfa", bg: "rgba(124,92,252,0.1)",  border: "rgba(124,92,252,0.25)" },
    live:    { color: "#00e87a", bg: "rgba(0,232,122,0.1)",   border: "rgba(0,232,122,0.25)" },
    judging:            { color: "#f5a623", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)" },
    pending_settlement: { color: "#f5a623", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)" },
    disputed:           { color: "#f5a623", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)" },
    settled:            { color: "#00e87a", bg: "rgba(0,232,122,0.1)",   border: "rgba(0,232,122,0.25)" },
  };
  return m[s] ?? m.open;
}

/* ── Typewriter for verdict reasoning ── */
function TypewriterReasoning({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, 14);
    return () => clearInterval(timer);
  }, [text]);

  return (
    <span>
      {displayed}
      {!done && <span className="typewriter-cursor">&nbsp;</span>}
    </span>
  );
}

function parseJudgmentMetrics(row: { metricsJson?: string | null; confidence?: number | null; winnerId?: string | null } | null) {
  let metrics: Record<string, unknown> = {};
  if (row?.metricsJson) {
    try {
      const parsed = JSON.parse(row.metricsJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) metrics = parsed as Record<string, unknown>;
    } catch {
      metrics = {};
    }
  }
  const evidenceQuality =
    typeof metrics.evidenceQuality === "string" ? metrics.evidenceQuality : row?.winnerId && (row.confidence ?? 0) >= 0.85 ? "good" : "unclear";
  const recommendation =
    typeof metrics.recommendation === "string"
      ? metrics.recommendation
      : typeof metrics.settlementRecommendation === "string"
        ? metrics.settlementRecommendation
        : row?.winnerId && (row.confidence ?? 0) >= 0.85 ? "settle_winner" : "needs_review";
  const blockingIssues = Array.isArray(metrics.blockingIssues)
    ? metrics.blockingIssues.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const inferredAutoSettleEligible =
    recommendation === "settle_winner" &&
    evidenceQuality === "good" &&
    (row?.confidence ?? 0) >= 0.85 &&
    Boolean(row?.winnerId) &&
    blockingIssues.length === 0;
  const providerCall =
    metrics.providerCall && typeof metrics.providerCall === "object" && !Array.isArray(metrics.providerCall)
      ? metrics.providerCall as Record<string, unknown>
      : null;
  const videoMetrics =
    metrics.videoMetrics && typeof metrics.videoMetrics === "object" && !Array.isArray(metrics.videoMetrics)
      ? metrics.videoMetrics as Record<string, unknown>
      : null;
  return {
    evidenceQuality,
    recommendation,
    source: typeof metrics.source === "string" ? metrics.source : null,
    providerCall,
    videoMetrics,
    blockingIssues,
    autoSettleEligible:
      typeof metrics.autoSettleEligible === "boolean" ? metrics.autoSettleEligible : inferredAutoSettleEligible,
    autoSettleBlockReason: typeof metrics.autoSettleBlockReason === "string" ? metrics.autoSettleBlockReason : null,
  };
}

function displayEnum(value: string | null | undefined) {
  return value ? value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()) : "Unknown";
}

function providerCallSummary(providerCall: Record<string, unknown> | null) {
  if (!providerCall) return "Not recorded";
  const provider = typeof providerCall.providerLabel === "string"
    ? providerCall.providerLabel
    : typeof providerCall.providerId === "string" ? providerCall.providerId : "Provider";
  const model = typeof providerCall.model === "string" ? providerCall.model : "";
  const status = typeof providerCall.httpStatus === "number" ? `HTTP ${providerCall.httpStatus}` : "SDK";
  const kind = typeof providerCall.requestKind === "string" ? providerCall.requestKind : "call";
  const duration = typeof providerCall.durationMs === "number" ? `${providerCall.durationMs}ms` : "";
  return [provider, model, status, kind, duration].filter(Boolean).join(" · ");
}

function providerResponseId(providerCall: Record<string, unknown> | null) {
  if (!providerCall || typeof providerCall.responseId !== "string" || !providerCall.responseId.trim()) return "";
  const id = providerCall.responseId.trim();
  return id.length > 28 ? `${id.slice(0, 18)}...${id.slice(-6)}` : id;
}

function participantVideoMetrics(videoMetrics: Record<string, unknown> | null, key: "participantA" | "participantB") {
  const value = videoMetrics?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function metricBool(value: unknown) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Unknown";
}

function metricCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "Unknown";
}

function metricNotes(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function isRejudgeableStatus(status: string) {
  return [
    "ai_verdict_ready",
    "dispute_window_open",
    "manual_review_required",
    "ai_inconclusive",
    "disputed",
  ].includes(status);
}

function isManualResolutionStatus(status: string) {
  return [
    "manual_review_required",
    "disputed",
    "ai_inconclusive",
    "dispute_window_open",
  ].includes(status);
}

function hasActiveNonCreatorParticipant(challenge: ChallengeDetail) {
  return challenge.participants.some(
    (participant) => participant.user.id !== challenge.creatorId && participant.status !== "declined",
  );
}

function managementLockReason(challenge: ChallengeDetail, isCreator: boolean) {
  if (!isCreator) return "Only the creator can manage this challenge.";
  if (hasActiveNonCreatorParticipant(challenge)) return "An opponent has joined, so this challenge cannot be deleted from the creator side.";
  const evidenceCount = challenge._count?.evidence ?? challenge.evidence?.length ?? 0;
  const judgmentCount = challenge._count?.judgments ?? challenge.judgments?.length ?? 0;
  if (evidenceCount > 0 || judgmentCount > 0) {
    return "Evidence or judgment history already exists. Use dispute, manual review, refund, or void instead of deleting it.";
  }
  if (!["draft", "cancelled"].includes(challenge.status) && !isOpenForOpponentStatus(challenge.status)) {
    return `Status "${lifecycleStatusLabel(challenge.status)}" is past the empty-challenge close window.`;
  }
  return null;
}

export default function ChallengeVerdictPanel({
  challengeId,
  userId,
  credits,
  onCreditsMayChange,
}: {
  challengeId: string;
  userId: string;
  credits: number;
  onCreditsMayChange: () => void;
}) {
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState(false);
  // (evidenceText / evidenceUrl state removed — evidence capture now lives
  // in <EvidenceUploader />; this panel is verdict + settle only.)
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [verdictErr, setVerdictErr] = useState("");
  const [asyncHint, setAsyncHint] = useState("");
  const [verdictRevealed, setVerdictRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const [origin, setOrigin] = useState("");
  const [acceptingChallenge, setAcceptingChallenge] = useState(false);
  const [acceptContractChecked, setAcceptContractChecked] = useState(false);
  const [manualReason, setManualReason] = useState("");
  const [manualWinnerId, setManualWinnerId] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!challengeId) return;
    setLoadErr("");
    try {
      const { challenge: c } = await api.getChallenge(challengeId);
      setChallenge(c);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Failed to load challenge");
    }
  }, [challengeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Dramatic verdict reveal delay
  useEffect(() => {
    if (challenge?.judgments?.[0] && !verdictRevealed) {
      const t = setTimeout(() => setVerdictRevealed(true), 600);
      return () => clearTimeout(t);
    }
  }, [challenge, verdictRevealed]);

  const me = challenge?.participants.find(p => p.user.id === userId);
  const accepted = challenge?.participants.filter(p => p.status === "accepted") ?? [];
  const evidenceByUser = new Map((challenge?.evidence ?? []).map(e => [e.userId, e] as const));
  const myEvidence = challenge?.evidence.find(e => e.userId === userId);
  const allSubmitted = challenge && accepted.length > 0 && accepted.every(p => evidenceByUser.has(p.user.id));

  const isCreator = challenge?.creatorId === userId;
  const canSubmitEvidence = challenge && isEvidenceWindowStatus(challenge.status) && !!me && !myEvidence;
  const canRunAi = challenge && isAiReviewStatus(challenge.status) && isCreator && challenge.judgments.length === 0;
  const canConfirmAi = challenge && isVerdictReadyStatus(challenge.status) && isCreator && challenge.judgments.length > 0;
  const canRejudge = challenge && isCreator && challenge.judgments.length > 0 && isRejudgeableStatus(challenge.status);
  const canRequestManualReview =
    challenge &&
    Boolean(me) &&
    isRejudgeableStatus(challenge.status) &&
    !["manual_review_required", "disputed"].includes(challenge.status);
  const canManualResolve = challenge && isCreator && isManualResolutionStatus(challenge.status);
  const settled = challenge?.status === "settled" || challenge?.status === "resolved";

  // Evidence submission moved to the dedicated <EvidenceUploader /> component
  // (src/components/EvidenceUploader.tsx) which handles record/photo/upload/URL
  // in one flow. This panel only orchestrates verdict + settlement now.

  const runVerdict = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (credits < cost) {
      setVerdictErr(`Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`);
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      const prefs = readOracleLlmPrefs();
      await api.judgeChallenge(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "AI verdict failed");
    } finally {
      setBusy(false);
    }
  };

  const runVerdictAsync = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (credits < cost) {
      setVerdictErr(`Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`);
      return;
    }
    setBusy(true);
    setVerdictErr("");
    setAsyncHint("");
    try {
      const prefs = readOracleLlmPrefs();
      const res = await api.judgeChallengeAsync(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      setAsyncHint("AI is analyzing evidence (video frames + vision)...");

      // Exponential backoff polling: 2s → 3s → 5s → 8s → 12s → 20s → 30s cap.
      // Replaces the old 2s-forever loop that at 1000 concurrent waiters did
      // 500 req/s against /api/judge-jobs/[id] for as long as anyone was
      // watching. Stops automatically after 15min (maxDuration + grace) so
      // even a stuck job doesn't loop forever.
      const BACKOFF_SEQUENCE = [2000, 3000, 5000, 8000, 12000, 20000, 30000];
      const MAX_TOTAL_MS = 15 * 60 * 1000; // hard stop at 15 minutes
      const pollStart = Date.now();
      let attempt = 0;
      let cancelled = false;

      const scheduleNext = () => {
        if (cancelled) return;
        if (Date.now() - pollStart > MAX_TOTAL_MS) {
          setBusy(false);
          setAsyncHint("");
          setVerdictErr("Verdict is taking longer than expected — please reload to check status.");
          return;
        }
        const delay = BACKOFF_SEQUENCE[Math.min(attempt, BACKOFF_SEQUENCE.length - 1)];
        attempt++;
        // Use nested setTimeout instead of setInterval so each tick is independently schedulable.
        const timerId = setTimeout(async () => {
          if (cancelled) return;
          try {
            const j = await api.getJudgeJob(res.jobId);
            if (j.status === "completed" || j.status === "failed") {
              cancelled = true;
              setBusy(false);
              setAsyncHint("");
              if (j.status === "failed") setVerdictErr(j.error || "Background verdict failed");
              await refresh();
              onCreditsMayChange();
              return;
            }
            scheduleNext();
          } catch {
            cancelled = true;
            setBusy(false);
            setAsyncHint("");
          }
        }, delay);
        // Store the timer so we can cancel on unmount — reuse pollRef to minimize code diff.
        pollRef.current = timerId as unknown as ReturnType<typeof setInterval>;
      };

      if (pollRef.current) clearInterval(pollRef.current);
      scheduleNext();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not start background verdict");
      setBusy(false);
    }
  };

  const confirmAiRecommendation = async () => {
    if (!challenge) return;
    setBusy(true);
    setVerdictErr("");
    try {
      await api.confirmVerdict(challenge.id);
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not confirm AI recommendation");
    } finally {
      setBusy(false);
    }
  };

  const requestManualReview = async () => {
    if (!challenge) return;
    setBusy(true);
    setVerdictErr("");
    try {
      await api.disputeChallenge(challenge.id, {
        reason: manualReason || "Participant requested manual review of the AI verdict.",
      });
      await refresh();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not request manual review");
    } finally {
      setBusy(false);
    }
  };

  const resolveManualReview = async (outcome: "winner" | "refund" | "void") => {
    if (!challenge) return;
    const winnerId = outcome === "winner"
      ? (manualWinnerId || accepted[0]?.user.id || null)
      : null;
    if (outcome === "winner" && !winnerId) {
      setVerdictErr("Pick a winner before resolving manual review.");
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      await api.manualResolveChallenge(challenge.id, {
        outcome,
        winnerId,
        reason: manualReason || "Creator resolved the manual review based on the submitted evidence.",
      });
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not resolve manual review");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/join/${challengeId}`;
    const showCopied = (message: string) => {
      setCopied(true);
      setCopyNotice(message);
      setTimeout(() => setCopied(false), 2000);
    };

    if (!navigator.clipboard?.writeText) {
      showCopied("Clipboard is blocked here. Use the visible join link.");
      return;
    }

    navigator.clipboard.writeText(url)
      .then(() => showCopied("Join link copied."))
      .catch(() => showCopied("Clipboard is blocked here. Use the visible join link."));
  };

  const runRejudge = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (credits < cost) {
      setVerdictErr(`Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`);
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      const prefs = readOracleLlmPrefs();
      await api.judgeChallenge(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
        rejudge: true,
        reason: "Creator disputed the previous AI verdict and requested another model pass.",
      });
      setVerdictRevealed(false);
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not rejudge this challenge");
    } finally {
      setBusy(false);
    }
  };

  const shareInvite = async () => {
    const url = `${window.location.origin}/join/${challengeId}`;
    const shareData = {
      title: challenge?.title || "Join my challenge",
      text: `Accept this challenge: ${challenge?.title || "Challenge"}`,
      url,
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // User cancelled native share sheet.
    }
  };

  const closeEmptyChallenge = async () => {
    if (!challenge) return;
    if (!window.confirm(`Close "${challenge.title}"? This only works before another participant joins.`)) return;
    setBusy(true);
    setVerdictErr("");
    try {
      await api.deleteChallenge(challenge.id);
      window.location.href = "/";
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not close this challenge");
    } finally {
      setBusy(false);
    }
  };

  const acceptFromContract = async () => {
    if (!challenge || !acceptContractChecked) return;
    setAcceptingChallenge(true);
    setVerdictErr("");
    try {
      await api.acceptChallenge(challenge.id, null, { acceptedRuleContract: true });
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not accept this challenge");
    } finally {
      setAcceptingChallenge(false);
    }
  };

  if (loadErr) {
    return (
      <div className="rounded-2xl p-5 text-sm font-bold glow-danger"
           style={{ background: "#FECACA", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "16px" }}>
        {loadErr}
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="rounded-2xl p-8 text-center">
        <motion.div
          className="w-8 h-8 rounded-lg mx-auto mb-3"
          style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.95, 1, 0.95] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <p className="text-sm text-text-muted">Loading challenge...</p>
      </div>
    );
  }

  const hasOpponent = hasActiveNonCreatorParticipant(challenge);
  const phaseMatchDone = hasOpponent || !isOpenForOpponentStatus(challenge.status);
  const phases = [
    { key: "match", done: phaseMatchDone, label: "Opponent", icon: "👤" },
    { key: "ev", done: Boolean(allSubmitted || settled), label: "Evidence", icon: "📸" },
    { key: "ai", done: Boolean(settled), label: "AI Verdict", icon: "⚡" },
  ];

  const verdictRow = challenge.judgments?.[0] ?? null;
  const sc = statusColor(challenge.status);
  const ruleCards = parseChallengeRules(challenge);
  const compactRules = compactChallengeRules(challenge);
  const contractBullets = acceptanceContract(challenge);
  const closeLockReason = managementLockReason(challenge, isCreator);
  const canCloseEmpty = !closeLockReason;
  const inviteUrl = `${origin || ""}/join/${challengeId}`;
  const verdictMetrics = parseJudgmentMetrics(verdictRow);
  const participantAMetrics = participantVideoMetrics(verdictMetrics.videoMetrics, "participantA");
  const participantBMetrics = participantVideoMetrics(verdictMetrics.videoMetrics, "participantB");
  const selectedManualWinnerId = manualWinnerId || accepted[0]?.user.id || "";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="lp-glass overflow-hidden"
      style={{
        borderRadius: "28px",
        boxShadow: "0 8px 30px rgba(15,23,42,0.04)",
      }}
    >
      <div className="p-6 md:p-7 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5" style={{ color: "#FDBA74" }}>The bet</p>
            <h3 className="text-xl font-black leading-tight" style={{ color: "#1E293B" }}>{challenge.title}</h3>
            <p className="text-xs mt-1.5 max-w-xl font-medium" style={{ color: "#64748B", lineHeight: 1.5 }}>
              This is an AI-judged challenge between two people. Join only if you agree to the rules, upload evidence when done, and the AI reviews the evidence to recommend a winner.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <motion.span
              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              {lifecycleStatusLabel(challenge.status)}
            </motion.span>
            {challenge.stake > 0 && (
              <span className="text-xs font-bold text-amber-400">{challenge.stake} credits at stake</span>
            )}
          </div>
        </div>

        {isOpenForOpponentStatus(challenge.status) && isCreator && (
          <motion.div
            className="space-y-3 p-4"
            style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "22px" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-extrabold" style={{ color: "#7C2D12" }}>Waiting for opponent</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: "#9A3412" }}>
                  Send the invite or keep it public so someone can join. The challenge starts when the opponent accepts the rule contract.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={shareInvite}
                  className="px-4 py-2 text-xs font-black"
                  style={{ background: "#FED7AA", color: "#7C2D12", borderRadius: "9999px", boxShadow: "0 4px 14px rgba(251,146,60,0.25)" }}
                >
                  Share to friend
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={copyLink}
                  className="px-4 py-2 text-xs font-black"
                  style={{ background: "#FFFFFF", color: "#334155", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
                >
                  {copied ? "Invite copied" : "Copy invite link"}
                </motion.button>
                {canCloseEmpty && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={busy}
                    onClick={() => void closeEmptyChallenge()}
                    className="px-4 py-2 text-xs font-black disabled:opacity-50"
                    style={{ background: "#FFFFFF", color: "#991B1B", border: "1px solid #FECACA", borderRadius: "9999px" }}
                  >
                    Close bet
                  </motion.button>
                )}
              </div>
            </div>
            <p className="text-[11px] font-bold" style={{ color: "#9A3412" }}>
              Escrow: {settlementSummary(challenge)}
            </p>
            <div className="flex flex-col gap-1">
              <input
                readOnly
                value={inviteUrl}
                className="w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold focus:outline-none"
                style={{ borderColor: "#FED7AA", color: "#7C2D12" }}
              />
              {copyNotice && (
                <p className="text-[11px] font-black" style={{ color: "#9A3412" }}>
                  {copyNotice}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {isCreator && (
          <motion.div
            className="space-y-3 p-4"
            style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "22px" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold" style={{ color: "#1E293B" }}>Manage challenge</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: closeLockReason ? "#991B1B" : "#047857" }}>
                  {closeLockReason || "No opponent, evidence, or judgment exists yet. You can close this challenge and refund the stake."}
                </p>
              </div>
              {canCloseEmpty ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => void closeEmptyChallenge()}
                  className="px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: "#FECACA", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "9999px" }}
                >
                  Close empty challenge
                </motion.button>
              ) : (
                <span
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
                  style={{ background: "#F1F5F9", color: "#64748B", borderRadius: "9999px" }}
                >
                  Locked
                </span>
              )}
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#047857" }}>
              How this challenge works
            </p>
            <p className="text-xs font-semibold mt-1" style={{ color: "#64748B" }}>
              The short version first. Full contract is below.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {compactRules.map((card) => (
              <div
                key={card.label}
                className="px-3.5 py-3"
                style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "16px" }}
              >
                <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: "#047857" }}>
                  {card.label}
                </p>
                <p className="text-xs font-semibold leading-relaxed" style={{ color: "#334155" }}>
                  {card.value}
                </p>
              </div>
            ))}
          </div>
          {ruleCards.length > 0 && (
            <details
              className="px-3.5 py-3"
              style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "16px" }}
            >
              <summary className="cursor-pointer text-xs font-black" style={{ color: "#334155" }}>
                Full rule contract
              </summary>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {ruleCards.map((card) => (
                  <div key={card.label}>
                    <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>
                      {card.label}
                    </p>
                    <p className="text-xs font-semibold leading-relaxed" style={{ color: "#334155" }}>
                      {card.value}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>

        {isOpenForOpponentStatus(challenge.status) && !isCreator && !me && (
          <div className="p-4" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "20px" }}>
            <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "#047857" }}>Before joining</p>
            <ul className="space-y-1.5">
              {contractBullets.map((item) => (
                <li key={item} className="text-xs font-semibold" style={{ color: "#334155", lineHeight: 1.5 }}>
                  - {item}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2 mt-3 text-xs font-bold cursor-pointer" style={{ color: "#334155" }}>
              <input
                type="checkbox"
                checked={acceptContractChecked}
                onChange={(event) => setAcceptContractChecked(event.target.checked)}
                className="mt-0.5"
              />
              <span>I accept this rule contract and understand the evidence, AI judging, dispute, and credit settlement terms.</span>
            </label>
            <motion.button
              type="button"
              disabled={!acceptContractChecked || acceptingChallenge}
              whileTap={{ scale: 0.97 }}
              onClick={() => void acceptFromContract()}
              className="mt-3 w-full py-3 text-sm font-black disabled:opacity-40"
              style={{ background: "#A7F3D0", color: "#065F46", borderRadius: "9999px" }}
            >
              {acceptingChallenge ? "Joining..." : "Accept rules and join"}
            </motion.button>
          </div>
        )}

        {/* Phase track */}
        <div className="flex items-center gap-2 flex-wrap">
          {phases.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <motion.div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: p.done ? "rgba(0,232,122,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${p.done ? "rgba(0,232,122,0.2)" : "rgba(255,255,255,0.06)"}`,
                }}
                whileHover={{ scale: 1.02 }}
              >
                <motion.span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{
                    background: p.done ? "#00e87a" : "rgba(255,255,255,0.08)",
                    color: p.done ? "#06060f" : "rgba(240,240,255,0.4)",
                  }}
                  animate={p.done ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  {p.done ? "✓" : i + 1}
                </motion.span>
                <span className={`text-[11px] font-bold ${p.done ? "text-success" : "text-text-muted"}`}>{p.label}</span>
              </motion.div>
              {i < phases.length - 1 && (
                <div className="hidden sm:block w-6 h-px" style={{
                  background: p.done ? "rgba(0,232,122,0.3)" : "rgba(255,255,255,0.06)"
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Participants + evidence checklist */}
        <div className="grid gap-2 sm:grid-cols-2">
          {accepted.map((p, i) => {
            const ev = evidenceByUser.get(p.user.id);
            const isMe = p.user.id === userId;
            const isCreator = p.role === "creator";
            return (
              <motion.div
                key={p.id}
                className="flex items-start gap-3 px-3.5 py-3"
                style={{
                  background: "#FFFFFF",
                  border: isMe ? "1.5px solid #FED7AA" : "1px solid #E2E8F0",
                  borderRadius: "18px",
                }}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, type: "spring", stiffness: 400, damping: 22 }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{
                    background: isCreator ? "#FED7AA" : "#E9D5FF",
                    color: isCreator ? "#7C2D12" : "#6B21A8",
                  }}
                >
                  {p.user.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate" style={{ color: "#1E293B" }}>
                    {p.user.username}
                    {isMe && <span className="text-[10px] ml-1.5 font-semibold" style={{ color: "#64748B" }}>(you)</span>}
                  </p>
                  <p className="text-[11px] font-semibold" style={{ color: "#64748B" }}>
                    {isCreator ? "Creator" : "Opponent"} · {ev ? "Evidence in" : "Waiting"}
                  </p>
                  {ev && (
                    <p className="text-xs font-medium mt-1.5 line-clamp-2" style={{ color: "#334155", lineHeight: 1.5 }}>{ev.description || ev.url || "—"}</p>
                  )}
                </div>
                {ev && (
                  <motion.div
                    className="w-5 h-5 rounded-full flex items-center justify-center mt-0.5 shrink-0"
                    style={{ background: "#A7F3D0" }}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="3" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Error display */}
        <AnimatePresence>
          {verdictErr && (
            <motion.div
              className="text-xs font-bold px-4 py-3 rounded-xl glow-danger"
              style={{ background: "#FECACA", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "16px" }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {verdictErr}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evidence form — rich uploader with camera, file, URL, and text */}
        <AnimatePresence mode="wait">
          {canSubmitEvidence && (
            <EvidenceUploader
              challengeId={challenge.id}
              evidenceType={challenge.evidenceType || "text"}
              onSubmitted={async () => {
                await refresh();
                onCreditsMayChange();
              }}
            />
          )}
        </AnimatePresence>

        {/* AI Judge section */}
        {isAiReviewStatus(challenge.status) && (
          <motion.div
            className="space-y-4 p-5"
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "24px",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "#FED7AA" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C2D12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: "#1E293B" }}>All evidence is in</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: "#64748B", lineHeight: 1.5 }}>
                  {isCreator ? "AI writes a recommendation. You confirm before credits settle." : "Waiting for the creator to start AI judgment."}
                </p>
              </div>
            </div>

            {isCreator && challenge.judgments.length === 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => {
                    const selected = tier === t;
                    return (
                      <motion.button
                        key={t}
                        type="button"
                        onClick={() => setTier(t)}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        className="p-3 text-center transition-colors"
                        style={{
                          background: selected ? "#FED7AA" : "#FFFFFF",
                          border: selected ? "1.5px solid #FDBA74" : "1px solid #E2E8F0",
                          borderRadius: "16px",
                        }}
                      >
                        <p className="text-xs font-bold" style={{ color: selected ? "#7C2D12" : "#334155" }}>
                          {TIER_LABEL[t]}
                        </p>
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: selected ? "#9A3412" : "#64748B" }}>{TIER_DESC[t]}</p>
                        <p className="text-[11px] font-bold mt-1" style={{ color: selected ? "#7C2D12" : "#94A3B8" }}>
                          {TIER_COST[t]} cr
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
                <motion.button
                  type="button"
                  disabled={busy || !canRunAi}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  onClick={() => void runVerdict()}
                  className="w-full py-3.5 text-sm font-extrabold disabled:opacity-40"
                  style={{
                    color: "#7C2D12",
                    background: "#FED7AA",
                    borderRadius: "9999px",
                    boxShadow: busy ? "none" : "0 4px 14px 0 rgba(251,146,60,0.39)",
                  }}
                >
                  {busy ? "Analyzing…" : `Generate AI recommendation · ${TIER_COST[tier]} cr`}
                </motion.button>
                <motion.button
                  type="button"
                  disabled={busy || !canRunAi}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  onClick={() => void runVerdictAsync()}
                  className="w-full py-2.5 text-xs font-semibold disabled:opacity-40"
                  style={{ color: "#64748B", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
                >
                  Run in background (recommended for long video)
                </motion.button>
                {asyncHint && (
                  <motion.p
                    className="text-xs font-semibold text-center"
                    style={{ color: "#64748B" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    {asyncHint}
                  </motion.p>
                )}
              </>
            )}
          </motion.div>
        )}

        {canConfirmAi && verdictRow && (
          <motion.div
            className="space-y-3 p-5"
            style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "24px" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <p className="text-sm font-bold" style={{ color: "#1E293B" }}>AI recommendation ready</p>
            <p className="text-xs font-medium" style={{ color: "#64748B", lineHeight: 1.5 }}>
              Not final yet. Confirm to settle credits, or leave for manual review.
            </p>
            {verdictMetrics.autoSettleEligible ? (
              <motion.button
                type="button"
                disabled={busy}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void confirmAiRecommendation()}
                className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #f5a623, #7c5cfc)",
                  boxShadow: "0 8px 40px rgba(245,166,35,0.2)",
                }}
              >
                {busy ? "Settling..." : "Confirm AI Recommendation & Settle"}
              </motion.button>
            ) : (
              <div className="p-3 text-xs font-semibold" style={{ color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "14px" }}>
                This verdict is not eligible for settlement. Run another AI pass or keep it in manual review.
              </div>
            )}

            {canRejudge && (
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748B" }}>Try another judge model</p>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => {
                    const selected = tier === t;
                    return (
                      <button
                        key={`rejudge-${t}`}
                        type="button"
                        onClick={() => setTier(t)}
                        className="p-2 text-center"
                        style={{
                          background: selected ? "#DBEAFE" : "#FFFFFF",
                          border: selected ? "1.5px solid #60A5FA" : "1px solid #E2E8F0",
                          borderRadius: "12px",
                        }}
                      >
                        <p className="text-[11px] font-extrabold" style={{ color: selected ? "#1D4ED8" : "#334155" }}>{TIER_LABEL[t]}</p>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: selected ? "#1E40AF" : "#94A3B8" }}>{TIER_COST[t]} cr</p>
                      </button>
                    );
                  })}
                </div>
                <motion.button
                  type="button"
                  disabled={busy}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void runRejudge()}
                  className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-40"
                  style={{ color: "#1D4ED8", background: "#EFF6FF", border: "1px solid #BFDBFE" }}
                >
                  {busy ? "Rejudging..." : `Rejudge with selected model · ${TIER_COST[tier]} cr`}
                </motion.button>
              </div>
            )}
          </motion.div>
        )}

        {(canRequestManualReview || canManualResolve) && (
          <motion.div
            className="space-y-3 p-5"
            style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "24px" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
          >
            <div>
              <p className="text-sm font-bold" style={{ color: "#1E293B" }}>Manual review</p>
              <p className="text-xs font-medium mt-1" style={{ color: "#64748B", lineHeight: 1.5 }}>
                Use this when the AI verdict is unclear or wrong. The review action is audited before credits move.
              </p>
            </div>
            <textarea
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              rows={3}
              placeholder="What is wrong or unclear about this verdict?"
              className="w-full resize-none rounded-2xl border px-3 py-2 text-xs font-semibold focus:outline-none"
              style={{ borderColor: "#E2E8F0", color: "#334155", background: "#F8FAFC" }}
            />
            {canRequestManualReview && (
              <motion.button
                type="button"
                disabled={busy}
                whileTap={{ scale: 0.98 }}
                onClick={() => void requestManualReview()}
                className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-40"
                style={{ color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A" }}
              >
                {busy ? "Requesting review..." : "Request manual review"}
              </motion.button>
            )}
            {canManualResolve && (
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Creator resolution
                </p>
                <select
                  value={selectedManualWinnerId}
                  onChange={(event) => setManualWinnerId(event.target.value)}
                  className="w-full rounded-xl border px-3 py-2 text-xs font-bold focus:outline-none"
                  style={{ borderColor: "#E2E8F0", color: "#334155", background: "#FFFFFF" }}
                >
                  {accepted.map((participant) => (
                    <option key={participant.user.id} value={participant.user.id}>
                      {participant.user.username} ({participant.role})
                    </option>
                  ))}
                </select>
                <div className="grid gap-2 sm:grid-cols-2">
                  <motion.button
                    type="button"
                    disabled={busy || !selectedManualWinnerId}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void resolveManualReview("winner")}
                    className="py-3 rounded-xl text-sm font-black disabled:opacity-40"
                    style={{ color: "#065F46", background: "#D1FAE5", border: "1px solid #A7F3D0" }}
                  >
                    {busy ? "Resolving..." : "Award selected winner"}
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={busy}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void resolveManualReview(challenge.stake > 0 ? "refund" : "void")}
                    className="py-3 rounded-xl text-sm font-black disabled:opacity-40"
                    style={{ color: "#334155", background: "#F8FAFC", border: "1px solid #E2E8F0" }}
                  >
                    {challenge.stake > 0 ? "Refund locked credits" : "Void challenge"}
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* VERDICT REVEAL */}
        <AnimatePresence>
          {verdictRow && verdictRevealed && (
            <motion.div
              key="verdict"
              className="space-y-4 p-5 md:p-6 rounded-2xl overflow-hidden verdict-enter"
              style={{
                background: "linear-gradient(165deg, rgba(0,232,122,0.06) 0%, rgba(124,92,252,0.03) 100%)",
                border: "1px solid rgba(0,232,122,0.2)",
                boxShadow: "0 16px 60px rgba(0,232,122,0.08)",
              }}
            >
              {/* Dramatic header */}
              <div className="text-center space-y-2">
                <motion.div
                  className="inline-flex w-12 h-12 rounded-xl items-center justify-center mx-auto"
                  style={{ background: "linear-gradient(135deg, #00e87a, #00d4c8)", boxShadow: "0 0 30px rgba(0,232,122,0.3)" }}
                  initial={{ scale: 0, rotate: -15 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </motion.div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-success">AI Verdict</p>
              </div>

              {/* Winner */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <motion.span
                  className="text-xl font-black text-text-primary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  Winner: <span className="text-success">@{verdictRow.winner?.username ?? "Tie / Void"}</span>
                </motion.span>
              </div>

              {/* Metadata */}
              <div className="flex flex-wrap justify-center gap-2">
                {verdictRow.aiModel && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/5 text-text-muted border border-border-subtle">
                    {verdictRow.aiModel}
                  </span>
                )}
                {typeof verdictRow.confidence === "number" && (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold"
                        style={{
                          background: verdictRow.confidence > 0.7 ? "rgba(0,232,122,0.1)" : "rgba(245,166,35,0.1)",
                          color: verdictRow.confidence > 0.7 ? "#00e87a" : "#f5a623",
                          border: `1px solid ${verdictRow.confidence > 0.7 ? "rgba(0,232,122,0.2)" : "rgba(245,166,35,0.2)"}`,
                        }}>
                    {(verdictRow.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Evidence quality</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.evidenceQuality === "good" ? "#047857" : "#9A3412" }}>
                    {displayEnum(verdictMetrics.evidenceQuality)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Recommendation</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.recommendation === "settle_winner" ? "#047857" : "#9A3412" }}>
                    {displayEnum(verdictMetrics.recommendation)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Settlement gate</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.autoSettleEligible ? "#047857" : "#9A3412" }}>
                    {verdictMetrics.autoSettleEligible ? "Eligible" : "Needs Review"}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Judge source</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.source === "fallback" ? "#9A3412" : "#047857" }}>
                    {displayEnum(verdictMetrics.source)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Provider call</p>
                  <p className="text-[11px] font-extrabold mt-1 leading-snug" style={{ color: verdictMetrics.providerCall?.usedApi ? "#047857" : "#9A3412" }}>
                    {providerCallSummary(verdictMetrics.providerCall)}
                  </p>
                  {providerResponseId(verdictMetrics.providerCall) && (
                    <p className="text-[10px] font-bold mt-1 truncate" style={{ color: "#64748B" }}>
                      {providerResponseId(verdictMetrics.providerCall)}
                    </p>
                  )}
                </div>
              </div>

              {verdictMetrics.blockingIssues.length > 0 && (
                <div className="p-4" style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "20px" }}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9A3412" }}>Blocking issues</p>
                  <ul className="space-y-1.5">
                    {verdictMetrics.blockingIssues.map((issue) => (
                      <li key={issue} className="text-xs font-semibold" style={{ color: "#7C2D12", lineHeight: 1.5 }}>
                        - {issue}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(participantAMetrics || participantBMetrics) && (
                <div className="p-4" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "20px" }}>
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-3" style={{ color: "#64748B" }}>
                    Video metrics
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      ["Participant A", participantAMetrics],
                      ["Participant B", participantBMetrics],
                    ].map(([label, metrics]) => metrics && (
                      <div key={label as string} className="p-3" style={{ background: "#F8FAFC", borderRadius: "16px" }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-black" style={{ color: "#1E293B" }}>{label as string}</p>
                          <span className="px-2 py-1 text-[10px] font-black" style={{ color: "#047857", background: "#D1FAE5", borderRadius: "9999px" }}>
                            {metricCount((metrics as Record<string, unknown>).validRepCount)} reps
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-bold" style={{ color: "#475569" }}>
                          <span>Full body: {metricBool((metrics as Record<string, unknown>).fullBodyVisible)}</span>
                          <span>Liveness: {metricBool((metrics as Record<string, unknown>).livenessPhraseVisible)}</span>
                          <span>Duration: {metricBool((metrics as Record<string, unknown>).fullDurationCovered)}</span>
                          <span>Continuous: {metricBool((metrics as Record<string, unknown>).continuousAttemptLikely)}</span>
                          <span>Too short: {metricBool((metrics as Record<string, unknown>).videoTooShort)}</span>
                          <span>Edit/loop: {metricBool((metrics as Record<string, unknown>).suspectedEditingOrLoop)}</span>
                        </div>
                        {metricNotes((metrics as Record<string, unknown>).invalidRepNotes).length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {metricNotes((metrics as Record<string, unknown>).invalidRepNotes).slice(0, 3).map((note) => (
                              <li key={note} className="text-[11px] font-semibold" style={{ color: "#7C2D12" }}>
                                - {note}
                              </li>
                            ))}
                          </ul>
                        )}
                        {typeof (metrics as Record<string, unknown>).reasonForManualReview === "string" && (
                          <p className="mt-2 text-[11px] font-semibold" style={{ color: "#9A3412" }}>
                            {(metrics as Record<string, unknown>).reasonForManualReview as string}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Reasoning with typewriter effect */}
              <div className="p-4" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "20px" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>AI Reasoning</p>
                <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed" style={{ color: "#334155", lineHeight: 1.6 }}>
                  <TypewriterReasoning text={verdictRow.reasoning ?? ""} />
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Verdict Receipt Card */}
        {verdictRow && settled && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 overflow-hidden"
            style={{
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              borderRadius: "24px",
              boxShadow: "0 8px 30px rgba(15,23,42,0.04)",
            }}
          >
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  Verdict receipt
                </span>
                <span className="text-[11px] font-semibold" style={{ color: "#94A3B8" }}>
                  {verdictRow.aiModel}
                </span>
              </div>

              <h4 className="text-base font-extrabold" style={{ color: "#1E293B" }}>
                {challenge.title}
              </h4>

              {verdictRow.winner && (
                <div
                  className="flex items-center gap-2 px-3 py-2"
                  style={{ background: "#A7F3D0", borderRadius: "12px" }}
                >
                  <span className="text-lg">🏆</span>
                  <span className="text-sm font-extrabold" style={{ color: "#065F46" }}>
                    {verdictRow.winner.username} wins
                  </span>
                </div>
              )}

              {verdictRow.reasoning && (
                <p className="text-sm font-medium leading-relaxed" style={{ color: "#334155", lineHeight: 1.6 }}>
                  {verdictRow.reasoning}
                </p>
              )}

              {verdictRow.confidence != null && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-semibold" style={{ color: "#64748B" }}>
                    <span>Confidence</span>
                    <span>{Math.round(verdictRow.confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden" style={{ background: "#F1F5F9", borderRadius: "999px" }}>
                    <motion.div
                      className="h-full"
                      style={{
                        background: verdictRow.confidence >= 0.85 ? "#A7F3D0" : "#FED7AA",
                        borderRadius: "999px",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${verdictRow.confidence * 100}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2" style={{ background: "#F8FAFC", borderRadius: "12px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Evidence quality</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: "#1E293B" }}>{displayEnum(verdictMetrics.evidenceQuality)}</p>
                </div>
                <div className="px-3 py-2" style={{ background: "#F8FAFC", borderRadius: "12px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Recommendation</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: "#1E293B" }}>{displayEnum(verdictMetrics.recommendation)}</p>
                </div>
                <div className="col-span-2 px-3 py-2" style={{ background: "#F8FAFC", borderRadius: "12px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>Provider call</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.providerCall?.usedApi ? "#047857" : "#9A3412" }}>
                    {providerCallSummary(verdictMetrics.providerCall)}
                  </p>
                </div>
              </div>

              <motion.button
                onClick={() => {
                  const text = `AI Verdict: "${challenge.title}" — ${verdictRow.winner?.username ?? "Draw"} wins (${Math.round((verdictRow.confidence ?? 0) * 100)}% confidence)\n\n"${verdictRow.reasoning}"\n\nJudged by ${verdictRow.aiModel}`;
                  void navigator.clipboard.writeText(text);
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="w-full py-2.5 text-sm font-bold transition-colors"
                style={{ color: "#334155", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
              >
                Share result
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-colors"
            style={{ background: "#FFFFFF", color: "#334155", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied" : "Copy invite link"}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            onClick={() => void refresh()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold transition-colors"
            style={{ background: "#FFFFFF", color: "#334155", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
