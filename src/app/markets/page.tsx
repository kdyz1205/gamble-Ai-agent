"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";
import { isOpenForOpponentStatus, isTerminalStatus } from "@/lib/challenge-state-machine";

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

const CANCELLABLE_BEFORE_EVIDENCE = new Set([
  "waiting_for_opponent",
  "open",
  "opponent_accepted",
  "escrow_locked",
  "evidence_window_open",
  "matched",
  "live",
]);

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

function hasChallengeHistory(market: ChallengeData) {
  return (
    (market._count?.evidence ?? market.evidence?.length ?? 0) > 0 ||
    (market._count?.judgments ?? market.judgments?.length ?? 0) > 0 ||
    (market._count?.judgeJobs ?? 0) > 0
  );
}

type ManageAction =
  | { kind: "delete"; label: string; confirm: string; success: string }
  | { kind: "cancel"; label: string; confirm: string; success: string }
  | { kind: "archive"; label: string; confirm: string; success: string }
  | { kind: "restore"; label: string; confirm: string; success: string }
  | { kind: "locked"; label: string; reason: string };

function getManageAction(market: ChallengeData, userId?: string): ManageAction | null {
  if (!userId || market.creatorId !== userId) return null;
  if (market.visibility === "archived") {
    return {
      kind: "restore",
      label: "Restore",
      confirm: `Restore "${market.title}" to your challenge board? It will stay private and out of public discovery.`,
      success: "Restored to your private challenge board.",
    };
  }
  if (isTerminalStatus(market.status)) {
    return {
      kind: "archive",
      label: "Archive",
      confirm: `Archive "${market.title}"? The result and ledger stay preserved, but it will leave your default board.`,
      success: "Archived. Result and ledger history were preserved.",
    };
  }
  if (hasChallengeHistory(market)) {
    return {
      kind: "archive",
      label: "Archive",
      confirm: `Archive "${market.title}"? Evidence and judgment history stay preserved for audit.`,
      success: "Archived. Evidence and judgment history were preserved.",
    };
  }

  const hasOpponent = hasOtherParticipant(market, userId);
  const canDeleteEmpty = !hasOpponent && (["draft", "cancelled"].includes(market.status) || isOpenForOpponentStatus(market.status));
  if (canDeleteEmpty) {
    return {
      kind: "delete",
      label: "Close empty",
      confirm: `Close "${market.title}"? Nobody else has joined, so this removes it from discovery.`,
      success: market.stake > 0 ? "Closed and creator stake refunded." : "Closed and removed from discovery.",
    };
  }
  if (CANCELLABLE_BEFORE_EVIDENCE.has(market.status)) {
    return {
      kind: "cancel",
      label: hasOpponent ? "Cancel & refund" : "Cancel",
      confirm: `Cancel "${market.title}"? This stops the challenge before evidence/judging and refunds locked credits when needed.`,
      success: market.stake > 0 ? "Cancelled and locked credits refunded." : "Cancelled.",
    };
  }
  return { kind: "locked", label: "Locked", reason: `Status ${market.status.replace(/_/g, " ")} needs room review.` };
}

function messageColor(message: string) {
  if (/closed|cancelled|refunded/i.test(message)) return MINT_TEXT;
  if (/temporarily unavailable|still usable/i.test(message)) return NAVY_DIM;
  return ROSE_TEXT;
}

export default function MarketsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const sessionLoading = sessionStatus === "loading";
  const user = session?.user as { id?: string; username?: string } | undefined;
  const userId = user?.id;
  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [openPublic, setOpenPublic] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const loadChallenges = useCallback(async () => {
    if (sessionLoading) return;
    setLoading(true);
    setMessage(null);
    try {
      const [mineResult, publicResult] = await Promise.allSettled([
        userId ? api.listChallenges({ mine: true, includeArchived: showArchived, limit: 50 }) : Promise.resolve({ challenges: [], total: 0 }),
        api.discoverChallenges({ limit: 30 }),
      ]);
      if (mineResult.status === "fulfilled") {
        setMarkets(mineResult.value.challenges);
      } else {
        setMarkets([]);
        setMessage("Could not load your challenge board. Refresh and try again.");
      }
      if (publicResult.status === "fulfilled") {
        setOpenPublic((publicResult.value.challenges || []).filter((c) => c.creator.id !== userId));
      } else {
        setOpenPublic([]);
        if (mineResult.status === "fulfilled") {
          setMessage("Open challenge discovery is temporarily unavailable. Your own challenge board is still usable.");
        }
      }
    } catch (err) {
      console.warn("[markets] challenge manager load failed", err);
      setMessage("Could not load challenge manager. Refresh and try again.");
    } finally {
      setLoading(false);
    }
  }, [sessionLoading, showArchived, userId]);

  useEffect(() => {
    void loadChallenges();
  }, [loadChallenges]);

  const grouped = useMemo(() => {
    const archived = markets.filter((market) => market.visibility === "archived");
    const visible = markets.filter((market) => market.visibility !== "archived");
    const active = visible.filter((market) => !isTerminalStatus(market.status));
    const closed = visible.filter((market) => isTerminalStatus(market.status));
    return { active, closed, archived };
  }, [markets]);

  const tryMatchMe = async () => {
    if (!user) {
      setMessage("Sign in to be matched into a challenge.");
      return;
    }
    setMatching(true);
    setMessage(null);
    try {
      const r = await api.agentRespond("给我匹配一个挑战", [], api.emptyAgentDraftState());
      const tr = r.toolResult as { matched?: boolean; joinUrl?: string; challengeUrl?: string; marketUrl?: string; message?: string; reason?: string } | undefined;
      if (tr?.matched) {
        window.location.href = tr.joinUrl || tr.challengeUrl || tr.marketUrl || "/markets";
        return;
      }
      setMessage(tr?.message || tr?.reason || r.userVisibleReply || "No open challenges to match right now.");
    } catch (e) {
      console.warn("[markets] match failed", e);
      setMessage("Matchmaking is temporarily unavailable. You can still join from a shared link or create a challenge.");
    } finally {
      setMatching(false);
    }
  };

  const closeChallenge = async (market: ChallengeData) => {
    const action = getManageAction(market, user?.id);
    if (!action || action.kind === "locked") return;
    if (!window.confirm(action.confirm)) return;
    setClosingId(market.id);
    setMessage(null);
    try {
      if (action.kind === "delete") {
        const res = await api.deleteChallenge(market.id);
        setMarkets((prev) => prev.filter((item) => item.id !== market.id));
        setOpenPublic((prev) => prev.filter((item) => item.id !== market.id));
        setMessage(res.refundedStake > 0 ? `Closed. ${res.refundedStake} credits refunded.` : action.success);
      } else if (action.kind === "cancel") {
        const res = await api.cancelChallenge(market.id, { reason: "Creator cancelled from challenge manager." });
        if (res.challenge) {
          setMarkets((prev) => prev.map((item) => item.id === market.id ? res.challenge : item));
          setOpenPublic((prev) => prev.filter((item) => item.id !== market.id));
        } else {
          await loadChallenges();
        }
        setMessage(res.cancellation.refunded ? "Cancelled. Credits refunded." : action.success);
      } else {
        const res = await api.archiveChallenge(market.id, { archived: action.kind === "archive" });
        setMarkets((prev) => {
          if (action.kind === "archive" && !showArchived) return prev.filter((item) => item.id !== market.id);
          return prev.map((item) => item.id === market.id ? res.challenge : item);
        });
        setOpenPublic((prev) => prev.filter((item) => item.id !== market.id));
        setMessage(action.success);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Couldn't close this challenge");
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
            Axelrod
          </Link>
          <span className="hidden text-xs font-bold sm:inline" style={{ color: NAVY_DIM }}>
            Challenge manager
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadChallenges}
            disabled={loading}
            className="text-xs font-bold px-3 py-1.5 active:scale-95 disabled:opacity-50 transition-transform"
            style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
          <Link
            href="/"
            className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
            style={{ color: PEACH_TEXT, background: CREAM, border: "1px solid #FFE0CC", borderRadius: "9999px" }}
          >
            + New challenge
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-4">
        <section className="mb-5 rounded-[28px] border bg-white/90 p-5 shadow-sm" style={{ borderColor: NAVY_FAINT, boxShadow: "0 18px 50px rgba(15,23,42,0.06)" }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: MINT_TEXT }}>
                Manage challenges
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl" style={{ color: NAVY }}>
                Keep every challenge closeable, traceable, and easy to re-enter.
              </h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed" style={{ color: NAVY_DIM }}>
                Your active challenges stay here. Empty challenges can be removed, accepted challenges can be cancelled before evidence, and locked challenges point you back to the room for review.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center md:min-w-[320px]">
              <div className="rounded-2xl border bg-white p-3" style={{ borderColor: NAVY_FAINT }}>
                <p className="text-[10px] font-black uppercase" style={{ color: NAVY_DIM }}>Active</p>
                <p className="mt-1 text-xl font-black" style={{ color: NAVY }}>{grouped.active.length}</p>
              </div>
              <div className="rounded-2xl border bg-white p-3" style={{ borderColor: NAVY_FAINT }}>
                <p className="text-[10px] font-black uppercase" style={{ color: NAVY_DIM }}>Closed</p>
                <p className="mt-1 text-xl font-black" style={{ color: NAVY }}>{grouped.closed.length}</p>
              </div>
              <div className="rounded-2xl border bg-white p-3" style={{ borderColor: NAVY_FAINT }}>
                <p className="text-[10px] font-black uppercase" style={{ color: NAVY_DIM }}>Nearby</p>
                <p className="mt-1 text-xl font-black" style={{ color: NAVY }}>{openPublic.length}</p>
              </div>
            </div>
          </div>
          {user && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: NAVY_FAINT }}>
              <p className="text-xs font-bold" style={{ color: NAVY_DIM }}>
                Archive keeps evidence, verdict, and ledger history but removes clutter from the default board.
              </p>
              <button
                type="button"
                onClick={() => setShowArchived((value) => !value)}
                className="px-4 py-2 text-xs font-black active:scale-95 transition-transform"
                style={{ color: showArchived ? PEACH_TEXT : NAVY, background: showArchived ? CREAM : "#FFFFFF", border: `1px solid ${showArchived ? "#FDBA74" : NAVY_FAINT}`, borderRadius: "9999px" }}
              >
                {showArchived ? "Hide archived" : "Show archived"}
              </button>
            </div>
          )}
        </section>
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
            Let AI pair you with someone else&apos;s open challenge.
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
            <p className="text-[11px] font-semibold mt-2" style={{ color: messageColor(message) }}>{message}</p>
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

        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-extrabold" style={{ color: NAVY }}>
              {sessionLoading ? "Challenges" : user ? "Your challenge board" : "Open challenges"}
            </h2>
            {user && (
              <p className="mt-1 text-xs font-semibold" style={{ color: NAVY_DIM }}>
                Active first, closed history below. Use Manage to return to the exact room.
              </p>
            )}
          </div>
          <Link
            href="/"
            className="hidden shrink-0 px-4 py-2 text-xs font-black active:scale-95 transition-transform sm:inline-block"
            style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}
          >
            Create another
          </Link>
        </div>

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
            <p className="text-base font-semibold mb-4" style={{ color: NAVY_DIM }}>No challenges yet.</p>
            <Link
              href="/"
              className="inline-block px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
              style={{ color: PEACH_TEXT, background: PEACH, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}
            >
              Create your first challenge
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {([
              ["Active", grouped.active],
              ["Closed history", grouped.closed],
              ["Archived", grouped.archived],
            ] as const).map(([groupLabel, groupItems]) => groupItems.length > 0 && (
              <section key={groupLabel}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase tracking-[0.16em]" style={{ color: groupLabel === "Active" ? MINT_TEXT : NAVY_DIM }}>
                    {groupLabel} / {groupItems.length}
                  </h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
            {groupItems.map((m, i) => {
              const status = STATUS_STYLE[m.status] || STATUS_STYLE.draft;
              const pcount = m.participants?.length || 0;
              const maxP = m.maxParticipants ?? 2;
              const manageAction = getManageAction(m, user.id);
              const canAct = manageAction?.kind === "delete" || manageAction?.kind === "cancel" || manageAction?.kind === "archive" || manageAction?.kind === "restore";
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
                      href={`/challenge/${m.id}`}
                      className="flex-1 text-center py-2 text-xs font-black active:scale-95 transition-transform"
                      style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
                    >
                      Manage
                    </Link>
                    {canAct && (
                      <button
                        type="button"
                        onClick={() => closeChallenge(m)}
                        disabled={closingId === m.id}
                        className="px-4 py-2 text-xs font-black active:scale-95 disabled:opacity-50 transition-transform"
                        style={{
                          color: manageAction.kind === "restore" ? MINT_TEXT : manageAction.kind === "archive" ? NAVY : ROSE_TEXT,
                          background: manageAction.kind === "restore" ? MINT : manageAction.kind === "archive" ? NAVY_FAINT : ROSE_BG,
                          border: `1px solid ${manageAction.kind === "restore" ? "#6EE7B7" : manageAction.kind === "archive" ? "#CBD5E1" : "#FDA4AF"}`,
                          borderRadius: "9999px",
                        }}
                      >
                        {closingId === m.id ? "Closing..." : manageAction.label}
                      </button>
                    )}
                    {manageAction?.kind === "locked" && (
                      <span
                        className="px-3 py-2 text-[10px] font-black"
                        style={{ color: NAVY_DIM, background: NAVY_FAINT, borderRadius: "9999px" }}
                        title={manageAction.reason}
                      >
                        {manageAction.label}
                      </span>
                    )}
                  </div>
                  {manageAction?.kind === "locked" && (
                    <p className="mt-2 text-[10px] font-bold" style={{ color: NAVY_DIM }}>
                      {manageAction.reason}
                    </p>
                  )}
                </motion.article>
              );
            })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
