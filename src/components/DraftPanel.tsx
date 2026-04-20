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

const NAVY = "#1F3A5F";
const NAVY_DIM = "rgba(31,58,95,0.55)";
const NAVY_FAINT = "rgba(31,58,95,0.10)";
const PEACH = "#FF9966";
const PEACH_DARK = "#F07A4F";
const MINT = "#5FC9B4";
const LAVENDER = "#B8A6E0";
const CREAM = "#FFF8E7";

export default function DraftPanel({ draft, onPublish }: Props) {
  const [d, setD] = useState<ChallengeDraft>(draft);
  useEffect(() => setD(draft), [draft]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "#FFFFFF",
        border: `2px solid ${NAVY_FAINT}`,
        borderRadius: "24px",
        boxShadow: `0 6px 0 ${NAVY}0F, 0 16px 32px ${NAVY}0A`,
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
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.96, y: 1 }}
          className="w-full py-4 text-base font-extrabold transition-all"
          style={{
            background: `linear-gradient(135deg, ${PEACH} 0%, ${PEACH_DARK} 100%)`,
            color: "#FFFFFF",
            borderRadius: "999px",
            boxShadow: `0 5px 0 ${PEACH_DARK}, 0 10px 24px ${PEACH}66`,
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
