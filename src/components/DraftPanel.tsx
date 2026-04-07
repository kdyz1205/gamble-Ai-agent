"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

export interface ChallengeDraft {
  title: string;
  playerA: string;
  playerB: string | null;
  type: string;
  stake: number;
  deadline: string;
  durationMinutes: number;
  rules: string;
  evidence: string;
  aiReview: boolean;
  isPublic: boolean;
}

interface Props {
  draft: ChallengeDraft;
  onPublish: (editedDraft: ChallengeDraft) => void;
  onEdit: () => void;
}

export default function DraftPanel({ draft, onPublish }: Props) {
  const [d, setD] = useState<ChallengeDraft>(draft);
  useEffect(() => setD(draft), [draft]);

  return (
    <div
      style={{
        background: "#111110",
        border: "1px solid rgba(212,175,55,0.12)",
        borderRadius: "2px",
      }}
    >
      {/* Top accent */}
      <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.3), transparent)" }} />

      <div className="p-5">
        {/* Title — editable */}
        <input
          type="text"
          value={d.title}
          onChange={e => setD(prev => ({ ...prev, title: e.target.value }))}
          maxLength={64}
          className="w-full text-lg font-serif font-bold bg-transparent border-b border-transparent focus:border-[#D4AF37]/30 focus:outline-none transition-colors mb-5"
          style={{ color: "#E5E0D8" }}
        />

        {/* Key fields — minimal grid */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <Field label="Stake" value={d.stake > 0 ? `${d.stake} credits` : "Free"} color={d.stake > 0 ? "#D4AF37" : "#8b8b83"} />
          <Field label="Deadline" value={d.deadline} />
          <Field label="Evidence" value={d.evidence} />
          <Field label="Type" value={d.type} />
        </div>

        {/* Rules (if any) */}
        {d.rules && (
          <div className="mb-5 px-3 py-2" style={{ borderLeft: "2px solid rgba(212,175,55,0.15)", background: "rgba(212,175,55,0.02)" }}>
            <p className="text-[10px] font-mono" style={{ color: "#8b8b83" }}>{d.rules}</p>
          </div>
        )}

        {/* Publish button */}
        <motion.button
          onClick={() => onPublish(d)}
          whileHover={{ y: -1, boxShadow: "0 6px 24px rgba(212,175,55,0.2)" }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3.5 text-sm font-mono font-bold uppercase tracking-[0.15em]"
          style={{
            background: "linear-gradient(135deg, #D4AF37, #A38829)",
            color: "#0A0A0B",
            borderRadius: "2px",
            boxShadow: "0 4px 16px rgba(212,175,55,0.15)",
          }}
        >
          Publish &amp; Get Link
        </motion.button>
      </div>
    </div>
  );
}

function Field({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-3 py-2.5" style={{ background: "rgba(212,175,55,0.03)", border: "1px solid rgba(212,175,55,0.06)", borderRadius: "1px" }}>
      <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>{label}</p>
      <p className="text-sm font-mono font-bold" style={{ color: color || "#E5E0D8" }}>{value}</p>
    </div>
  );
}
