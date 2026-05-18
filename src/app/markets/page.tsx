"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";
import { isOpenForOpponentStatus } from "@/lib/challenge-state-machine";

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const LAVENDER_TEXT = "#6B21A8";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: NAVY_FAINT, text: NAVY_DIM, label: "Draft" },
  open: { bg: PEACH, text: PEACH_TEXT, label: "Open" },
  live: { bg: MINT, text: MINT_TEXT, label: "Live" },
  judging: { bg: LAVENDER, text: LAVENDER_TEXT, label: "Judging" },
  settled: { bg: MINT, text: MINT_TEXT, label: "Settled" },
  cancelled: { bg: NAVY_FAINT, text: NAVY_DIM, label: "Cancelled" },
  disputed: { bg: ROSE_BG, text: ROSE_TEXT, label: "Review needed" },
  pending_settlement: { bg: LAVENDER, text: LAVENDER_TEXT, label: "Settling" },
  waiting_for_opponent: { bg: PEACH, text: PEACH_TEXT, label: "Waiting" },
  evidence_window_open: { bg: MINT, text: MINT_TEXT, label: "Evidence" },
  creator_submitted: { bg: MINT, text: MINT_TEXT, label: "Creator submitted" },
  opponent_submitted: { bg: MINT, text: MINT_TEXT, label: "Opponent submitted" },
  ai_reviewing: { bg: LAVENDER, text: LAVENDER_TEXT, label: "AI reviewing" },
  ai_verdict_ready: { bg: LAVENDER, text: LAVENDER_TEXT, label: "Verdict ready" },
  dispute_window_open: { bg: ROSE_BG, text: ROSE_TEXT, label: "Dispute window" },
  manual_review_required: { bg: ROSE_BG, text: ROSE_TEXT, label: "Manual review" },
  ai_inconclusive: { bg: ROSE_BG, text: ROSE_TEXT, label: "AI inconclusive" },
  finalized: { bg: LAVENDER, text: LAVENDER_TEXT, label: "Finalized" },
  refunded: { bg: NAVY_FAINT, text: NAVY_DIM, label: "Refunded" },
  voided: { bg: NAVY_FAINT, text: NAVY_DIM, label: "Voided" },
};

function formatDeadline(value: string | null) {
  if (!value) return "No deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function hasOtherParticipant(market: ChallengeData, userId?: string) {
  return (market.participants || []).some((participant) => (
    participant.user.id !== userId && participant.status !== "declined"
  ));
}

export default function MarketsPage() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string } | undefined;
  const userId = user?.id;
  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [openPublic, setOpenPublic] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      userId ? api.listChallenges({ mine: true, limit: 50 }) : Promise.resolve({ challenges: [], total: 0 }),
      api.discoverChallenges({ limit: 30 }),
    ])
      .then(([mine, publ]) => {
        if (!active) return;
        setMarkets(mine.challenges);
        setOpenPublic((publ.challenges || []).filter((c) => c.creator.id !== userId));
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Couldn't load markets");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const tryMatchMe = async () => {
    if (!user) {
      setMessage("Sign in to be matched into a challenge.");
      return;
    }
    setMatching(true);
    setMessage(null);
    try {
      const r = await api.agentRespond("给我匹配一个挑战", [], api.emptyAgentDraftState());
      const tr = r.toolResult as { matched?: boolean; marketUrl?: string; message?: string; reason?: string } | undefined;
      if (tr?.matched && tr.marketUrl) {
        window.location.href = tr.marketUrl;
        return;
      }
      setMessage(tr?.message || tr?.reason || r.userVisibleReply || "No open challenges to match right now.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't match right now");
    } finally {
      setMatching(false);
    }
  };

  const closeEmptyMarket = async (market: ChallengeData) => {
    if (!window.confirm(`Close "${market.title}"? This only works while nobody else has joined.`)) return;
    setClosingId(market.id);
    setMessage(null);
    try {
      const res = await api.deleteChallenge(market.id);
      setMarkets((prev) => prev.filter((item) => item.id !== market.id));
      setOpenPublic((prev) => prev.filter((item) => item.id !== market.id));
      setMessage(res.refundedStake > 0 ? `Closed. ${res.refundedStake} credits refunded.` : "Closed.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't close this market");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          LuckyPlay
        </Link>
        <Link
          href="/"
          className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
          style={{ color: PEACH_TEXT, background: CREAM, border: "1px solid #FFE0CC", borderRadius: "9999px" }}
        >
          + New bet
        </Link>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-4">
        <motion.div
          className="mb-5 lp-glass p-4 rounded-[20px]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: `linear-gradient(135deg, ${PEACH}33, ${MINT}22, ${LAVENDER}22)`,
            border: `1px solid ${NAVY_FAINT}`,
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: PEACH_TEXT }}>
            Match me with an open challenge
          </p>
          <p className="text-xs font-medium mb-3 leading-relaxed" style={{ color: NAVY_DIM }}>
            Let AI pair you with someone else&apos;s open bet.
          </p>
          <button
            onClick={tryMatchMe}
            disabled={matching}
            className="w-full py-3 text-sm font-black rounded-full active:scale-95 disabled:opacity-50 transition-all"
            style={{
              background: PEACH,
              color: PEACH_TEXT,
              boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
              border: `1.5px solid ${PEACH_TEXT}22`,
            }}
          >
            {matching ? "Looking..." : "Match me now"}
          </button>
          {message && (
            <p className="text-[11px] font-semibold mt-2" style={{ color: message.startsWith("Closed") ? MINT_TEXT : ROSE_TEXT }}>{message}</p>
          )}
        </motion.div>

        {openPublic.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: MINT_TEXT }}>
              Open for anyone - {openPublic.length} waiting
            </h2>
            <div className="space-y-2">
              {openPublic.slice(0, 5).map((m) => (
                <Link
                  key={m.id}
                  href={`/join/${m.id}`}
                  className="block p-3 rounded-2xl lp-glass active:scale-[0.98] transition-transform"
                  style={{ border: `1px solid ${NAVY_FAINT}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate mb-0.5" style={{ color: NAVY }}>{m.title}</p>
                      <p className="text-[11px] font-medium" style={{ color: NAVY_DIM }}>
                        by {m.creator.username} / {m.type} / {m.stake > 0 ? `${m.stake} cr` : "free"}
                      </p>
                      <p className="text-[10px] font-semibold mt-0.5" style={{ color: NAVY_DIM }}>
                        Deadline: {formatDeadline(m.deadline)}
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full"
                      style={{ background: PEACH, color: PEACH_TEXT }}
                    >
                      Join
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <h1 className="text-2xl font-extrabold mb-5" style={{ color: NAVY }}>
          {user ? "My markets" : "Open challenges"}
        </h1>

        {loading ? (
          <div className="text-center py-16">
            <motion.div
              className="w-10 h-10 mx-auto rounded-full border-[3px] border-t-transparent"
              style={{ borderColor: PEACH, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
        ) : !user ? (
          <div className="text-center py-10">
            <p className="text-base font-semibold mb-4" style={{ color: NAVY_DIM }}>Sign in when you are ready to join or create.</p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}
            >
              Sign in / create
            </Link>
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-base font-semibold mb-4" style={{ color: NAVY_DIM }}>No markets yet.</p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}
            >
              Make your first bet
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {markets.map((m, i) => {
              const status = STATUS_STYLE[m.status] || STATUS_STYLE.draft;
              const pcount = m.participants?.length || 0;
              const maxP = m.maxParticipants ?? 2;
              const canClose = (["draft", "cancelled"].includes(m.status) || isOpenForOpponentStatus(m.status)) && !hasOtherParticipant(m, user.id);
              return (
                <motion.article
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className="p-4 lp-glass"
                  style={{ borderRadius: "20px", boxShadow: "0 4px 14px 0 rgba(15,23,42,0.04)" }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold truncate" style={{ color: NAVY }}>{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5"
                          style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}
                        >
                          {m.type}
                        </span>
                        <span className="text-xs font-bold" style={{ color: m.stake > 0 ? PEACH_TEXT : MINT_TEXT }}>
                          {m.stake > 0 ? `${m.stake} cr` : "Free"}
                        </span>
                      </div>
                    </div>
                    <span
                      className="flex-shrink-0 inline-flex items-center px-2.5 py-1 text-[11px] font-bold"
                      style={{ color: status.text, background: status.bg, borderRadius: "9999px" }}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs font-medium" style={{ color: NAVY_DIM }}>
                    <span>{pcount}/{maxP} players</span>
                    <span>/</span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                    <span>/</span>
                    <span>{formatDeadline(m.deadline)}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <Link
                      href={`/market/${m.id}`}
                      className="flex-1 text-center py-2 text-xs font-black active:scale-95 transition-transform"
                      style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
                    >
                      Open
                    </Link>
                    {canClose && (
                      <button
                        type="button"
                        onClick={() => closeEmptyMarket(m)}
                        disabled={closingId === m.id}
                        className="px-4 py-2 text-xs font-black active:scale-95 disabled:opacity-50 transition-transform"
                        style={{ color: ROSE_TEXT, background: ROSE_BG, border: "1px solid #FDA4AF", borderRadius: "9999px" }}
                      >
                        {closingId === m.id ? "Closing..." : "Close"}
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
