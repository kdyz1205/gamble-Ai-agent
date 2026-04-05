"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";

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
    matched: "Matched",
    judging: "Ready for AI verdict",
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
    matched: { color: "#00d4c8", bg: "rgba(0,212,200,0.1)",   border: "rgba(0,212,200,0.25)" },
    judging: { color: "#f5a623", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)" },
    settled: { color: "#00e87a", bg: "rgba(0,232,122,0.1)",   border: "rgba(0,232,122,0.25)" },
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
  const canSubmitEvidence = challenge && ["open", "live", "matched"].includes(challenge.status) && !!me && !myEvidence;
  const canRunAi = challenge && challenge.status === "judging" && isCreator && challenge.judgments.length === 0;
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

  const copyLink = () => {
    const url = `${window.location.origin}/?challenge=${challengeId}`;
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loadErr) {
    return (
      <div className="rounded-2xl p-5 text-sm font-bold glow-danger"
           style={{ background: "rgba(255,71,87,0.06)", color: "#ff4757" }}>
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
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(165deg, rgba(18,18,40,0.98) 0%, rgba(8,8,20,0.98) 100%)",
        border: "1px solid rgba(124,92,252,0.15)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(124,92,252,0.15) inset",
      }}
    >
      <div className="plasma-line" />

      <div className="p-6 md:p-7 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-1.5">Challenge Command</p>
            <h3 className="text-xl font-black text-text-primary leading-tight">{challenge.title}</h3>
            <p className="text-xs text-text-muted mt-1.5 max-w-xl">
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
        <div className="grid gap-3 sm:grid-cols-2 rounded-2xl p-3"
             style={{ background: "rgba(6,6,15,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {accepted.map((p, i) => {
            const ev = evidenceByUser.get(p.user.id);
            const isMe = p.user.id === userId;
            return (
              <motion.div
                key={p.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5 shine-card"
                style={{
                  background: isMe ? "rgba(124,92,252,0.04)" : "rgba(255,255,255,0.02)",
                  border: isMe ? "1px solid rgba(124,92,252,0.12)" : "1px solid transparent",
                }}
                initial={{ opacity: 0, x: i === 0 ? -10 : 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{
                    background: p.role === "creator" ? "linear-gradient(135deg, #7c5cfc, #5b3fd9)" : "linear-gradient(135deg, #00d4c8, #0d9488)",
                    boxShadow: p.role === "creator" ? "0 0 12px rgba(124,92,252,0.2)" : "0 0 12px rgba(0,212,200,0.2)",
                  }}
                >
                  {p.user.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary truncate">
                    {p.user.username}
                    {isMe && <span className="text-[9px] text-accent ml-1.5">(you)</span>}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {p.role} · {ev ? "Evidence in" : "Waiting"}
                  </p>
                  {ev && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{ev.description || ev.url || "—"}</p>
                  )}
                </div>
                {ev && (
                  <motion.div
                    className="w-5 h-5 rounded-full bg-success flex items-center justify-center mt-0.5 shrink-0"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 400 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
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
              style={{ background: "rgba(255,71,87,0.06)", color: "#ff4757" }}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {verdictErr}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Evidence form */}
        <AnimatePresence mode="wait">
          {canSubmitEvidence && (
            <motion.div
              key="evidence-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3 overflow-hidden"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "rgba(124,92,252,0.15)" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-accent uppercase tracking-wider">Your evidence</p>
              </div>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Describe what you did, times, reps, links to video, etc. Be specific — the AI uses this to judge."
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-text-primary placeholder:text-text-muted/50 bg-bg-input border border-border-subtle resize-y min-h-[100px] transition-all"
              />
              <input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="HTTPS link to image or direct MP4/WebM (for AI vision)"
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-text-primary placeholder:text-text-muted/50 bg-bg-input border border-border-subtle transition-all"
              />
              <motion.button
                type="button"
                disabled={busy || !evidenceText.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void submitEvidence()}
                className="shimmer-btn w-full py-3 rounded-xl text-sm font-extrabold text-white disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #00d4c8, #7c5cfc)",
                  boxShadow: "0 8px 32px rgba(0,212,200,0.2)",
                }}
              >
                {busy ? "Submitting..." : "Submit Evidence"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Judge section */}
        {challenge.status === "judging" && (
          <motion.div
            className="space-y-4 p-5 rounded-2xl"
            style={{
              background: "rgba(245,166,35,0.04)",
              border: "1px solid rgba(245,166,35,0.15)",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-3">
              <motion.div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #f5a623, #ea580c)" }}
                animate={{ boxShadow: ["0 0 12px rgba(245,166,35,0.2)", "0 0 20px rgba(245,166,35,0.4)", "0 0 12px rgba(245,166,35,0.2)"] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </motion.div>
              <div>
                <p className="text-sm font-extrabold text-amber-200">All evidence is in</p>
                <p className="text-[10px] text-text-muted">
                  {isCreator ? "Choose AI tier and render the verdict." : "Waiting for the creator to start the AI verdict."}
                </p>
              </div>
            </div>

            {isCreator && challenge.judgments.length === 0 && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => (
                    <motion.button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      whileHover={{ scale: 1.03, y: -1 }}
                      whileTap={{ scale: 0.97 }}
                      className="relative rounded-xl p-3 text-center transition-all"
                      style={{
                        background: tier === t ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${tier === t ? "rgba(245,166,35,0.35)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <p className="text-xs font-black" style={{ color: tier === t ? "#f5a623" : "rgba(240,240,255,0.4)" }}>
                        {TIER_LABEL[t]}
                      </p>
                      <p className="text-[9px] text-text-muted mt-0.5">{TIER_DESC[t]}</p>
                      <p className="text-[10px] font-bold mt-1" style={{ color: tier === t ? "#f5a623" : "rgba(240,240,255,0.3)" }}>
                        {TIER_COST[t]} cr
                      </p>
                    </motion.button>
                  ))}
                </div>
                <motion.button
                  type="button"
                  disabled={busy || !canRunAi}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void runVerdict()}
                  className="shimmer-btn w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg, #f5a623, #7c5cfc)",
                    boxShadow: "0 8px 40px rgba(245,166,35,0.2)",
                  }}
                >
                  {busy ? "AI Analyzing..." : `Run AI Verdict (${TIER_COST[tier]} credits)`}
                </motion.button>
                <motion.button
                  type="button"
                  disabled={busy || !canRunAi}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => void runVerdictAsync()}
                  className="w-full py-3 rounded-xl text-xs font-extrabold border border-amber-400/30 text-amber-100/80 disabled:opacity-40"
                  style={{ background: "rgba(245,166,35,0.06)" }}
                >
                  Background verdict (recommended for video)
                </motion.button>
                {asyncHint && (
                  <motion.p
                    className="text-[11px] font-bold text-amber-200/90 text-center"
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
              <div className="rounded-xl p-4" style={{ background: "rgba(6,6,15,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-2">AI Reasoning</p>
                <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
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
            className="mt-4 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(13,13,30,0.95)",
              border: "1px solid rgba(124,92,252,0.2)",
              boxShadow: "0 0 40px rgba(124,92,252,0.08)",
            }}
          >
            <div className="h-0.5 bg-gradient-to-r from-accent via-teal to-accent" />
            <div className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                  AI Verdict Receipt
                </span>
                <span className="text-[10px] text-text-muted">
                  {verdictRow.aiModel}
                </span>
              </div>

              <h4 className="text-base font-extrabold text-text-primary">
                {challenge.title}
              </h4>

              {verdictRow.winner && (
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.15)" }}
                >
                  <span className="text-lg">&#127942;</span>
                  <span className="text-sm font-extrabold text-[#00e87a]">
                    {verdictRow.winner.username} wins!
                  </span>
                </div>
              )}

              {verdictRow.reasoning && (
                <p className="text-xs text-text-secondary leading-relaxed italic">
                  &ldquo;{verdictRow.reasoning}&rdquo;
                </p>
              )}

              {verdictRow.confidence != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] text-text-muted">
                    <span>Confidence</span>
                    <span>{Math.round(verdictRow.confidence * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: verdictRow.confidence >= 0.85
                          ? "linear-gradient(90deg, #00e87a, #00d4c8)"
                          : "linear-gradient(90deg, #f5a623, #ff3b30)",
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${verdictRow.confidence * 100}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}

              <motion.button
                onClick={() => {
                  const text = `AI Verdict: "${challenge.title}" — ${verdictRow.winner?.username ?? "Draw"} wins! (${Math.round((verdictRow.confidence ?? 0) * 100)}% confidence)\n\n"${verdictRow.reasoning}"\n\nJudged by ${verdictRow.aiModel}`;
                  void navigator.clipboard.writeText(text);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-2.5 rounded-xl text-xs font-bold text-text-secondary border border-border-subtle transition-all hover:border-accent/30 hover:text-text-primary"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                Share Result
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Bottom actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={copyLink}
            className="shimmer-btn flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy invite link"}
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void refresh()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
