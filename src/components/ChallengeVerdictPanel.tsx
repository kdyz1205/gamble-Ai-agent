/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";
import EvidenceUploader from "./EvidenceUploader";
import { acceptanceContract, challengeUsesChineseCopy, compactChallengeRules, parseChallengeRules, settlementSummary } from "@/lib/challenge-display";
import {
  isAiReviewStatus,
  isEvidenceWindowStatus,
  isOpenForOpponentStatus,
  isVerdictReadyStatus,
  statusLabel as lifecycleStatusLabel,
} from "@/lib/challenge-state-machine";

const TIER_COST: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 25 };
const TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Free", 2: "Premium", 3: "Max" };
const TIER_DESC: Record<1 | 2 | 3, string> = {
  1: "Low-cost AI",
  2: "Stronger judge",
  3: "Hard cases",
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

function metricBool(value: unknown, zhCopy = false) {
  if (value === true) return zhCopy ? "是" : "Yes";
  if (value === false) return zhCopy ? "否" : "No";
  return zhCopy ? "未知" : "Unknown";
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

function localizedStatusLabel(status: string, zh: boolean) {
  if (!zh) return lifecycleStatusLabel(status);
  const labels: Record<string, string> = {
    draft: "草稿",
    generated_spec: "规则已生成",
    creator_confirmed: "创建者已确认",
    waiting_for_opponent: "等待对手",
    open: "等待对手",
    opponent_accepted: "对手已接受",
    escrow_locked: "积分已托管",
    evidence_window_open: "提交证据中",
    creator_submitted: "创建者已提交",
    opponent_submitted: "对手已提交",
    ai_reviewing: "AI 复核中",
    ai_verdict_ready: "AI 判定已出",
    dispute_window_open: "争议期",
    finalized: "已确认",
    settled: "已结算",
    refunded: "已退款",
    cancelled: "已取消",
    expired: "已过期",
    manual_review_required: "需要人工复核",
    disputed: "争议中",
    ai_inconclusive: "AI 未能判定",
    evidence_invalid: "证据无效",
    evidence_missing: "缺少证据",
    voided: "已作废",
  };
  return labels[status] ?? lifecycleStatusLabel(status);
}

function canCancelAndRefundBeforeEvidence(challenge: ChallengeDetail, isCreator: boolean) {
  if (!isCreator) return false;
  if (!hasActiveNonCreatorParticipant(challenge)) return false;
  const evidenceCount = challenge._count?.evidence ?? challenge.evidence?.length ?? 0;
  const judgmentCount = challenge._count?.judgments ?? challenge.judgments?.length ?? 0;
  if (evidenceCount > 0 || judgmentCount > 0) return false;
  return [
    "opponent_accepted",
    "escrow_locked",
    "evidence_window_open",
    "matched",
    "live",
  ].includes(challenge.status);
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
  const [aiAccess, setAiAccess] = useState<api.AiAccessStatus | null>(null);
  const [verdictErr, setVerdictErr] = useState("");
  const [manageNotice, setManageNotice] = useState("");
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
  const currentZhCopy = () => challenge ? challengeUsesChineseCopy(challenge) : false;

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
    let cancelled = false;
    api.getCredits()
      .then((res) => {
        if (!cancelled) setAiAccess(res.aiAccess ?? null);
      })
      .catch(() => {
        if (!cancelled) setAiAccess(null);
      });
    return () => { cancelled = true; };
  }, [userId]);

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
    if (aiAccess && tier > aiAccess.maxJudgeTier) {
      setVerdictErr(aiAccess.upgradeRequiredMessage);
      return;
    }
    if (credits < cost) {
      const zh = currentZhCopy();
      setVerdictErr(zh ? `需要 ${cost} 积分才能运行 ${TIER_LABEL[tier]}。你现在有 ${credits}。` : `Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`);
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      const prefs = readOracleLlmPrefs();
      const res = await api.judgeChallenge(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      if (res.aiAccess) setAiAccess(res.aiAccess);
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "AI 判定失败。" : "AI verdict failed");
    } finally {
      setBusy(false);
    }
  };

  const runVerdictAsync = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (aiAccess && tier > aiAccess.maxJudgeTier) {
      setVerdictErr(aiAccess.upgradeRequiredMessage);
      return;
    }
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
      if (res.aiAccess) setAiAccess(res.aiAccess);
      setAsyncHint(currentZhCopy() ? "AI 正在分析证据（视频帧 + 视觉模型）..." : "AI is analyzing evidence (video frames + vision)...");

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
          setVerdictErr(currentZhCopy() ? "判定时间比预期更久，请刷新查看状态。" : "Verdict is taking longer than expected. Please reload to check status.");
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
              if (j.status === "failed") setVerdictErr(j.error || (currentZhCopy() ? "后台判定失败。" : "Background verdict failed"));
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
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "无法启动后台判定。" : "Could not start background verdict");
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
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "无法确认 AI 判定。" : "Could not confirm AI recommendation");
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
        reason: manualReason || (currentZhCopy() ? "参与者认为 AI 判定需要人工复核。" : "Participant requested manual review of the AI verdict."),
      });
      await refresh();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "无法请求人工复核。" : "Could not request manual review");
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
      setVerdictErr(currentZhCopy() ? "请先选择赢家再完成复核。" : "Pick a winner before resolving manual review.");
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      await api.manualResolveChallenge(challenge.id, {
        outcome,
        winnerId,
        reason: manualReason || (currentZhCopy() ? "创建者根据提交的证据完成了人工复核。" : "Creator resolved the manual review based on the submitted evidence."),
      });
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "无法完成人工复核。" : "Could not resolve manual review");
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
      showCopied(currentZhCopy() ? "剪贴板被浏览器阻止。请手动复制下方链接。" : "Clipboard is blocked here. Use the visible join link.");
      return;
    }

    navigator.clipboard.writeText(url)
      .then(() => showCopied(currentZhCopy() ? "邀请链接已复制。" : "Join link copied."))
      .catch(() => showCopied(currentZhCopy() ? "剪贴板被浏览器阻止。请手动复制下方链接。" : "Clipboard is blocked here. Use the visible join link."));
  };

  const runRejudge = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (aiAccess && tier > aiAccess.maxJudgeTier) {
      setVerdictErr(aiAccess.upgradeRequiredMessage);
      return;
    }
    if (credits < cost) {
      const zh = currentZhCopy();
      setVerdictErr(zh ? `需要 ${cost} 积分才能运行 ${TIER_LABEL[tier]}。你现在有 ${credits}。` : `Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`);
      return;
    }
    setBusy(true);
    setVerdictErr("");
    try {
      const prefs = readOracleLlmPrefs();
      const res = await api.judgeChallenge(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
        rejudge: true,
        reason: currentZhCopy() ? "创建者认为上一次 AI 判定有误，请求另一个模型重新判定。" : "Creator disputed the previous AI verdict and requested another model pass.",
      });
      if (res.aiAccess) setAiAccess(res.aiAccess);
      setVerdictRevealed(false);
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : currentZhCopy() ? "无法重新判定这个挑战。" : "Could not rejudge this challenge");
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
    const zh = currentZhCopy();
    if (!window.confirm(zh ? `关闭「${challenge.title}」？只会在还没有对手加入前生效。` : `Close "${challenge.title}"? This only works before another participant joins.`)) return;
    setBusy(true);
    setVerdictErr("");
    try {
      await api.deleteChallenge(challenge.id);
      window.location.href = "/markets";
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : zh ? "无法关闭这个挑战。" : "Could not close this challenge");
    } finally {
      setBusy(false);
    }
  };

  const cancelAndRefundChallenge = async () => {
    if (!challenge) return;
    const zh = currentZhCopy();
    if (!window.confirm(zh ? `取消「${challenge.title}」并退回所有托管积分？只会在提交证据前生效。` : `Cancel "${challenge.title}" and refund all locked stakes? This only works before evidence is submitted.`)) return;
    setBusy(true);
    setVerdictErr("");
    try {
      const res = await api.cancelChallenge(challenge.id, {
        reason: zh ? "创建者在提交证据前取消挑战。" : "Creator cancelled before evidence was submitted.",
      });
      setChallenge(res.challenge);
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : zh ? "无法取消并退款这个挑战。" : "Could not cancel and refund this challenge");
    } finally {
      setBusy(false);
    }
  };

  const archiveOrRestoreChallenge = async (archived: boolean) => {
    if (!challenge) return;
    const zh = currentZhCopy();
    const verb = archived ? "Archive" : "Restore";
    const detail = archived
      ? "This keeps evidence, verdict, and ledger history but removes it from your default challenge board and public discovery."
      : "This returns it to your private challenge board. It will stay out of public discovery.";
    const confirmCopy = zh
      ? archived
        ? `归档「${challenge.title}」？证据、判定和积分流水都会保留，只是不再默认显示。`
        : `恢复「${challenge.title}」到你的私人挑战列表？它仍不会进入公开发现。`
      : `${verb} "${challenge.title}"? ${detail}`;
    if (!window.confirm(confirmCopy)) return;
    setBusy(true);
    setVerdictErr("");
    setManageNotice("");
    try {
      const res = await api.archiveChallenge(challenge.id, { archived });
      setChallenge(res.challenge);
      setManageNotice(archived ? (zh ? "已归档，历史和积分流水已保留。" : "Archived. History and ledger are preserved.") : (zh ? "已恢复到你的私人挑战列表。" : "Restored to your private challenge board."));
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : zh ? "无法更新这个挑战。" : `Could not ${verb.toLowerCase()} this challenge`);
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
      <div
        className="rounded-2xl p-5 text-sm font-bold glow-danger"
        style={{ background: "#FECACA", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "16px" }}
      >
        <p>{loadErr}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/markets" className="rounded-full bg-white px-4 py-2 text-xs font-black" style={{ color: "#1E293B" }}>
            Back to challenge manager
          </a>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full bg-white px-4 py-2 text-xs font-black"
            style={{ color: "#991B1B" }}
          >
            Retry
          </button>
        </div>
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
  const zhCopy = challengeUsesChineseCopy(challenge);
  const closeLockReason = managementLockReason(challenge, isCreator);
  const canCloseEmpty = !closeLockReason;
  const canCancelRefund = canCancelAndRefundBeforeEvidence(challenge, isCreator);
  const isArchived = challenge.visibility === "archived";
  const canArchiveInstead = isCreator && !isArchived && !canCloseEmpty && !canCancelRefund;
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
            <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1.5" style={{ color: "#FDBA74" }}>{zhCopy ? "挑战" : "The challenge"}</p>
            <h3 className="text-xl font-black leading-tight" style={{ color: "#1E293B" }}>{challenge.title}</h3>
            <p className="text-xs mt-1.5 max-w-xl font-medium" style={{ color: "#64748B", lineHeight: 1.5 }}>
              {zhCopy ? "同意规则，提交证据，AI 给出判定建议。" : "Accept rules. Submit proof. AI recommends the winner."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <motion.span
              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              {localizedStatusLabel(challenge.status, zhCopy)}
            </motion.span>
            {challenge.stake > 0 && (
              <span className="text-xs font-bold text-amber-400">{zhCopy ? `${challenge.stake} credits 已托管` : `${challenge.stake} credits at stake`}</span>
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
              <p className="text-sm font-extrabold" style={{ color: "#7C2D12" }}>{zhCopy ? "等待对手" : "Waiting for opponent"}</p>
              <p className="text-xs font-semibold mt-0.5" style={{ color: "#9A3412" }}>
                  {zhCopy ? "分享邀请，对方接受后开始。" : "Share the invite. Starts after they accept."}
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
                  {zhCopy ? "分享给朋友" : "Share to friend"}
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  onClick={copyLink}
                  className="px-4 py-2 text-xs font-black"
                  style={{ background: "#FFFFFF", color: "#334155", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
                >
                  {copied ? (zhCopy ? "已复制" : "Copied") : (zhCopy ? "复制链接" : "Copy link")}
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
                    {zhCopy ? "关闭挑战" : "Close challenge"}
                  </motion.button>
                )}
              </div>
            </div>
            <p className="text-[11px] font-bold" style={{ color: "#9A3412" }}>
              {zhCopy ? "托管：" : "Escrow: "}{settlementSummary(challenge)}
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
                <p className="text-sm font-extrabold" style={{ color: "#1E293B" }}>{zhCopy ? "管理挑战" : "Manage challenge"}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: closeLockReason && !canCancelRefund ? "#991B1B" : "#047857" }}>
                  {zhCopy
                    ? isArchived
                      ? "已归档，历史保留。"
                      : canCancelRefund
                        ? "还没有证据，可以取消并退回托管积分。"
                        : closeLockReason
                          ? "当前不能删除；请使用归档、复核、退款或作废流程。"
                          : "空挑战，可以关闭。"
                    : isArchived
                      ? "Archived. History stays."
                      : canCancelRefund
                        ? "No evidence yet. Cancel refunds locked stakes."
                        : closeLockReason || "Empty challenge. You can close it."}
                </p>
                {manageNotice && (
                  <p className="mt-2 text-[11px] font-black" style={{ color: "#047857" }}>
                    {manageNotice}
                  </p>
                )}
              </div>
              {isArchived ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => void archiveOrRestoreChallenge(false)}
                  className="px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: "#A7F3D0", color: "#065F46", border: "1px solid #6EE7B7", borderRadius: "9999px" }}
                >
                  {zhCopy ? "恢复" : "Restore"}
                </motion.button>
              ) : canCancelRefund ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => void cancelAndRefundChallenge()}
                  className="px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: "#FED7AA", color: "#7C2D12", border: "1px solid #FDBA74", borderRadius: "9999px" }}
                >
                  {zhCopy ? "取消并退款" : "Cancel and refund"}
                </motion.button>
              ) : canCloseEmpty ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => void closeEmptyChallenge()}
                  className="px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: "#FECACA", color: "#991B1B", border: "1px solid #FCA5A5", borderRadius: "9999px" }}
                >
                  {zhCopy ? "关闭空挑战" : "Close empty challenge"}
                </motion.button>
              ) : canArchiveInstead ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => void archiveOrRestoreChallenge(true)}
                  className="px-4 py-2 text-xs font-black disabled:opacity-50"
                  style={{ background: "#F1F5F9", color: "#334155", border: "1px solid #CBD5E1", borderRadius: "9999px" }}
                >
                  {zhCopy ? "归档" : "Archive"}
                </motion.button>
              ) : (
                <span
                  className="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider"
                  style={{ background: "#F1F5F9", color: "#64748B", borderRadius: "9999px" }}
                >
                  {zhCopy ? "已锁定" : "Locked"}
                </span>
              )}
            </div>
          </motion.div>
        )}

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: "#047857" }}>
              {zhCopy ? "规则" : "Rules"}
            </p>
            <p className="text-xs font-semibold mt-1" style={{ color: "#64748B" }}>
              {zhCopy ? "先看简版。" : "Short version first."}
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
                {zhCopy ? "完整规则" : "Full rules"}
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
            <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "#047857" }}>{zhCopy ? "接受" : "Accept"}</p>
            <details>
              <summary className="cursor-pointer text-xs font-black" style={{ color: "#334155" }}>{zhCopy ? "完整条款" : "Full terms"}</summary>
              <ul className="mt-2 space-y-1.5">
                {contractBullets.map((item) => (
                  <li key={item} className="text-xs font-semibold" style={{ color: "#334155", lineHeight: 1.5 }}>
                    - {item}
                  </li>
                ))}
              </ul>
            </details>
            <label className="flex items-start gap-2 mt-3 text-xs font-bold cursor-pointer" style={{ color: "#334155" }}>
              <input
                type="checkbox"
                checked={acceptContractChecked}
                onChange={(event) => setAcceptContractChecked(event.target.checked)}
                className="mt-0.5"
              />
              <span>{zhCopy ? "我同意规则、AI 判定、争议处理和积分结算。" : "I accept rules, AI judging, disputes, and credits."}</span>
            </label>
            <motion.button
              type="button"
              disabled={!acceptContractChecked || acceptingChallenge}
              whileTap={{ scale: 0.97 }}
              onClick={() => void acceptFromContract()}
              className="mt-3 w-full py-3 text-sm font-black disabled:opacity-40"
              style={{ background: "#A7F3D0", color: "#065F46", borderRadius: "9999px" }}
            >
              {acceptingChallenge ? (zhCopy ? "加入中..." : "Joining...") : (zhCopy ? "接受规则并加入" : "Accept rules and join")}
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
                <span className={`text-[11px] font-bold ${p.done ? "text-success" : "text-text-muted"}`}>
                  {zhCopy ? (p.key === "match" ? "对手" : p.key === "ev" ? "证据" : "AI 判定") : p.label}
                </span>
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
                    {isMe && <span className="text-[10px] ml-1.5 font-semibold" style={{ color: "#64748B" }}>{zhCopy ? "（你）" : "(you)"}</span>}
                  </p>
                  <p className="text-[11px] font-semibold" style={{ color: "#64748B" }}>
                    {zhCopy
                      ? `${isCreator ? "创建者" : "对手"} · ${ev ? "已提交证据" : "等待中"}`
                      : `${isCreator ? "Creator" : "Opponent"} · ${ev ? "Evidence in" : "Waiting"}`}
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
                <p className="text-sm font-bold" style={{ color: "#1E293B" }}>{zhCopy ? "证据已提交" : "All evidence is in"}</p>
                <p className="text-xs font-medium mt-0.5" style={{ color: "#64748B", lineHeight: 1.5 }}>
                  {zhCopy
                    ? isCreator ? "运行 AI，然后确认结果。" : "等待 AI 复核。"
                    : isCreator ? "Run AI, then confirm payout." : "Waiting for AI review."}
                </p>
              </div>
            </div>

            {isCreator && challenge.judgments.length === 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => {
                    const selected = tier === t;
                    const locked = Boolean(aiAccess && t > aiAccess.maxJudgeTier);
                    return (
                      <motion.button
                        key={t}
                        type="button"
                        onClick={() => locked ? setVerdictErr(aiAccess?.upgradeRequiredMessage ?? "Premium judge required.") : setTier(t)}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        className="p-3 text-center transition-colors"
                        style={{
                          background: selected ? "#FED7AA" : "#FFFFFF",
                          border: selected ? "1.5px solid #FDBA74" : "1px solid #E2E8F0",
                          borderRadius: "16px",
                          opacity: locked ? 0.56 : 1,
                        }}
                      >
                        <p className="text-xs font-bold" style={{ color: selected ? "#7C2D12" : "#334155" }}>
                          {TIER_LABEL[t]}
                        </p>
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: selected ? "#9A3412" : "#64748B" }}>{TIER_DESC[t]}</p>
                        <p className="text-[11px] font-bold mt-1" style={{ color: selected ? "#7C2D12" : "#94A3B8" }}>
                          {locked ? "Premium" : `${TIER_COST[t]} cr`}
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
                  {busy ? "Analyzing..." : `Run AI - ${TIER_COST[tier]} cr`}
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
                  Background run
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
            <p className="text-sm font-bold" style={{ color: "#1E293B" }}>{zhCopy ? "AI 判定已生成" : "AI recommendation ready"}</p>
            <p className="text-xs font-medium" style={{ color: "#64748B", lineHeight: 1.5 }}>
              {zhCopy ? "确认后结算；不确定就复核。" : "Confirm to settle, or review."}
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
                {busy ? (zhCopy ? "结算中..." : "Settling...") : (zhCopy ? "确认并结算" : "Confirm + settle")}
              </motion.button>
            ) : (
              <div className="p-3 text-xs font-semibold" style={{ color: "#9A3412", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "14px" }}>
                {zhCopy ? "暂不满足自动结算条件。请重新判定或人工复核。" : "Not eligible. Rejudge or review."}
              </div>
            )}

            {canRejudge && (
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "换一个模型再判一次" : "Try another judge model"}</p>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => {
                    const selected = tier === t;
                    const locked = Boolean(aiAccess && t > aiAccess.maxJudgeTier);
                    return (
                      <button
                        key={`rejudge-${t}`}
                        type="button"
                        onClick={() => locked ? setVerdictErr(aiAccess?.upgradeRequiredMessage ?? "Premium judge required.") : setTier(t)}
                        className="p-2 text-center"
                        style={{
                          background: selected ? "#DBEAFE" : "#FFFFFF",
                          border: selected ? "1.5px solid #60A5FA" : "1px solid #E2E8F0",
                          borderRadius: "12px",
                          opacity: locked ? 0.56 : 1,
                        }}
                      >
                        <p className="text-[11px] font-extrabold" style={{ color: selected ? "#1D4ED8" : "#334155" }}>{TIER_LABEL[t]}</p>
                        <p className="text-[10px] font-bold mt-0.5" style={{ color: selected ? "#1E40AF" : "#94A3B8" }}>{locked ? "Premium" : `${TIER_COST[t]} cr`}</p>
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
                  {busy ? (zhCopy ? "重新判定中..." : "Rejudging...") : (zhCopy ? `重新判定 - ${TIER_COST[tier]} 积分` : `Rejudge - ${TIER_COST[tier]} cr`)}
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
              <p className="text-sm font-bold" style={{ color: "#1E293B" }}>{zhCopy ? "人工复核" : "Manual review"}</p>
              <p className="text-xs font-medium mt-1" style={{ color: "#64748B", lineHeight: 1.5 }}>
                {zhCopy ? "AI 看错、不确定、证据不清楚时使用。" : "Use when AI looks wrong."}
              </p>
            </div>
            <textarea
              value={manualReason}
              onChange={(event) => setManualReason(event.target.value)}
              rows={3}
              placeholder={zhCopy ? "哪里不对或哪里不清楚？" : "What is wrong or unclear about this verdict?"}
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
                {busy ? (zhCopy ? "提交中..." : "Requesting review...") : (zhCopy ? "请求人工复核" : "Request manual review")}
              </motion.button>
            )}
            {canManualResolve && (
              <div className="space-y-3 pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "#64748B" }}>
                  {zhCopy ? "创建者处理" : "Creator resolution"}
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
                    {busy ? (zhCopy ? "处理中..." : "Resolving...") : (zhCopy ? "判给所选赢家" : "Award selected winner")}
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={busy}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void resolveManualReview(challenge.stake > 0 ? "refund" : "void")}
                    className="py-3 rounded-xl text-sm font-black disabled:opacity-40"
                    style={{ color: "#334155", background: "#F8FAFC", border: "1px solid #E2E8F0" }}
                  >
                    {challenge.stake > 0 ? (zhCopy ? "退回托管积分" : "Refund locked credits") : (zhCopy ? "作废挑战" : "Void challenge")}
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
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-success">{zhCopy ? "AI 判定" : "AI Verdict"}</p>
              </div>

              {/* Winner */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                <motion.span
                  className="text-xl font-black text-text-primary"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  {zhCopy ? "赢家：" : "Winner: "}<span className="text-success">@{verdictRow.winner?.username ?? (zhCopy ? "平局 / 作废" : "Tie / Void")}</span>
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
                    {(verdictRow.confidence * 100).toFixed(0)}% {zhCopy ? "置信度" : "confidence"}
                  </span>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-5">
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "证据质量" : "Evidence quality"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.evidenceQuality === "good" ? "#047857" : "#9A3412" }}>
                    {displayEnum(verdictMetrics.evidenceQuality)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "建议" : "Recommendation"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.recommendation === "settle_winner" ? "#047857" : "#9A3412" }}>
                    {displayEnum(verdictMetrics.recommendation)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "结算门槛" : "Settlement gate"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.autoSettleEligible ? "#047857" : "#9A3412" }}>
                    {verdictMetrics.autoSettleEligible ? (zhCopy ? "可结算" : "Eligible") : (zhCopy ? "需复核" : "Needs Review")}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "判定来源" : "Judge source"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.source === "fallback" ? "#9A3412" : "#047857" }}>
                    {displayEnum(verdictMetrics.source)}
                  </p>
                </div>
                <div className="px-3 py-2" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "14px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "模型调用" : "Provider call"}</p>
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
                  <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#9A3412" }}>{zhCopy ? "阻塞问题" : "Blocking issues"}</p>
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
                    {zhCopy ? "视频指标" : "Video metrics"}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      [zhCopy ? "参与者 A" : "Participant A", participantAMetrics],
                      [zhCopy ? "参与者 B" : "Participant B", participantBMetrics],
                    ].map(([label, metrics]) => metrics && (
                      <div key={label as string} className="p-3" style={{ background: "#F8FAFC", borderRadius: "16px" }}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-black" style={{ color: "#1E293B" }}>{label as string}</p>
                          <span className="px-2 py-1 text-[10px] font-black" style={{ color: "#047857", background: "#D1FAE5", borderRadius: "9999px" }}>
                            {typeof (metrics as Record<string, unknown>).holdDurationSec === "number"
                              ? `${(metrics as Record<string, unknown>).holdDurationSec as number}s ${zhCopy ? "保持" : "hold"}`
                              : `${metricCount((metrics as Record<string, unknown>).validRepCount)} ${zhCopy ? "次" : "reps"}`}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-bold" style={{ color: "#475569" }}>
                          <span>{zhCopy ? "全身" : "Full body"}: {metricBool((metrics as Record<string, unknown>).fullBodyVisible, zhCopy)}</span>
                          <span>{zhCopy ? "口令" : "Liveness"}: {metricBool((metrics as Record<string, unknown>).livenessPhraseVisible, zhCopy)}</span>
                          <span>{zhCopy ? "时长" : "Duration"}: {metricBool((metrics as Record<string, unknown>).fullDurationCovered, zhCopy)}</span>
                          <span>{zhCopy ? "连续" : "Continuous"}: {metricBool((metrics as Record<string, unknown>).continuousAttemptLikely, zhCopy)}</span>
                          <span>{zhCopy ? "太短" : "Too short"}: {metricBool((metrics as Record<string, unknown>).videoTooShort, zhCopy)}</span>
                          <span>{zhCopy ? "剪辑/循环" : "Edit/loop"}: {metricBool((metrics as Record<string, unknown>).suspectedEditingOrLoop, zhCopy)}</span>
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
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#64748B" }}>{zhCopy ? "AI 理由" : "AI Reasoning"}</p>
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
                  {zhCopy ? "判定收据" : "Verdict receipt"}
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
                    {zhCopy ? `${verdictRow.winner.username} 获胜` : `${verdictRow.winner.username} wins`}
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
                    <span>{zhCopy ? "置信度" : "Confidence"}</span>
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
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "证据质量" : "Evidence quality"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: "#1E293B" }}>{displayEnum(verdictMetrics.evidenceQuality)}</p>
                </div>
                <div className="px-3 py-2" style={{ background: "#F8FAFC", borderRadius: "12px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "建议" : "Recommendation"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: "#1E293B" }}>{displayEnum(verdictMetrics.recommendation)}</p>
                </div>
                <div className="col-span-2 px-3 py-2" style={{ background: "#F8FAFC", borderRadius: "12px" }}>
                  <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#64748B" }}>{zhCopy ? "模型调用" : "Provider call"}</p>
                  <p className="text-xs font-extrabold mt-1" style={{ color: verdictMetrics.providerCall?.usedApi ? "#047857" : "#9A3412" }}>
                    {providerCallSummary(verdictMetrics.providerCall)}
                  </p>
                </div>
              </div>

              <motion.button
                onClick={() => {
                  const text = zhCopy
                    ? `AI 判定：「${challenge.title}」— ${verdictRow.winner?.username ?? "平局"} 获胜（${Math.round((verdictRow.confidence ?? 0) * 100)}% 置信度）\n\n「${verdictRow.reasoning}」\n\n模型：${verdictRow.aiModel}`
                    : `AI Verdict: "${challenge.title}" — ${verdictRow.winner?.username ?? "Draw"} wins (${Math.round((verdictRow.confidence ?? 0) * 100)}% confidence)\n\n"${verdictRow.reasoning}"\n\nJudged by ${verdictRow.aiModel}`;
                  void navigator.clipboard.writeText(text);
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                className="w-full py-2.5 text-sm font-bold transition-colors"
                style={{ color: "#334155", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "9999px" }}
              >
                {zhCopy ? "分享结果" : "Share result"}
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
            {copied ? (zhCopy ? "已复制" : "Copied") : (zhCopy ? "复制邀请链接" : "Copy invite link")}
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
            {zhCopy ? "刷新" : "Refresh"}
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
