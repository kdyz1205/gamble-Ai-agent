"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";

const TIER_COST: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 25 };
const TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Haiku", 2: "Sonnet", 3: "Opus" };

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const me = challenge?.participants.find(p => p.user.id === userId);
  const creator = challenge?.participants.find(p => p.role === "creator");
  const opponent = challenge?.participants.find(p => p.role === "opponent");

  const accepted = challenge?.participants.filter(p => p.status === "accepted") ?? [];
  const evidenceByUser = new Map((challenge?.evidence ?? []).map(e => [e.userId, e] as const));
  const myEvidence = challenge?.evidence.find(e => e.userId === userId);
  const allSubmitted =
    challenge && accepted.length > 0 && accepted.every(p => evidenceByUser.has(p.user.id));

  const isCreator = challenge?.creatorId === userId;
  const canSubmitEvidence =
    challenge &&
    ["open", "live", "matched"].includes(challenge.status) &&
    !!me &&
    !myEvidence;

  const canRunAi =
    challenge &&
    challenge.status === "judging" &&
    isCreator &&
    challenge.judgments.length === 0;

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

  const copyLink = () => {
    const url = `${window.location.origin}/?challenge=${challengeId}`;
    void navigator.clipboard.writeText(url);
  };

  if (loadErr) {
    return (
      <div
        className="rounded-2xl p-5 text-sm font-bold"
        style={{ background: "rgba(255,71,87,0.08)", border: "1px solid rgba(255,71,87,0.2)", color: "#ff4757" }}
      >
        {loadErr}
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="rounded-2xl p-8 text-center text-sm text-text-muted">Loading challenge…</div>
    );
  }

  const hasOpponent = challenge.participants.some(p => p.role === "opponent");
  const phaseMatchDone = hasOpponent || challenge.status !== "open";
  const phases = [
    { key: "match", done: phaseMatchDone, label: "Opponent" },
    { key: "ev", done: allSubmitted || settled, label: "Evidence" },
    { key: "ai", done: settled, label: "AI verdict" },
  ];

  const verdictRow = challenge.judgments?.[0] ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(165deg, rgba(18,18,40,0.98) 0%, rgba(8,8,20,0.98) 100%)",
        border: "1px solid rgba(124,92,252,0.2)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45), 0 0 1px rgba(124,92,252,0.15) inset",
      }}
    >
      <div
        className="h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, rgba(0,212,200,0.5), #7c5cfc, transparent)" }}
      />

      <div className="p-6 md:p-7 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-1.5">Challenge command</p>
            <h3 className="text-xl font-black text-text-primary leading-tight">{challenge.title}</h3>
            <p className="text-xs text-text-muted mt-1.5 max-w-xl">
              {challenge.rules || "AI reviews evidence against your challenge rules, then settles credits."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{
                background:
                  challenge.status === "judging"
                    ? "rgba(245,166,35,0.15)"
                    : settled
                      ? "rgba(0,232,122,0.12)"
                      : "rgba(124,92,252,0.12)",
                color:
                  challenge.status === "judging" ? "#f5a623" : settled ? "#00e87a" : "#a78bfa",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {statusLabel(challenge.status)}
            </span>
            {challenge.stake > 0 && (
              <span className="text-xs font-bold text-amber-400">{challenge.stake} credits at stake</span>
            )}
          </div>
        </div>

        {/* Phase track */}
        <div className="flex items-center gap-2 flex-wrap">
          {phases.map((p, i) => (
            <div key={p.key} className="flex items-center gap-2">
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{
                  background: p.done ? "rgba(0,232,122,0.1)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${p.done ? "rgba(0,232,122,0.25)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                  style={{
                    background: p.done ? "#00e87a" : "rgba(255,255,255,0.1)",
                    color: p.done ? "#06060f" : "rgba(240,240,255,0.5)",
                  }}
                >
                  {p.done ? "✓" : i + 1}
                </span>
                <span className="text-[11px] font-bold text-text-secondary">{p.label}</span>
              </div>
              {i < phases.length - 1 && (
                <span className="text-text-muted/40 hidden sm:inline">→</span>
              )}
            </div>
          ))}
        </div>

        {/* Participants + evidence checklist */}
        <div
          className="grid gap-3 sm:grid-cols-2"
          style={{
            background: "rgba(6,6,15,0.5)",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "16px",
            padding: "14px",
          }}
        >
          {accepted.map((p) => {
            const ev = evidenceByUser.get(p.user.id);
            return (
              <div
                key={p.id}
                className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}
                >
                  {p.user.username.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-text-primary truncate">{p.user.username}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                    {p.role} · {ev ? "Evidence in" : "Waiting"}
                  </p>
                  {ev && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">{ev.description || ev.url || "—"}</p>
                  )}
                </div>
                {ev && (
                  <span className="text-lg" aria-hidden>
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {verdictErr && (
          <div
            className="text-xs font-bold px-3 py-2 rounded-xl"
            style={{ background: "rgba(255,71,87,0.1)", color: "#ff4757", border: "1px solid rgba(255,71,87,0.2)" }}
          >
            {verdictErr}
          </div>
        )}

        <AnimatePresence mode="wait">
          {canSubmitEvidence && (
            <motion.div
              key="evidence-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <p className="text-xs font-bold text-accent uppercase tracking-wider">Your evidence</p>
              <textarea
                value={evidenceText}
                onChange={(e) => setEvidenceText(e.target.value)}
                placeholder="Describe what you did, times, reps, links to video, etc. Be specific — the AI uses this to judge."
                rows={4}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-text-primary placeholder:text-text-muted bg-bg-input border border-border-subtle focus:border-accent focus:outline-none resize-y min-h-[100px]"
              />
              <input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="HTTPS link to image or direct MP4/WebM (for AI vision). YouTube watch pages are text-only unless you host a raw file."
                className="w-full rounded-xl px-4 py-3 text-sm font-medium text-text-primary placeholder:text-text-muted bg-bg-input border border-border-subtle focus:border-accent focus:outline-none"
              />
              <motion.button
                type="button"
                disabled={busy || !evidenceText.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => void submitEvidence()}
                className="w-full py-3 rounded-xl text-sm font-extrabold text-white disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #00d4c8, #7c5cfc)",
                  boxShadow: "0 8px 32px rgba(0,212,200,0.25)",
                }}
              >
                {busy ? "Submitting…" : "Submit evidence"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {challenge.status === "judging" && (
          <div
            className="space-y-4 p-4 rounded-2xl"
            style={{
              background: "rgba(245,166,35,0.06)",
              border: "1px solid rgba(245,166,35,0.2)",
            }}
          >
            <p className="text-sm font-extrabold text-amber-200">All evidence is in. Run the AI judge.</p>
            <p className="text-xs text-text-secondary">
              Stronger models cost more credits but read nuance better. Only the challenge creator can start the verdict.
            </p>
            {isCreator && challenge.judgments.length === 0 && (
              <>
                <div className="flex flex-wrap gap-2">
                  {([1, 2, 3] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTier(t)}
                      className="px-3 py-2 rounded-xl text-xs font-extrabold transition-all"
                      style={{
                        background: tier === t ? "rgba(124,92,252,0.35)" : "rgba(255,255,255,0.05)",
                        border: `1px solid ${tier === t ? "rgba(124,92,252,0.6)" : "rgba(255,255,255,0.1)"}`,
                        color: tier === t ? "#f0f0ff" : "rgba(240,240,255,0.6)",
                      }}
                    >
                      {TIER_LABEL[t]} · {TIER_COST[t]} cr
                    </button>
                  ))}
                </div>
                <motion.button
                  type="button"
                  disabled={busy || !canRunAi}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => void runVerdict()}
                  className="w-full py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{
                    background: "linear-gradient(135deg, #f5a623, #7c5cfc)",
                    boxShadow: "0 8px 40px rgba(245,166,35,0.25)",
                  }}
                >
                  {busy ? "AI is judging…" : `Run AI verdict (${TIER_COST[tier]} credits)`}
                </motion.button>
              </>
            )}
            {!isCreator && (
              <p className="text-xs text-text-muted">Waiting for the creator to start the AI verdict.</p>
            )}
          </div>
        )}

        <AnimatePresence>
          {verdictRow && (
            <motion.div
              key="verdict"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3 p-5 rounded-2xl"
              style={{
                background: "rgba(0,232,122,0.07)",
                border: "1px solid rgba(0,232,122,0.2)",
              }}
            >
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00e87a]">AI verdict</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-black text-text-primary">
                  Winner:{" "}
                  <span style={{ color: "#00e87a" }}>
                    {verdictRow.winner?.username ?? "None / void"}
                  </span>
                </span>
                {verdictRow.aiModel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/5 text-text-muted">
                    {verdictRow.aiModel}
                  </span>
                )}
                {typeof verdictRow.confidence === "number" && (
                  <span className="text-xs font-bold text-amber-400">
                    {(verdictRow.confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                {verdictRow.reasoning}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2 pt-1">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={copyLink}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            Copy invite link
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void refresh()}
            className="px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            Refresh status
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
