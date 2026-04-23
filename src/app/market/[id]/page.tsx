"use client";

import { useState, useEffect, use, useCallback } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

// LuckyPlay canonical palette — see project_luckyplay_design_system memory
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const LAVENDER_TEXT = "#6B21A8";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

interface StatusChip {
  label: string;
  bg: string;
  text: string;
  emoji: string;
}

const STATUS_CHIPS: Record<string, StatusChip> = {
  draft:     { label: "Draft",     bg: NAVY_FAINT, text: NAVY_DIM,     emoji: "📝" },
  open:      { label: "Open",      bg: PEACH,      text: PEACH_TEXT,   emoji: "✨" },
  live:      { label: "Live",      bg: MINT,       text: MINT_TEXT,    emoji: "🔴" },
  judging:   { label: "Judging",   bg: LAVENDER,   text: LAVENDER_TEXT, emoji: "⚖️" },
  settled:   { label: "Settled",   bg: MINT,       text: MINT_TEXT,    emoji: "✅" },
  cancelled: { label: "Cancelled", bg: NAVY_FAINT, text: NAVY_DIM,     emoji: "✖️" },
  disputed:  { label: "Review needed", bg: ROSE_BG, text: ROSE_TEXT, emoji: "⚠️" },
  pending_settlement: { label: "Settling", bg: LAVENDER, text: LAVENDER_TEXT, emoji: "💫" },
};

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string } | undefined;

  const [market, setMarket] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    api.getChallenge(id)
      .then(res => { setMarket(res.challenge); setLoading(false); })
      .catch((e: unknown) => {
        // Surface the REAL error to the user instead of the old generic
        // "Market not found". An empty DB row is only one possible cause;
        // others include network errors, auth failures, Vercel cold-start
        // timeouts, etc. Showing the actual message makes triage possible
        // instead of "something went wrong, good luck".
        const msg = e instanceof Error ? e.message : String(e);
        const pretty =
          /404|not found/i.test(msg)
            ? "This market was deleted or the link is stale."
            : /401|unauthorized/i.test(msg)
              ? "Please sign in to view this market."
              : msg || "Could not load this market.";
        setError(pretty);
        setLoading(false);
      });
  }, [id]);

  const copyLink = useCallback(() => {
    const link = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [id]);

  const confirmVerdict = useCallback(async () => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const res = await api.confirmVerdict(id);
      setMarket(res.challenge);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Could not confirm the AI recommendation");
    } finally {
      setConfirming(false);
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div className="w-10 h-10 rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: PEACH, borderTopColor: "transparent" }}
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5 text-center">
        <div className="text-5xl mb-2">😿</div>
        <p className="text-base font-bold max-w-md" style={{ color: ROSE_TEXT }}>
          {error || "Market not found"}
        </p>
        <p className="text-[11px] font-mono opacity-60 max-w-md break-all" style={{ color: NAVY_DIM }}>
          market id: {id}
        </p>
        <div className="flex items-center gap-2 mt-2">
          <Link href="/"
            className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
            style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
            Make a new bet ✨
          </Link>
          <Link href="/markets"
            className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
            style={{ color: NAVY_DIM, background: NAVY_FAINT, borderRadius: "9999px" }}>
            My markets
          </Link>
        </div>
      </div>
    );
  }

  const isCreator = user?.id === market.creator?.id;
  const status = STATUS_CHIPS[market.status] || STATUS_CHIPS.draft;
  const stakeLabel = market.stake > 0 ? `${market.stake} cr` : "Free";
  const joinLink = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${id}`;
  const participantCount = market.participants?.length || 0;
  const maxParticipants = market.maxParticipants ?? 2;
  const latestJudgment = market.judgments?.[0] ?? null;
  const canConfirmVerdict = isCreator && market.status === "disputed" && !!latestJudgment;

  return (
    <div className="relative min-h-screen">
      {/* Header — consistent with homepage */}
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          LuckyPlay
        </Link>
        <Link href="/markets"
          className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
          style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
          My markets
        </Link>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-6">
        {/* Status pill + created date */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-bold"
            style={{ background: status.bg, color: status.text, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${status.bg}66` }}>
            <span>{status.emoji}</span>
            <span>{status.label}</span>
          </span>
          {isCreator && (
            <span className="text-xs font-semibold px-2.5 py-1"
              style={{ background: CREAM, color: PEACH_TEXT, borderRadius: "9999px" }}>
              Your market 💝
            </span>
          )}
          <span className="ml-auto text-xs font-medium" style={{ color: NAVY_DIM }}>
            {new Date(market.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Title card */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="lp-glass mb-4"
          style={{ borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)", padding: "24px 24px 20px" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: NAVY_DIM }}>📝 The bet</p>
          <h1 className="text-2xl font-extrabold mb-2 leading-tight" style={{ color: NAVY }}>{market.title}</h1>
          {market.proposition && market.proposition !== market.title && (
            <p className="text-sm font-medium mb-2 leading-relaxed" style={{ color: NAVY_DIM }}>
              {market.proposition}
            </p>
          )}
          <span className="inline-block text-[11px] font-bold px-2.5 py-0.5 mt-1"
            style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}>
            {market.type}
          </span>
        </motion.div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-4">
          <MetricCard label="Stake" emoji="💰" value={stakeLabel} tint={market.stake > 0 ? PEACH : MINT} />
          <MetricCard label="Evidence" emoji="📸" value={market.evidenceType?.replace(/_/g, " ") || "Self report"} tint={MINT} />
          <MetricCard label="Players" emoji="👥" value={`${participantCount} / ${maxParticipants}`} tint={LAVENDER} />
        </div>

        {/* Deadline */}
        {market.deadline && (
          <div className="mb-4 px-4 py-3"
            style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "20px", boxShadow: "0 4px 14px 0 rgba(216,180,254,0.20)" }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: NAVY_DIM }}>
              <span>⏰</span><span>Deadline</span>
            </p>
            <p className="text-sm font-bold" style={{ color: NAVY }}>{new Date(market.deadline).toLocaleString()}</p>
          </div>
        )}

        {/* Rules */}
        {market.rules && (
          <div className="mb-4 px-4 py-3.5"
            style={{ background: CREAM, border: `1px solid #FFE0CC`, borderRadius: "20px" }}>
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1" style={{ color: PEACH_DARK }}>
              <span>📖</span><span>Rules</span>
            </p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: NAVY }}>{market.rules}</p>
          </div>
        )}

        {latestJudgment && (
          <div className="mb-4 px-4 py-3.5"
            style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "20px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}>
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: LAVENDER_TEXT }}>
                  AI recommendation
                </p>
                <p className="text-sm font-extrabold" style={{ color: NAVY }}>
                  {latestJudgment.winner?.username ? `${latestJudgment.winner.username} is recommended to win` : "AI recommends a tie / void"}
                </p>
              </div>
              {typeof latestJudgment.confidence === "number" && (
                <span className="text-[11px] font-bold px-2.5 py-1"
                  style={{ color: LAVENDER_TEXT, background: "#F3E8FF", borderRadius: "9999px" }}>
                  {Math.round(latestJudgment.confidence * 100)}%
                </span>
              )}
            </div>
            {latestJudgment.reasoning && (
              <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap" style={{ color: NAVY_DIM }}>
                {latestJudgment.reasoning}
              </p>
            )}
            {market.status === "disputed" && (
              <p className="mt-3 text-xs font-semibold" style={{ color: ROSE_TEXT }}>
                This is not final yet. A human confirmation is required before credits settle.
              </p>
            )}
            {confirmError && (
              <p className="mt-3 text-xs font-bold" style={{ color: ROSE_TEXT }}>{confirmError}</p>
            )}
            {canConfirmVerdict && (
              <motion.button
                type="button"
                onClick={confirmVerdict}
                disabled={confirming}
                whileTap={{ scale: 0.96 }}
                className="mt-3 w-full py-3 text-sm font-extrabold disabled:opacity-50"
                style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}
              >
                {confirming ? "Settling..." : "Confirm AI recommendation and settle"}
              </motion.button>
            )}
          </div>
        )}

        {/* Participants */}
        <div className="mb-4 px-4 py-3"
          style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "20px", boxShadow: "0 4px 14px 0 rgba(15,23,42,0.04)" }}>
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: NAVY_DIM }}>
            <span>👥</span><span>Players</span>
          </p>
          {market.participants?.length ? (
            <div className="space-y-2">
              {market.participants.map(p => {
                const isRoleCreator = p.role === "creator";
                return (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ background: isRoleCreator ? PEACH : LAVENDER, color: isRoleCreator ? PEACH_TEXT : LAVENDER_TEXT }}>
                      {p.user?.username?.charAt(0)?.toUpperCase() || "?"}
                    </span>
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{p.user?.username || "Unknown"}</span>
                    <span className="ml-auto text-[11px] font-bold px-2 py-0.5"
                      style={{ color: isRoleCreator ? PEACH_TEXT : LAVENDER_TEXT, background: isRoleCreator ? CREAM : "#F3E8FF", borderRadius: "9999px" }}>
                      {p.role}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm font-medium py-2" style={{ color: NAVY_DIM }}>No players yet — share the link 👇</p>
          )}
        </div>

        {/* Invite link — only relevant when market still accepts players */}
        {market.status === "open" && (
          <div className="mb-4">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: NAVY_DIM }}>
              <span>🔗</span><span>Invite link</span>
            </p>
            <div className="flex items-center gap-2 p-2"
              style={{ background: "#FFFFFF", border: `2px solid ${NAVY_FAINT}`, borderRadius: "20px" }}>
              <input type="text" readOnly value={joinLink}
                className="flex-1 bg-transparent px-3 py-2 text-sm font-semibold focus:outline-none truncate"
                style={{ color: NAVY }} />
              <motion.button onClick={copyLink} whileTap={{ scale: 0.94 }}
                className="flex-shrink-0 px-4 py-2 text-sm font-bold"
                style={{
                  background: copied ? MINT : PEACH,
                  color: copied ? MINT_TEXT : PEACH_TEXT,
                  borderRadius: "9999px",
                  boxShadow: copied ? `0 4px 14px 0 rgba(110,231,183,0.40)` : `0 4px 14px 0 ${ORANGE_GLOW}`,
                }}>
                {copied ? "Copied ✓" : "Copy 📋"}
              </motion.button>
            </div>
          </div>
        )}

        {/* Primary action — varies by status + role */}
        {market.status === "open" && !isCreator && (
          <Link href={`/join/${id}`}
            className="block w-full py-4 text-center text-base font-extrabold active:scale-[0.97] transition-transform"
            style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
            🎲 Accept this market
          </Link>
        )}

        {market.status === "open" && isCreator && (
          <p className="text-center text-sm font-semibold py-3" style={{ color: NAVY_DIM }}>
            Waiting for an opponent to join…
          </p>
        )}

        {market.status === "live" && (
          <Link href={`/challenge/${id}/evidence`}
            className="block w-full py-4 text-center text-base font-extrabold active:scale-[0.97] transition-transform"
            style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px", boxShadow: `0 4px 14px 0 rgba(110,231,183,0.40)` }}>
            📸 Submit your evidence
          </Link>
        )}

        {(market.status === "judging" || market.status === "pending_settlement") && (
          <div className="text-center py-4 px-4"
            style={{ background: "#F3E8FF", border: `1px solid ${LAVENDER}`, borderRadius: "20px" }}>
            <div className="text-3xl mb-2">⚖️</div>
            <p className="text-sm font-bold" style={{ color: LAVENDER_TEXT }}>AI is reviewing the evidence…</p>
          </div>
        )}

        {/* Evidence count */}
        {market._count && market._count.evidence > 0 && (
          <div className="mt-4 px-4 py-3 text-center"
            style={{ background: "#F0F9FF", border: `1px solid #BAE6FD`, borderRadius: "20px" }}>
            <p className="text-sm font-semibold" style={{ color: "#0369A1" }}>
              📦 {market._count.evidence} evidence submission{market._count.evidence > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/"
            className="inline-block text-xs font-bold px-4 py-2 transition-colors active:scale-95"
            style={{ color: NAVY_DIM, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, emoji, value, tint }: { label: string; emoji: string; value: string; tint: string }) {
  return (
    <div className="px-3 py-3"
      style={{
        background: `${tint}14`,
        border: `1px solid ${tint}33`,
        borderRadius: "16px",
      }}>
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: NAVY_DIM }}>
        <span>{emoji}</span>
        <span>{label}</span>
      </p>
      <p className="text-sm font-bold" style={{ color: NAVY }}>{value}</p>
    </div>
  );
}
