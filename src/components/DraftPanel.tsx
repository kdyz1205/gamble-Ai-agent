"use client";

export interface ChallengeDraft {
  title: string;
  playerA: string;
  playerB: string | null;
  type: string;
  stake: string;
  currency: "USD" | "points" | "none";
  deadline: string;
  rules: string;
  evidence: string;
  aiReview: boolean;
  isPublic: boolean;
}

interface DraftPanelProps {
  draft: ChallengeDraft;
  onPublish: () => void;
  onEdit: () => void;
}

export default function DraftPanel({ draft, onPublish, onEdit }: DraftPanelProps) {
  return (
    <div className="animate-slide-up">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-success/10 flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-text-primary">Challenge Draft Ready</span>
      </div>

      {/* Draft Card */}
      <div className="bg-white rounded-2xl border border-border-subtle shadow-sm overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-accent via-teal to-accent animate-gradient" />

        <div className="p-5">
          {/* Title & Type */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-accent-light text-accent mb-2">
                {draft.type}
              </span>
              <h3 className="text-lg font-bold text-text-primary leading-tight">
                {draft.title}
              </h3>
            </div>
            <div className={`px-3 py-1 rounded-lg text-xs font-bold ${
              draft.currency === "none"
                ? "bg-teal-light text-teal"
                : "bg-gold-light text-amber-700"
            }`}>
              {draft.currency === "none" ? "Free" : draft.stake}
            </div>
          </div>

          {/* Players */}
          <div className="flex items-center gap-3 mb-5">
            {/* Player A */}
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                <span className="text-xs font-bold text-white">
                  {draft.playerA.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{draft.playerA}</p>
                <p className="text-[10px] text-text-tertiary">Challenger</p>
              </div>
            </div>

            {/* VS */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-bg-input flex items-center justify-center">
              <span className="text-[10px] font-bold text-text-tertiary">VS</span>
            </div>

            {/* Player B */}
            <div className="flex items-center gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${
                draft.playerB
                  ? "bg-gradient-to-br from-rose-500 to-pink-600"
                  : "bg-bg-input border-2 border-dashed border-border-subtle"
              }`}>
                {draft.playerB ? (
                  <span className="text-xs font-bold text-white">
                    {draft.playerB.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <span className="text-xs text-text-tertiary">?</span>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {draft.playerB || "Open Spot"}
                </p>
                <p className="text-[10px] text-text-tertiary">
                  {draft.playerB ? "Opponent" : "Anyone can join"}
                </p>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <InfoItem icon="⏰" label="Deadline" value={draft.deadline} />
            <InfoItem icon="📋" label="Rules" value={draft.rules} />
            <InfoItem icon="📸" label="Evidence" value={draft.evidence} />
            <InfoItem
              icon="🤖"
              label="Judgment"
              value={draft.aiReview ? "AI Review" : "Manual"}
            />
          </div>

          {/* Visibility */}
          <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl bg-bg-input">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse-dot" />
            <span className="text-xs font-medium text-text-secondary">
              {draft.isPublic
                ? "Public — anyone can view and bet on this challenge"
                : "Private — only invited participants can see this"}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onPublish}
              className="flex-1 py-3 rounded-xl bg-accent text-white text-sm font-bold shadow-lg shadow-accent/25 hover:bg-accent-dark hover:shadow-xl hover:shadow-accent/30 transition-all duration-300 active:scale-[0.98]"
            >
              Publish Challenge
            </button>
            <button
              onClick={onEdit}
              className="px-4 py-3 rounded-xl border border-border-subtle text-sm font-semibold text-text-secondary hover:bg-bg-hover transition-all duration-300"
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="px-3 py-2.5 rounded-xl bg-bg-input/70">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-xs">{icon}</span>
        <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-semibold text-text-primary truncate">{value}</p>
    </div>
  );
}
