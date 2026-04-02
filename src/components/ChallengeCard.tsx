"use client";

import { motion } from "framer-motion";
import type { ChallengeData } from "@/lib/api-client";

export interface Challenge {
  id: string;
  title: string;
  playerA: { name: string; avatar: string };
  playerB: { name: string; avatar: string } | null;
  type: string;
  stake: number; // credits
  deadline: string;
  evidence: string;
  status: "open" | "live" | "judging" | "completed";
  participants: number;
  aiReview: boolean;
}

export function mapChallengeDataToChallenge(c: ChallengeData): Challenge {
  const opponent = c.participants.find((p) => p.role === "opponent");
  let status: Challenge["status"] = "open";
  if (c.status === "settled" || c.status === "cancelled") status = "completed";
  else if (c.status === "judging") status = "judging";
  else if (c.status === "live" || c.status === "matched") status = "live";

  const deadlineStr = c.deadline
    ? new Date(c.deadline).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "—";

  return {
    id: c.id,
    title: c.title,
    playerA: {
      name: `@${c.creator.username}`,
      avatar: c.creator.image || "🥊",
    },
    playerB: opponent
      ? { name: `@${opponent.user.username}`, avatar: opponent.user.image || "🥊" }
      : null,
    type: c.type,
    stake: c.stake,
    deadline: deadlineStr,
    evidence: c.evidenceType.replace(/_/g, " "),
    status,
    participants: c.participants.length,
    aiReview: c.aiReview,
  };
}

function StatusBadge({ status }: { status: Challenge["status"] }) {
  const config = {
    open: { label: "Open", className: "bg-accent-light text-accent" },
    live: {
      label: "Live",
      className: "bg-danger-light text-danger animate-pulse-soft",
    },
    judging: { label: "AI Judging", className: "bg-gold-light text-gold" },
    completed: { label: "Settled", className: "bg-success-light text-success" },
  };
  const { label, className } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}
    >
      {status === "live" && (
        <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
      )}
      {label}
    </span>
  );
}

export default function ChallengeCard({
  challenge,
  tone = "light",
  onAcceptChallenge,
  acceptChallengePending = false,
}: {
  challenge: Challenge;
  tone?: "light" | "dark";
  onAcceptChallenge?: () => void | Promise<void>;
  acceptChallengePending?: boolean;
}) {
  const isDark = tone === "dark";
  return (
    <div
      className={`group rounded-2xl border p-5 transition-all duration-300 animate-float-up ${
        isDark
          ? "hover:shadow-lg"
          : "bg-white border-border-subtle hover:shadow-lg hover:-translate-y-0.5"
      }`}
      style={
        isDark
          ? {
              background: "rgba(255,255,255,0.04)",
              borderColor: "rgba(255,255,255,0.08)",
            }
          : undefined
      }
    >
      {/* Top row: type + status */}
      <div className="flex items-center justify-between mb-3">
        <span
          className={`text-xs font-medium uppercase tracking-wider ${isDark ? "text-text-muted" : "text-text-tertiary"}`}
        >
          {challenge.type}
        </span>
        <StatusBadge status={challenge.status} />
      </div>

      {/* Title */}
      <h3 className="text-base font-bold text-text-primary mb-4 leading-snug">
        {challenge.title}
      </h3>

      {/* Players */}
      <div className="flex items-center justify-between mb-4">
        {/* Player A */}
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-dark flex items-center justify-center text-xs font-bold text-white">
            {challenge.playerA.avatar}
          </div>
          <span className="text-sm font-medium text-text-primary">
            {challenge.playerA.name}
          </span>
        </div>

        {/* VS */}
        <div className="px-3 py-1 rounded-lg bg-bg-input text-xs font-bold text-text-tertiary">
          VS
        </div>

        {/* Player B */}
        {challenge.playerB ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-text-primary">
              {challenge.playerB.name}
            </span>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal to-teal/70 flex items-center justify-center text-xs font-bold text-white">
              {challenge.playerB.avatar}
            </div>
          </div>
        ) : (
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-light text-accent text-xs font-semibold hover:bg-accent/20 transition-colors">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Join
          </button>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-input">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-gold"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          <span className="text-xs font-medium text-text-secondary">
            {challenge.deadline}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-input">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-success"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-xs font-semibold text-text-primary">
            {challenge.stake > 0 ? `${challenge.stake} credits` : "Free"}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-input">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          >
            <path d="M15 10l4.553-2.276A1 1 0 0 1 21 8.618v6.764a1 1 0 0 1-1.447.894L15 14" />
            <rect x="1" y="6" width="14" height="12" rx="2" ry="2" />
          </svg>
          <span className="text-xs font-medium text-text-secondary">
            {challenge.evidence}
          </span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-input">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-teal"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="text-xs font-medium text-text-secondary">
            {challenge.participants} joined
          </span>
        </div>
      </div>

      {/* AI review badge */}
      {challenge.aiReview && (
        <div className="flex items-center gap-1.5 mb-4 px-3 py-1.5 rounded-lg bg-gradient-to-r from-accent/5 to-teal/5 border border-accent/10">
          <div className="w-4 h-4 rounded-md bg-gradient-to-br from-accent to-teal flex items-center justify-center">
            <svg
              width="8"
              height="8"
              viewBox="0 0 24 24"
              fill="white"
              stroke="none"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-accent">
            AI Review Enabled
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        {challenge.status === "open" && !challenge.playerB && (
          <button
            type="button"
            onClick={() => void onAcceptChallenge?.()}
            disabled={!onAcceptChallenge || acceptChallengePending}
            className="flex-1 py-2.5 text-sm font-semibold text-white bg-accent rounded-xl hover:bg-accent-dark transition-colors shadow-sm hover:shadow-md disabled:opacity-45 disabled:pointer-events-none"
          >
            {acceptChallengePending ? "Accepting…" : "Accept Challenge"}
          </button>
        )}
        {challenge.status === "live" && (
          <button className="flex-1 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-danger to-danger/80 rounded-xl hover:opacity-90 transition-opacity shadow-sm">
            Watch Live
          </button>
        )}
        {(challenge.status === "open" || challenge.status === "live") && (
          <>
            <button className="flex-1 py-2.5 text-sm font-semibold text-accent bg-accent-light rounded-xl hover:bg-accent/20 transition-colors">
              Bet on {challenge.playerA.name.split(" ")[0]}
            </button>
            {challenge.playerB && (
              <button className="flex-1 py-2.5 text-sm font-semibold text-teal bg-teal-light rounded-xl hover:bg-teal/20 transition-colors">
                Bet on {challenge.playerB.name.split(" ")[0]}
              </button>
            )}
          </>
        )}
        {challenge.status === "completed" && (
          <button className="flex-1 py-2.5 text-sm font-semibold text-text-secondary bg-bg-input rounded-xl hover:bg-bg-hover transition-colors">
            View Results
          </button>
        )}
      </div>
    </div>
  );
}

/** Real API row + optional Accept → versus handoff (shared layoutId for motion). */
export function LiveChallengeCard({
  apiChallenge,
  currentUserId,
  onAcceptVersus,
  accepting,
}: {
  apiChallenge: ChallengeData;
  currentUserId?: string;
  onAcceptVersus: (id: string) => void | Promise<void>;
  accepting: boolean;
}) {
  const ch = mapChallengeDataToChallenge(apiChallenge);
  const joinable =
    apiChallenge.status === "open" &&
    apiChallenge.participants.length < (apiChallenge.maxParticipants ?? 2) &&
    apiChallenge.creatorId !== currentUserId;
  return (
    <motion.div layout layoutId={`challenge-card-${apiChallenge.id}`} className="mb-3">
      <ChallengeCard
        challenge={ch}
        tone="dark"
        onAcceptChallenge={joinable ? () => void onAcceptVersus(apiChallenge.id) : undefined}
        acceptChallengePending={accepting}
      />
    </motion.div>
  );
}
