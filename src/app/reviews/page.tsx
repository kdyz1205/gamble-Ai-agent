"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ReviewQueueItem } from "@/lib/api-client";

const COLORS = {
  navy: "#1E293B",
  muted: "#64748B",
  border: "#E2E8F0",
  peach: "#FED7AA",
  peachText: "#7C2D12",
  mint: "#A7F3D0",
  mintText: "#065F46",
  rose: "#FECACA",
  roseText: "#991B1B",
};

export default function ReviewQueuePage() {
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [winnerIds, setWinnerIds] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api.getReviewQueue("pending");
      setReviews(result.reviews);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve(item: ReviewQueueItem, resolution: "uphold" | "override" | "refund") {
    const reviewerNotes = notes[item.id]?.trim() ?? "";
    if (reviewerNotes.length < 10) {
      setError("Write at least 10 characters of reviewer reasoning before deciding.");
      return;
    }
    const winnerId = resolution === "override" ? winnerIds[item.id] : undefined;
    if (resolution === "override" && !winnerId) {
      setError("Choose an accepted player for the override.");
      return;
    }
    setBusyId(item.id);
    setError("");
    try {
      await api.resolveReview(item.id, { resolution, winnerId, notes: reviewerNotes });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not resolve review");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "#FFF7ED" }}>
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: COLORS.peachText }}>Reviewer portal</p>
            <h1 className="mt-1 text-2xl font-extrabold" style={{ color: COLORS.navy }}>Proof review queue</h1>
          </div>
          <Link href="/" className="rounded-full bg-white px-4 py-2 text-xs font-bold" style={{ color: COLORS.navy, border: `1px solid ${COLORS.border}` }}>
            Back to quests
          </Link>
        </header>

        {error && <p role="alert" className="rounded-2xl p-4 text-sm font-bold" style={{ background: COLORS.rose, color: COLORS.roseText }}>{error}</p>}
        {loading && <p className="text-sm font-bold" style={{ color: COLORS.muted }}>Loading real proof and verdict records…</p>}
        {!loading && !error && reviews.length === 0 && (
          <p className="rounded-3xl bg-white p-8 text-center text-sm font-bold" style={{ color: COLORS.muted, border: `1px solid ${COLORS.border}` }}>
            No pending reviews.
          </p>
        )}

        {reviews.map((item) => {
          const original = item.challenge.judgments?.find((judgment) => judgment.id === (item as ReviewQueueItem & { originalJudgmentId?: string }).originalJudgmentId)
            ?? item.challenge.judgments?.find((judgment) => judgment.method === "ai")
            ?? item.challenge.judgments?.[0];
          const participants = item.challenge.participants.filter((participant) => participant.status === "accepted");
          return (
            <article key={item.id} className="space-y-4 rounded-3xl bg-white p-5" style={{ border: `1px solid ${COLORS.border}`, boxShadow: "0 12px 35px rgba(15,23,42,.06)" }} data-testid="review-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-extrabold" style={{ color: COLORS.navy }}>{item.challenge.title}</p>
                  <Link href={`/market/${item.challenge.id}`} className="text-xs font-bold underline" style={{ color: COLORS.peachText }}>Open quest record</Link>
                </div>
                <span className="rounded-full px-3 py-1 text-[11px] font-black uppercase" style={{ background: COLORS.rose, color: COLORS.roseText }}>
                  {item.status} · due {new Date(item.expiresAt).toLocaleString()}
                </span>
              </div>

              <section className="rounded-2xl p-4" style={{ background: "#FFF7ED" }}>
                <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: COLORS.peachText }}>Why review was opened</p>
                <p className="mt-1 whitespace-pre-wrap text-sm font-semibold" style={{ color: COLORS.navy }}>{item.reason}</p>
              </section>

              <section>
                <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: COLORS.muted }}>Submitted proof</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(item.challenge.evidence ?? []).map((proof) => (
                    <div key={proof.id} className="rounded-2xl p-3 text-sm" style={{ border: `1px solid ${COLORS.border}` }}>
                      <p className="font-extrabold" style={{ color: COLORS.navy }}>{proof.user?.username ?? proof.userId}</p>
                      <p className="mt-1 whitespace-pre-wrap font-medium" style={{ color: COLORS.muted }}>{proof.description || `${proof.type} proof`}</p>
                      {proof.url && <a href={proof.url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs font-bold underline" style={{ color: COLORS.peachText }}>Open proof asset</a>}
                    </div>
                  ))}
                  {!item.challenge.evidence?.length && <p className="text-sm font-bold" style={{ color: COLORS.roseText }}>No proof records are attached.</p>}
                </div>
              </section>

              {original && (
                <section className="rounded-2xl p-4" style={{ background: "#F3E8FF" }}>
                  <p className="text-[11px] font-black uppercase tracking-wide" style={{ color: "#6B21A8" }}>Original Familiar recommendation</p>
                  <p className="mt-1 text-sm font-extrabold" style={{ color: COLORS.navy }}>
                    {original.winner?.username ?? "Tie / refund"} · {Math.round((original.confidence ?? 0) * 100)}% confidence
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm font-medium" style={{ color: COLORS.muted }}>{original.reasoning}</p>
                </section>
              )}

              <label className="block text-xs font-extrabold" style={{ color: COLORS.navy }}>
                Reviewer reasoning
                <textarea
                  rows={4}
                  value={notes[item.id] ?? ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                  className="mt-2 w-full resize-none rounded-2xl border p-3 text-sm font-medium outline-none"
                  style={{ borderColor: COLORS.border, color: COLORS.navy }}
                  placeholder="Explain which proof and rule determine this decision…"
                />
              </label>

              <div className="grid gap-2 sm:grid-cols-3">
                <button type="button" disabled={busyId === item.id} onClick={() => void resolve(item, "uphold")} className="rounded-full py-3 text-xs font-extrabold disabled:opacity-50" style={{ background: COLORS.mint, color: COLORS.mintText }}>
                  Uphold Familiar
                </button>
                <div className="flex gap-1">
                  <select
                    aria-label="Override winner"
                    value={winnerIds[item.id] ?? ""}
                    onChange={(event) => setWinnerIds((current) => ({ ...current, [item.id]: event.target.value }))}
                    className="min-w-0 flex-1 rounded-full border px-2 text-xs font-bold"
                    style={{ borderColor: COLORS.border, color: COLORS.navy }}
                  >
                    <option value="">Winner…</option>
                    {participants.map((participant) => <option key={participant.user.id} value={participant.user.id}>{participant.user.username}</option>)}
                  </select>
                  <button type="button" disabled={busyId === item.id} onClick={() => void resolve(item, "override")} className="rounded-full px-3 text-xs font-extrabold text-white disabled:opacity-50" style={{ background: "#6B21A8" }}>
                    Override
                  </button>
                </div>
                <button type="button" disabled={busyId === item.id} onClick={() => void resolve(item, "refund")} className="rounded-full py-3 text-xs font-extrabold disabled:opacity-50" style={{ background: COLORS.rose, color: COLORS.roseText }}>
                  Refund everyone
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
