"use client";

import { useState } from "react";

export default function EventScorePanel({ eventId, disabled }: { eventId: string; disabled: boolean }) {
  const [score, setScore] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const numericScore = Number(score);
    if (!Number.isFinite(numericScore)) {
      setStatus("Enter a numeric score.");
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/events/${eventId}/submissions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: numericScore }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submission failed");
      await fetch(`/api/events/${eventId}/leaderboard/recompute`, { method: "POST" }).catch(() => null);
      setStatus("Score submitted. Refresh to see the latest rank.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
      <h2 className="text-lg font-black" style={{ color: "#172033" }}>Submit score</h2>
      <div className="mt-4 flex gap-2">
        <input
          value={score}
          onChange={(event) => setScore(event.target.value)}
          disabled={disabled || busy}
          inputMode="decimal"
          placeholder="Score"
          className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm font-bold outline-none"
          style={{ borderColor: "#CBD5E1", color: "#172033" }}
        />
        <button
          type="button"
          disabled={disabled || busy}
          onClick={submit}
          className="rounded-xl px-4 py-2 text-sm font-black disabled:opacity-50"
          style={{ background: "#10B981", color: "white" }}
        >
          {busy ? "..." : "Submit"}
        </button>
      </div>
      {disabled ? (
        <p className="mt-3 text-xs font-semibold" style={{ color: "#64748B" }}>This event is not accepting submissions.</p>
      ) : null}
      {status ? (
        <p className="mt-3 text-xs font-bold" style={{ color: status.includes("submitted") ? "#047857" : "#B91C1C" }}>{status}</p>
      ) : null}
    </div>
  );
}
