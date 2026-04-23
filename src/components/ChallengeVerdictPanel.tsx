/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";
import EvidenceUploader from "./EvidenceUploader";

const TIER_COST: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 25 };
const TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Haiku", 2: "Sonnet", 3: "Opus" };
const TIER_DESC: Record<1 | 2 | 3, string> = {
  1: "Fast & efficient",
  2: "Balanced judgment",
  3: "Maximum intelligence",
};

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    open: "Waiting for opponent",
    live: "In progress",
    judging: "Ready for AI verdict",
    pending_settlement: "Settling on-chain\u2026",
    disputed: "AI recommendation ready",
    settled: "Settled",
    cancelled: "Cancelled",
    draft: "Draft",
  };
  return m[s] || s;
}

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
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [verdictErr, setVerdictErr] = useState("");
  const [asyncHint, setAsyncHint] = useState("");
  const [verdictRevealed, setVerdictRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const canSubmitEvidence = challenge && ["open", "live"].includes(challenge.status) && !!me && !myEvidence;
  const canRunAi = challenge && challenge.status === "judging" && isCreator && challenge.judgments.length === 0;
  const canConfirmAi = challenge && challenge.status === "disputed" && isCreator && challenge.judgments.length > 0;
  const settled = challenge?.status === "settled";

  const submitEvidence = async () => {
    if (!challenge || !evidenceText.trim()) return;
    setBusy(true);
    setVerdictErr("");
    try {
      await api.submitEvidence(challenge.id, {
        type: challenge.evidenceType || "text",
        description: evidenceText.trim(),
        url: evidenceUrl.trim() || undefined,
      });
      setEvidenceText("");
      setEvidenceUrl("");
      await refresh();
      onCreditsMayChange();
    } catch (e) {
      setVerdictErr(e instanceof Error ? e.message : "Could not submit evidence");
    } finally {
      setBusy(false);
    }
  };

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
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.getJudgeJob(res.jobId);
          if (j.status === "completed" || j.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            setAsyncHint("");
            if (j.status === "failed") setVerdictErr(j.error || "Background verdict failed");
            await refresh();
            onCreditsMayChange();
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          setAsyncHint("");
        }
      }, 2000);
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

  const copyLink = () => {
    const url = `${window.location.origin}/challenge/${challengeId}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

  const hasOpponent = challenge.participants.some(p => p.role === "opponent");
  const phaseMatchDone = hasOpponent || challenge.status !== "open";
  const phases = [
    { key: "match", done: phaseMatchDone, label: "Opponent", icon: "👤" },
    { key: "ev", done: Boolean(allSubmitted || settled), label: "Evidence", icon: "📸" },
    { key: "ai", done: Boolean(settled), label: "AI Verdict", icon: "⚡" },
  ];

  const verdictRow = challenge.judgments?.[0] ?? null;
  const sc = statusColor(challenge.status);

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
            <p className="text-xs mt-1.5 max-w-xl font-medium" style={{ color: "#64748B" }}>
              {challenge.rules || "AI reviews evidence against your challenge rules, then settles credits."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <motion.span
              className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
            >
              {statusLabel(challenge.status)}
            </motion.span>
            {challenge.stake > 0 && (
              <span className="text-xs font-bold text-amber-400">{challenge.stake} credits at stake</span>
            )}
          </div>
        </div>

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
        {challenge.status === "judging" && (
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
          </motion.div>
        )}

        {/* ══ VERDICT REVEAL ══ */}
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
        {verdictRow && challenge.status === "settled" && (
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
