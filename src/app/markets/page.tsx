"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

// LuckyPlay palette
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

const STATUS_STYLE: Record<string, { bg: string; text: string; emoji: string; label: string }> = {
  draft:     { bg: NAVY_FAINT, text: NAVY_DIM,     emoji: "📝", label: "Draft" },
  open:      { bg: PEACH,      text: PEACH_TEXT,   emoji: "✨", label: "Open" },
  live:      { bg: MINT,       text: MINT_TEXT,    emoji: "🔴", label: "Live" },
  judging:   { bg: LAVENDER,   text: LAVENDER_TEXT, emoji: "⚖️", label: "Judging" },
  settled:   { bg: MINT,       text: MINT_TEXT,    emoji: "✅", label: "Settled" },
  cancelled: { bg: NAVY_FAINT, text: NAVY_DIM,     emoji: "✖️", label: "Cancelled" },
  disputed:  { bg: ROSE_BG,    text: ROSE_TEXT,    emoji: "⚠️", label: "Review needed" },
  pending_settlement: { bg: LAVENDER, text: LAVENDER_TEXT, emoji: "💫", label: "Settling" },
};

export default function MarketsPage() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string } | undefined;
  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [openPublic, setOpenPublic] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    // Load BOTH "my markets" AND "open public markets other people are waiting
    // for an opponent on". Without the second list the page feels empty the
    // first time a user opens it. Drives discovery — the user explicitly
    // called this out ("我根本没办法看到任何挑战任何市场").
    Promise.all([
      api.listChallenges({ mine: true, limit: 50 }),
      api.listChallenges({ status: "open", limit: 30 }),
    ])
      .then(([mine, publ]) => {
        setMarkets(mine.challenges);
        // Strip my own markets out of the "public" list so they don't show twice
        setOpenPublic((publ.challenges || []).filter((c) => c.creator.id !== user.id));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [user]);

  // "Match me" — WeChat-drift-bottle-style: agent picks the best open public
  // market and accepts it on your behalf. Goes through the agent orchestrator
  // so the LLM gets a chance to pick something that fits (e.g. not a BTC bet
  // if the user's history is fitness) and gives a friendly reply.
  const tryMatchMe = async () => {
    setMatching(true);
    setMatchError(null);
    try {
      const r = await api.agentRespond("给我匹配一个挑战", [], api.emptyAgentDraftState());
      const tr = r.toolResult as { matched?: boolean; marketUrl?: string; challengeId?: string; message?: string; reason?: string } | undefined;
      if (tr?.matched && tr.marketUrl) {
        window.location.href = tr.marketUrl;
        return;
      }
      setMatchError(tr?.message || tr?.reason || r.userVisibleReply || "No open challenges to match right now.");
    } catch (e) {
      setMatchError(e instanceof Error ? e.message : "Couldn't match right now");
    } finally {
      setMatching(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <div className="text-4xl mb-2">👋</div>
        <p className="text-base font-bold" style={{ color: NAVY }}>Sign in to see your markets.</p>
        <Link href="/"
          className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
          Go home ✨
        </Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          LuckyPlay
        </Link>
        <Link href="/"
          className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
          style={{ color: PEACH_TEXT, background: CREAM, border: `1px solid #FFE0CC`, borderRadius: "9999px" }}>
          + New bet
        </Link>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-4">
        {/* Match-me CTA — AI drift-bottle style. When there's no one to bet
            with, this is the "just give me an opponent" escape hatch. */}
        <motion.div
          className="mb-5 lp-glass p-4 rounded-[20px]"
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            background: `linear-gradient(135deg, ${PEACH}33, ${MINT}22, ${LAVENDER}22)`,
            border: `1px solid ${NAVY_FAINT}`,
          }}
        >
          <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: PEACH_TEXT }}>
            🎯 Match me with an open challenge
          </p>
          <p className="text-xs font-medium mb-3 leading-relaxed" style={{ color: NAVY_DIM }}>
            Don&apos;t feel like creating one? Let AI pair you with someone else&apos;s open bet — like shaking WeChat for a drift bottle.
          </p>
          <button
            onClick={tryMatchMe}
            disabled={matching}
            className="w-full py-3 text-sm font-black rounded-full active:scale-95 disabled:opacity-50 transition-all"
            style={{
              background: PEACH, color: PEACH_TEXT,
              boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
              border: `1.5px solid ${PEACH_TEXT}22`,
            }}
          >
            {matching ? "🔍 Looking…" : "🎲 Match me now"}
          </button>
          {matchError && (
            <p className="text-[11px] font-semibold mt-2" style={{ color: ROSE_TEXT }}>{matchError}</p>
          )}
        </motion.div>

        {/* Open public markets — what other people are waiting for an opponent on */}
        {openPublic.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-black uppercase tracking-wider mb-3" style={{ color: MINT_TEXT }}>
              ✨ Open for anyone — {openPublic.length} waiting
            </h2>
            <div className="space-y-2">
              {openPublic.slice(0, 5).map((m) => (
                <Link key={m.id} href={`/join/${m.id}`}
                  className="block p-3 rounded-2xl lp-glass active:scale-[0.98] transition-transform"
                  style={{ border: `1px solid ${NAVY_FAINT}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate mb-0.5" style={{ color: NAVY }}>{m.title}</p>
                      <p className="text-[11px] font-medium" style={{ color: NAVY_DIM }}>
                        by {m.creator.username} · {m.type} · {m.stake > 0 ? `${m.stake} cr` : "free"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-black px-2 py-1 rounded-full"
                      style={{ background: PEACH, color: PEACH_TEXT }}>Join →</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <h1 className="text-2xl font-extrabold mb-5" style={{ color: NAVY }}>My markets 🎲</h1>

        {loading ? (
          <div className="text-center py-16">
            <motion.div className="w-10 h-10 mx-auto rounded-full border-[3px] border-t-transparent"
              style={{ borderColor: PEACH, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🙈</div>
            <p className="text-base font-semibold mb-4" style={{ color: NAVY_DIM }}>No markets yet.</p>
            <Link href="/"
              className="inline-block px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
              Make your first bet ✨
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {markets.map((m, i) => {
              const status = STATUS_STYLE[m.status] || STATUS_STYLE.draft;
              const pcount = m.participants?.length || 0;
              const maxP = m.maxParticipants ?? 2;
              return (
                <motion.div key={m.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link href={`/market/${m.id}`}
                    className="block p-4 active:scale-[0.99] transition-transform lp-glass"
                    style={{ borderRadius: "20px", boxShadow: "0 4px 14px 0 rgba(15,23,42,0.04)" }}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold truncate" style={{ color: NAVY }}>{m.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] font-bold px-2 py-0.5"
                            style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}>
                            {m.type}
                          </span>
                          <span className="text-xs font-bold" style={{ color: m.stake > 0 ? PEACH_TEXT : MINT_TEXT }}>
                            {m.stake > 0 ? `${m.stake} cr` : "Free"}
                          </span>
                        </div>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold"
                        style={{ color: status.text, background: status.bg, borderRadius: "9999px" }}>
                        <span>{status.emoji}</span><span>{status.label}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium" style={{ color: NAVY_DIM }}>
                      <span>👥 {pcount}/{maxP}</span>
                      <span>·</span>
                      <span>{new Date(m.createdAt).toLocaleDateString()}</span>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
