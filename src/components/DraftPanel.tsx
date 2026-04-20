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

// LuckyPlay canonical palette — see project_luckyplay_design_system memory
const NAVY = "#1E293B";        // slate-800
const NAVY_DIM = "#64748B";    // slate-500
const NAVY_FAINT = "#E2E8F0";  // slate-200
const PEACH = "#FED7AA";       // orange-200 — CTA
const PEACH_DARK = "#FDBA74";  // orange-300 — hover
const PEACH_TEXT = "#7C2D12";  // orange-900
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";        // mint-200
const LAVENDER = "#E9D5FF";    // purple-200
// const PINK = "#FFD1DC"; // reserved for future cotton candy decorations
const CREAM = "#FFEDD5";       // orange-100

export default function DraftPanel({ draft, onPublish }: Props) {
  const [d, setD] = useState<ChallengeDraft>(draft);
  useEffect(() => setD(draft), [draft]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="lp-glass"
      style={{
        borderRadius: "28px",
        boxShadow: `0 8px 30px rgba(15,23,42,0.04)`,
        overflow: "hidden",
      }}
    >
      {/* Top sticker tab */}
      <div
        className="px-5 py-2.5 flex items-center justify-between"
        style={{ background: `linear-gradient(90deg, ${PEACH}1A, ${MINT}1A, ${LAVENDER}1A)`, borderBottom: `1px solid ${NAVY_FAINT}` }}
      >
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: NAVY_DIM }}>📝 Your market</span>
        <span className="text-xs font-bold px-2.5 py-0.5" style={{ background: "#FFFFFF", color: PEACH_DARK, borderRadius: "999px" }}>
          {d.isPublic ? "🌍 Public" : "🔒 Private"}
        </span>
      </div>

      <div className="p-5">
        {/* Title — editable */}
        <input
          type="text"
          value={d.title}
          onChange={e => setD(prev => ({ ...prev, title: e.target.value }))}
          maxLength={64}
          className="w-full text-xl font-extrabold bg-transparent border-b-2 border-transparent focus:outline-none transition-colors mb-5 pb-1"
          style={{ color: NAVY, borderBottomColor: "transparent" }}
          onFocus={e => (e.currentTarget.style.borderBottomColor = PEACH)}
          onBlur={e => (e.currentTarget.style.borderBottomColor = "transparent")}
        />

        {/* Key fields — colorful sticker grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <Field
            label="Stake"
            value={d.stake > 0 ? `${d.stake} cr` : "Free"}
            tint={d.stake > 0 ? PEACH : MINT}
            emoji="💰"
          />
          <Field label="Deadline" value={d.deadline} tint={LAVENDER} emoji="⏰" />
          <Field label="Evidence" value={d.evidence} tint={MINT} emoji="📸" />
          <Field label="Type" value={d.type} tint={PEACH} emoji="🏷️" />
        </div>

        {/* Rules (if any) */}
        {d.rules && (
          <div
            className="mb-5 px-4 py-3"
            style={{ background: CREAM, border: `1px solid #FFE0CC`, borderRadius: "16px" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: PEACH_DARK }}>📖 Rules</p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: NAVY }}>{d.rules}</p>
          </div>
        )}

        {/* Publish button — fat sticker pill */}
        <motion.button
          onClick={() => onPublish(d)}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.96 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="w-full py-4 text-base font-extrabold"
          style={{
            background: PEACH,
            color: PEACH_TEXT,
            borderRadius: "9999px",
            boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
            letterSpacing: "0.02em",
          }}
        >
          🚀 Publish &amp; Get Link
        </motion.button>
      </div>
    </motion.div>
  );
}

function Field({ label, value, tint, emoji }: { label: string; value: string; tint: string; emoji: string }) {
  return (
    <div
      className="px-3 py-3"
      style={{
        background: `${tint}14`,
        border: `1px solid ${tint}33`,
        borderRadius: "16px",
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: NAVY_DIM }}>
        <span>{emoji}</span>
        <span>{label}</span>
      </p>
      <p className="text-sm font-bold" style={{ color: NAVY }}>{value}</p>
    </div>
  );
}
