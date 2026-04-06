"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Variants } from "framer-motion";

export interface ChallengeDraft {
  title: string;
  playerA: string;
  playerB: string | null;
  type: string;
  stake: number; // credits
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
  isPublishing?: boolean;
}

const TYPE_COLORS: Record<string, { from: string; to: string; glow: string }> = {
  Fitness:  { from: "#D4AF37", to: "#A38829", glow: "rgba(212,175,55,0.4)" },
  Cooking:  { from: "#C49A2A", to: "#A38829", glow: "rgba(196,154,42,0.4)" },
  Learning: { from: "#005F6F", to: "#004955", glow: "rgba(0,95,111,0.4)" },
  Coding:   { from: "#005F6F", to: "#D4AF37", glow: "rgba(0,95,111,0.4)" },
  Games:    { from: "#D4AF37", to: "#005F6F", glow: "rgba(212,175,55,0.4)" },
  General:  { from: "#D4AF37", to: "#005F6F", glow: "rgba(212,175,55,0.4)" },
};

const INFO_ICONS: Record<string, React.ReactNode> = {
  Deadline: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  Rules: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Evidence: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Judgment: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 3l1.5 3.5L17 8l-2.5 2.5L15 14l-3-1.5L9 14l.5-3.5L7 8l3.5-1.5z" />
    </svg>
  ),
};

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <motion.div
      className="relative flex flex-col gap-1.5 px-3.5 py-3 rounded-xl overflow-hidden"
      style={{
        background: "rgba(212,175,55,0.03)",
        border: "1px solid rgba(212,175,55,0.1)",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), inset 0 -1px 2px rgba(212,175,55,0.05)",
      }}
      whileHover={{
        y: -2,
        background: "rgba(212,175,55,0.07)",
        borderColor: "rgba(212,175,55,0.2)",
        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4), 0 4px 16px rgba(212,175,55,0.08), 0 2px 8px rgba(0,0,0,0.2)",
      }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center gap-1.5" style={{ color: "#D4AF37" }}>
        {INFO_ICONS[label] || <span className="text-xs">{icon}</span>}
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] font-mono" style={{ color: "rgba(212,175,55,0.7)" }}>{label}</span>
      </div>
      <p className="text-sm font-bold truncate" style={{ color: "#E8DCC8" }}>{value}</p>
    </motion.div>
  );
}

export default function DraftPanel({ draft, onPublish, onEdit, isPublishing }: Props) {
  const [editDraft, setEditDraft] = useState<ChallengeDraft>(draft);
  useEffect(() => setEditDraft(draft), [draft]);

  const updateField = <K extends keyof ChallengeDraft>(key: K, value: ChallengeDraft[K]) => {
    setEditDraft(prev => ({ ...prev, [key]: value }));
  };

  const colors = TYPE_COLORS[editDraft.type] ?? TYPE_COLORS.General;
  const hasStake = editDraft.stake > 0;

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06 } },
  };
  const childVariants: Variants = {
    hidden:  { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="flex items-center gap-2.5 mb-4"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <motion.div
          className="w-5 h-5 rounded-md flex items-center justify-center"
          style={{ background: "rgba(212,175,55,0.15)" }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </motion.div>
        <span className="text-sm font-bold font-serif" style={{ color: "#D4AF37" }}>Sacred Contract Forged</span>
      </motion.div>

      <motion.div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(170deg, rgba(15,14,12,0.97) 0%, rgba(10,10,11,0.98) 100%)",
          boxShadow: `0 0 0 1px rgba(212,175,55,0.15), 0 0 0 2px rgba(212,175,55,0.05), 0 20px 60px rgba(0,0,0,0.6), 0 0 60px ${colors.glow.replace("0.4", "0.06")}`,
          backdropFilter: "blur(24px)",
        }}
        whileHover={{
          boxShadow: `0 0 0 1px rgba(212,175,55,0.25), 0 0 0 2px rgba(212,175,55,0.08), 0 24px 70px rgba(0,0,0,0.5), 0 0 80px ${colors.glow.replace("0.4", "0.12")}`,
        }}
      >
        {/* Gold laser-etched border top line */}
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, transparent, #D4AF37, #A38829, #D4AF37, transparent)`, backgroundSize: "200% 100%", animation: "gradient-drift 4s linear infinite" }} />

        <motion.div
          className="p-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="flex items-start justify-between mb-5" variants={childVariants}>
            <div className="flex-1 pr-4">
              <span
                className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] mb-2.5 font-mono"
                style={{
                  background: "rgba(212,175,55,0.1)",
                  border: "1px solid rgba(212,175,55,0.25)",
                  color: "#D4AF37",
                }}
              >
                {editDraft.type}
              </span>
              <div className="relative">
                <input
                  type="text"
                  value={editDraft.title}
                  onChange={e => updateField("title", e.target.value)}
                  maxLength={64}
                  className="peer text-lg font-extrabold leading-snug bg-transparent border-b border-transparent hover:border-[rgba(212,175,55,0.2)] focus:border-transparent focus:outline-none transition-colors w-full font-serif"
                  style={{ color: "#E8DCC8" }}
                />
                <div
                  className="absolute bottom-0 left-0 right-0 h-[2px] opacity-0 peer-focus:opacity-100 transition-opacity duration-300 rounded-full"
                  style={{ background: "linear-gradient(90deg, #D4AF37, #005F6F)" }}
                />
              </div>
            </div>

            <motion.div
              className="flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl"
              style={{
                background: hasStake ? "rgba(212,175,55,0.08)" : "rgba(0,95,111,0.08)",
                border: hasStake ? "1px solid rgba(212,175,55,0.2)" : "1px solid rgba(0,95,111,0.2)",
              }}
              whileHover={{ scale: 1.03 }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider font-mono"
                    style={{ color: hasStake ? "#D4AF37" : "#005F6F" }}>
                Stake
              </span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={editDraft.stake}
                  className="text-lg font-black block font-serif"
                  style={{ color: hasStake ? "#D4AF37" : "#005F6F" }}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                >
                  {hasStake ? `${editDraft.stake}` : "Free"}
                </motion.span>
              </AnimatePresence>
              {hasStake && (
                <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5 font-mono"
                      style={{ color: "rgba(212,175,55,0.6)" }}>
                  credits
                </span>
              )}
            </motion.div>
          </motion.div>

          <motion.div className="flex items-center gap-4 mb-5" variants={childVariants}>
            <PlayerCard name={editDraft.playerA} role="Challenger" gradient="from-[#D4AF37] to-[#A38829]" color="#D4AF37" />

            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <motion.div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(212,175,55,0.06)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  boxShadow: "0 0 16px rgba(212,175,55,0.1)",
                }}
                animate={{ boxShadow: ["0 0 12px rgba(212,175,55,0.08)", "0 0 20px rgba(212,175,55,0.18)", "0 0 12px rgba(212,175,55,0.08)"] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <span className="text-[9px] font-black font-serif" style={{ color: "#D4AF37" }}>VS</span>
              </motion.div>
              <div className="h-px w-10" style={{ background: "linear-gradient(to right, transparent, rgba(212,175,55,0.2), transparent)" }} />
            </div>

            <PlayerCard
              name={editDraft.playerB ?? "Open Slot"}
              role={editDraft.playerB ? "Opponent" : "Anyone can join"}
              gradient={editDraft.playerB ? "from-[#005F6F] to-[#004955]" : ""}
              color={editDraft.playerB ? "#005F6F" : undefined}
              open={!editDraft.playerB}
            />
          </motion.div>

          <motion.div className="grid grid-cols-2 gap-2.5 mb-5" variants={childVariants}>
            <InfoCell icon="" label="Deadline" value={draft.deadline} />
            <InfoCell icon="" label="Rules"    value={draft.rules} />
            <InfoCell icon="" label="Evidence" value={draft.evidence} />
            <InfoCell icon="" label="Judgment" value={draft.aiReview ? "AI Oracle" : "Manual"} />
          </motion.div>

          <motion.div
            className="flex items-center gap-2.5 mb-5 px-4 py-2.5 rounded-xl"
            style={{
              background: editDraft.isPublic ? "rgba(212,175,55,0.06)" : "rgba(0,95,111,0.06)",
              border: editDraft.isPublic ? "1px solid rgba(212,175,55,0.12)" : "1px solid rgba(0,95,111,0.12)",
            }}
            variants={childVariants}
          >
            <div className="relative w-2 h-2">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: editDraft.isPublic ? "#D4AF37" : "#005F6F" }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <span className="text-xs font-medium font-mono uppercase tracking-wider" style={{ color: "rgba(232,220,200,0.7)" }}>
              {draft.isPublic
                ? "TRIBUNAL DECREE \u2014 Public"
                : "TRIBUNAL DECREE \u2014 Private"}
            </span>
          </motion.div>

          <motion.div className="flex items-center gap-3" variants={childVariants}>
            <motion.button
              onClick={() => !isPublishing && onPublish(editDraft)}
              disabled={isPublishing}
              whileHover={isPublishing ? {} : { scale: 1.02, y: -1 }}
              whileTap={isPublishing ? {} : { scale: 0.97 }}
              className="flex-1 py-3.5 rounded-xl text-sm font-extrabold text-white relative overflow-hidden flex items-center justify-center gap-2 font-serif"
              style={{
                background: "linear-gradient(135deg, #D4AF37, #A38829, #D4AF37)",
                backgroundSize: "200% 100%",
                boxShadow: "0 4px 24px rgba(212,175,55,0.3), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -2px 4px rgba(0,0,0,0.3)",
                opacity: isPublishing ? 0.85 : 1,
                letterSpacing: "0.04em",
              }}
            >
              {isPublishing && (
                <motion.div
                  className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                />
              )}
              {isPublishing ? "Sealing..." : `Seal the Contract${hasStake ? ` (${editDraft.stake} credits)` : ""}`}
            </motion.button>

            <motion.button
              onClick={onEdit}
              whileHover={{ scale: 1.02, background: "rgba(212,175,55,0.08)" }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-3.5 rounded-xl text-sm font-bold font-serif"
              style={{
                background: "rgba(212,175,55,0.04)",
                border: "1px solid rgba(212,175,55,0.2)",
                color: "#D4AF37",
              }}
            >
              Amend
            </motion.button>
          </motion.div>

          <p className="text-[10px] text-center leading-relaxed px-2 mt-3 font-serif" style={{ color: "rgba(212,175,55,0.5)" }}>
            After sealing, submit proof in the <span className="font-bold" style={{ color: "#D4AF37" }}>AI Oracle</span> panel — the tribunal compares evidence to your terms, then credits move by decree.
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function PlayerCard({ name, role, gradient, color, open = false }: {
  name: string; role: string; gradient: string; color?: string; open?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-1">
      <motion.div
        className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 ${
          open ? "border-2 border-dashed" : `bg-gradient-to-br ${gradient}`
        }`}
        style={
          open
            ? { borderColor: "rgba(212,175,55,0.2)" }
            : color
            ? { boxShadow: `0 0 16px ${color}33`, background: `linear-gradient(135deg, #D4AF37, ${color})` }
            : undefined
        }
        whileHover={open ? {} : { scale: 1.05, boxShadow: `0 0 24px ${color}44` }}
      >
        {open
          ? <motion.span
              className="text-sm font-bold font-serif"
              style={{ color: "#D4AF37" }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
            >?</motion.span>
          : <span className="text-sm font-black text-white font-serif">{name.charAt(0)}</span>
        }
      </motion.div>
      <div className="min-w-0">
        <p className="text-sm font-bold truncate" style={{ color: "#E8DCC8" }}>{name}</p>
        <p className="text-[10px]" style={{ color: "rgba(212,175,55,0.5)" }}>{role}</p>
      </div>
    </div>
  );
}
