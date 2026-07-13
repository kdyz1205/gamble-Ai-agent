"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

export default function VerdictReviewControls({
  challenge,
  userId,
  onUpdated,
}: {
  challenge: ChallengeData;
  userId: string;
  onUpdated: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState<"accept" | "review" | null>(null);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const acceptedParticipants = useMemo(
    () => challenge.participants.filter((participant) => participant.status === "accepted"),
    [challenge.participants],
  );
  const isParticipant = acceptedParticipants.some((participant) => participant.user.id === userId);
  const myResponse = challenge.verdictResponses?.find((response) => response.userId === userId);
  const acceptedCount = challenge.verdictResponses?.filter((response) => response.decision === "accepted").length ?? 0;
  const activeReview = challenge.reviewCase && ["pending", "processing"].includes(challenge.reviewCase.status);

  if (challenge.status !== "disputed" || !challenge.judgments?.length) return null;

  async function respond(decision: "accepted" | "review_requested") {
    setError("");
    setNotice("");
    if (decision === "review_requested" && reason.trim().length < 10) {
      setError("Please explain the review request in at least 10 characters.");
      return;
    }
    setBusy(decision === "accepted" ? "accept" : "review");
    try {
      const result = await api.respondToVerdict(
        challenge.id,
        decision,
        decision === "review_requested" ? reason.trim() : undefined,
      );
      setNotice(
        result.settled
          ? "Result accepted by every player. Credits are settled."
          : decision === "review_requested"
            ? "Review requested. Settlement is frozen until a reviewer decides."
            : "Your acceptance is recorded. Waiting for the other player.",
      );
      setShowReason(false);
      await onUpdated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not record your response");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="space-y-3 p-4"
      style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "20px" }}
      data-testid="verdict-review-controls"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold" style={{ color: "#1E293B" }}>Player decision required</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed" style={{ color: "#64748B" }}>
            {activeReview
              ? "A reviewer is checking the proof. Credits remain frozen."
              : `${acceptedCount} of ${acceptedParticipants.length} players accepted the Familiar result.`}
          </p>
        </div>
        {myResponse && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase" style={{ background: "#FFFFFF", color: "#7C2D12" }}>
            {myResponse.decision === "accepted" ? "Accepted" : "Review asked"}
          </span>
        )}
      </div>

      {challenge.reviewCase && (
        <p className="text-xs font-bold" style={{ color: "#991B1B" }} data-testid="review-case-status">
          Review {challenge.reviewCase.status}
          {activeReview ? ` · decision due ${new Date(challenge.reviewCase.expiresAt).toLocaleString()}` : ""}
        </p>
      )}

      {isParticipant && !activeReview && (
        <div className="grid grid-cols-2 gap-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={busy !== null}
            onClick={() => void respond("accepted")}
            className="rounded-full px-3 py-3 text-xs font-extrabold disabled:opacity-50"
            style={{ background: "#A7F3D0", color: "#065F46" }}
          >
            {busy === "accept" ? "Recording…" : "Accept result"}
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            disabled={busy !== null}
            onClick={() => setShowReason((open) => !open)}
            className="rounded-full px-3 py-3 text-xs font-extrabold disabled:opacity-50"
            style={{ background: "#FECACA", color: "#991B1B" }}
          >
            Request review
          </motion.button>
        </div>
      )}

      {isParticipant && showReason && !activeReview && (
        <div className="space-y-2">
          <label className="block text-xs font-bold" htmlFor={`review-reason-${challenge.id}`} style={{ color: "#1E293B" }}>
            What should the reviewer re-check?
          </label>
          <textarea
            id={`review-reason-${challenge.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            className="w-full resize-none rounded-2xl border bg-white p-3 text-sm outline-none"
            style={{ borderColor: "#FED7AA", color: "#1E293B" }}
            placeholder="The Familiar missed this proof because…"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void respond("review_requested")}
            className="w-full rounded-full px-3 py-3 text-xs font-extrabold text-white disabled:opacity-50"
            style={{ background: "#991B1B" }}
          >
            {busy === "review" ? "Opening review…" : "Freeze settlement and open review"}
          </button>
        </div>
      )}

      {!isParticipant && (
        <p className="text-xs font-semibold" style={{ color: "#64748B" }}>Only accepted players can accept or challenge this result.</p>
      )}
      {notice && <p className="text-xs font-bold" style={{ color: "#065F46" }} role="status">{notice}</p>}
      {error && <p className="text-xs font-bold" style={{ color: "#991B1B" }} role="alert">{error}</p>}
    </div>
  );
}
