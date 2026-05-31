"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ManualReviewQueueItem } from "@/lib/api-client";

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const CREAM = "#FFEDD5";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";
const LAVENDER = "#E9D5FF";
const LAVENDER_TEXT = "#6B21A8";

type ResolutionOutcome = "winner" | "refund" | "void";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusStyle(status: string) {
  if (status === "disputed" || status === "manual_review_required") return { bg: ROSE_BG, text: ROSE_TEXT, label: "Needs review" };
  if (status === "ai_inconclusive") return { bg: LAVENDER, text: LAVENDER_TEXT, label: "AI inconclusive" };
  return { bg: NAVY_FAINT, text: NAVY_DIM, label: status.replace(/_/g, " ") };
}

function firstAcceptedParticipant(item: ManualReviewQueueItem) {
  return item.participants.find((participant) => participant.status === "accepted")?.userId ?? "";
}

export default function ManualReviewPage() {
  const { data: session, status: sessionStatus } = useSession();
  const user = session?.user as { id?: string; username?: string; email?: string } | undefined;
  const [items, setItems] = useState<ManualReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [winnerByChallenge, setWinnerByChallenge] = useState<Record<string, string>>({});
  const [reasonByChallenge, setReasonByChallenge] = useState<Record<string, string>>({});

  const loadQueue = useCallback(async () => {
    if (sessionStatus === "loading") return;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const result = await api.getManualReviewQueue({ limit: 50 });
      setItems(result.items);
      setWinnerByChallenge((prev) => {
        const next = { ...prev };
        for (const item of result.items) {
          if (!next[item.challengeId]) next[item.challengeId] = firstAcceptedParticipant(item);
        }
        return next;
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not load review queue.");
    } finally {
      setLoading(false);
    }
  }, [sessionStatus, user]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const counts = useMemo(() => ({
    total: items.length,
    canResolve: items.filter((item) => item.canResolve).length,
    waiting: items.filter((item) => !item.canResolve).length,
  }), [items]);

  const resolveItem = async (item: ManualReviewQueueItem, outcome: ResolutionOutcome) => {
    const winnerId = winnerByChallenge[item.challengeId] || firstAcceptedParticipant(item);
    if (outcome === "winner" && !winnerId) {
      setMessage("Pick a winner first.");
      return;
    }
    setBusyId(item.challengeId);
    setMessage(null);
    try {
      await api.manualResolveChallenge(item.challengeId, {
        outcome,
        winnerId: outcome === "winner" ? winnerId : null,
        reason: reasonByChallenge[item.challengeId] || "Manual review resolved from the queue.",
      });
      setItems((prev) => prev.filter((entry) => entry.challengeId !== item.challengeId));
      setMessage(outcome === "winner" ? "Winner settled." : outcome === "refund" ? "Refund resolved." : "Void resolved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Manual resolution failed.");
    } finally {
      setBusyId(null);
    }
  };

  if (!user && sessionStatus !== "loading") {
    return (
      <div className="min-h-screen px-5 py-4">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>stubborn</Link>
          <Link href="/" className="px-4 py-2 text-xs font-black" style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}>
            Sign in
          </Link>
        </header>
        <main className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center">
          <p className="rounded-3xl border bg-white px-6 py-5 text-sm font-bold" style={{ color: NAVY_DIM, borderColor: NAVY_FAINT }}>
            Sign in to see review items connected to your account.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>stubborn</Link>
          <span className="hidden text-xs font-bold sm:inline" style={{ color: NAVY_DIM }}>Review queue</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadQueue}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-black active:scale-95 disabled:opacity-50"
            style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
          >
            {loading ? "Refreshing" : "Refresh"}
          </button>
          <Link href="/markets" className="px-3 py-1.5 text-xs font-black" style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}>
            Manager
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 py-4">
        <section className="mb-5 rounded-[28px] border bg-white/90 p-5 shadow-sm" style={{ borderColor: NAVY_FAINT, boxShadow: "0 18px 50px rgba(15,23,42,0.06)" }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: ROSE_TEXT }}>Manual review</p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl" style={{ color: NAVY }}>Resolve blocked verdicts</h1>
              <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed" style={{ color: NAVY_DIM }}>
                Review evidence, pick winner, refund, or void. Ledger moves only through the resolve API.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center md:min-w-[320px]">
              <Stat label="Queue" value={counts.total} tint={LAVENDER} />
              <Stat label="Creator" value={counts.canResolve} tint={MINT} />
              <Stat label="Participant" value={counts.waiting} tint={PEACH} />
            </div>
          </div>
        </section>

        {message && (
          <p className="mb-4 rounded-2xl border bg-white px-4 py-3 text-xs font-bold" style={{ color: /failed|could not|pick/i.test(message) ? ROSE_TEXT : MINT_TEXT, borderColor: NAVY_FAINT }}>
            {message}
          </p>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <motion.div
              className="mx-auto h-10 w-10 rounded-full border-[3px] border-t-transparent"
              style={{ borderColor: PEACH, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[24px] border border-dashed bg-white p-8 text-center" style={{ borderColor: NAVY_FAINT }}>
            <p className="text-sm font-bold" style={{ color: NAVY_DIM }}>No review items right now.</p>
            <Link href="/markets" className="mt-4 inline-block px-5 py-2 text-xs font-black" style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}>
              Back to manager
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {items.map((item, index) => {
              const style = statusStyle(item.status);
              const accepted = item.participants.filter((participant) => participant.status === "accepted");
              const winnerId = winnerByChallenge[item.challengeId] || firstAcceptedParticipant(item);
              const busy = busyId === item.challengeId;
              return (
                <motion.article
                  key={item.challengeId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.24) }}
                  className="rounded-[22px] border bg-white p-4 shadow-sm"
                  style={{ borderColor: NAVY_FAINT }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-base font-black" style={{ color: NAVY }}>{item.title}</h2>
                      <p className="mt-1 text-xs font-bold" style={{ color: NAVY_DIM }}>
                        {item.stake > 0 ? `${item.stake} ${item.stakeToken}` : "free"} / {item.participantCount} players / {item.evidenceCount} evidence
                      </p>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 text-[10px] font-black uppercase" style={{ color: style.text, background: style.bg, borderRadius: "9999px" }}>
                      {style.label}
                    </span>
                  </div>

                  <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: NAVY_FAINT, background: "#F8FAFC" }}>
                    <div className="flex items-center justify-between gap-3 text-[11px] font-bold" style={{ color: NAVY_DIM }}>
                      <span>Updated {formatWhen(item.updatedAt)}</span>
                      {item.latestJudgment?.confidence != null && <span>{Math.round(item.latestJudgment.confidence * 100)}%</span>}
                    </div>
                    {item.latestJudgment && (
                      <p className="mt-1 truncate text-xs font-bold" style={{ color: NAVY }}>
                        Latest: {item.latestJudgment.winnerName ?? "No winner"} / {item.latestJudgment.aiModel ?? item.latestJudgment.method}
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {accepted.map((participant) => (
                      <button
                        type="button"
                        key={participant.userId}
                        onClick={() => setWinnerByChallenge((prev) => ({ ...prev, [item.challengeId]: participant.userId }))}
                        className="px-3 py-1.5 text-[11px] font-black active:scale-95"
                        style={{
                          color: winnerId === participant.userId ? MINT_TEXT : NAVY_DIM,
                          background: winnerId === participant.userId ? MINT : "#FFFFFF",
                          border: `1px solid ${winnerId === participant.userId ? "#6EE7B7" : NAVY_FAINT}`,
                          borderRadius: "9999px",
                        }}
                      >
                        {participant.username}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={reasonByChallenge[item.challengeId] ?? ""}
                    onChange={(event) => setReasonByChallenge((prev) => ({ ...prev, [item.challengeId]: event.target.value }))}
                    rows={2}
                    placeholder="Resolution note"
                    className="mt-3 w-full resize-none rounded-2xl border bg-white px-3 py-2 text-xs font-semibold outline-none"
                    style={{ color: NAVY, borderColor: NAVY_FAINT }}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link href={`/challenge/${item.challengeId}`} className="flex-1 px-4 py-2 text-center text-xs font-black" style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
                      Room
                    </Link>
                    {item.canResolve ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resolveItem(item, "winner")}
                          className="px-4 py-2 text-xs font-black active:scale-95 disabled:opacity-50"
                          style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}
                        >
                          Settle
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void resolveItem(item, "refund")}
                          className="px-4 py-2 text-xs font-black active:scale-95 disabled:opacity-50"
                          style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}
                        >
                          Refund
                        </button>
                        {item.stake <= 0 && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void resolveItem(item, "void")}
                            className="px-4 py-2 text-xs font-black active:scale-95 disabled:opacity-50"
                            style={{ color: ROSE_TEXT, background: ROSE_BG, borderRadius: "9999px" }}
                          >
                            Void
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="px-3 py-2 text-[10px] font-black" style={{ color: NAVY_DIM, background: NAVY_FAINT, borderRadius: "9999px" }}>
                        Waiting creator
                      </span>
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

function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <div className="rounded-2xl border bg-white p-3" style={{ borderColor: NAVY_FAINT }}>
      <p className="text-[10px] font-black uppercase" style={{ color: NAVY_DIM }}>{label}</p>
      <p className="mt-1 text-xl font-black" style={{ color: NAVY }}>{value}</p>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: tint }} />
    </div>
  );
}
