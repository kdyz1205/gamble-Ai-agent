"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
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
}

const TYPE_COLORS: Record<string, { from: string; to: string; glow: string }> = {
  Fitness:  { from: "#7c5cfc", to: "#a78bfa", glow: "rgba(124,92,252,0.4)" },
  Cooking:  { from: "#f5a623", to: "#f59e0b", glow: "rgba(245,166,35,0.4)" },
  Learning: { from: "#00d4c8", to: "#10b981", glow: "rgba(0,212,200,0.4)" },
  Coding:   { from: "#0ea5e9", to: "#6366f1", glow: "rgba(99,102,241,0.4)" },
  Games:    { from: "#ec4899", to: "#f43f5e", glow: "rgba(236,72,153,0.4)" },
  General:  { from: "#7c5cfc", to: "#00d4c8", glow: "rgba(124,92,252,0.4)" },
};

const INFO_ICONS: Record<string, React.ReactNode> = {
  Deadline: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  Rules: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  Evidence: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" />
    </svg>
  ),
  Judgment: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
};

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <motion.div
      className="relative flex flex-col gap-1.5 px-3.5 py-3 rounded-xl overflow-hidden shine-card"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      whileHover={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(124,92,252,0.15)" }}
    >
      <div className="flex items-center gap-1.5 text-text-muted">
        {INFO_ICONS[label] || <span className="text-xs">{icon}</span>}
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="text-sm font-bold text-text-primary truncate">{value}</p>
    </motion.div>
  );
}

export default function DraftPanel({ draft, onPublish, onEdit }: Props) {
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
          style={{ background: "rgba(0,232,122,0.15)" }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </motion.div>
        <span className="text-sm font-bold text-text-secondary">Challenge Draft Ready</span>
      </motion.div>

      <motion.div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "rgba(13,13,30,0.95)",
          boxShadow: `0 0 0 1px rgba(255,255,255,0.07), 0 20px 60px rgba(0,0,0,0.5), 0 0 60px ${colors.glow.replace("0.4", "0.08")}`,
          backdropFilter: "blur(24px)",
        }}
        whileHover={{
          boxShadow: `0 0 0 1px rgba(255,255,255,0.1), 0 24px 70px rgba(0,0,0,0.5), 0 0 80px ${colors.glow.replace("0.4", "0.14")}`,
        }}
      >
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${colors.from}, ${colors.to}, ${colors.from})`, backgroundSize: "200% 100%", animation: "gradient-drift 4s linear infinite" }} />

        <motion.div
          className="p-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div className="flex items-start justify-between mb-5" variants={childVariants}>
            <div className="flex-1 pr-4">
              <span
                className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-[0.1em] mb-2.5"
                style={{
                  background: `linear-gradient(135deg, ${colors.from}22, ${colors.to}15)`,
                  border: `1px solid ${colors.from}30`,
                  color: colors.from,
                }}
              >
                {editDraft.type}
              </span>
              <input
                type="text"
                value={editDraft.title}
                onChange={e => updateField("title", e.target.value)}
                maxLength={64}
                className="text-lg font-extrabold text-text-primary leading-snug bg-transparent border-b border-transparent hover:border-border-subtle focus:border-accent focus:outline-none transition-colors w-full"
              />
            </div>

            <motion.div
              className="flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl"
              style={{
                background: hasStake ? "rgba(245,166,35,0.1)" : "rgba(0,212,200,0.1)",
                border: hasStake ? "1px solid rgba(245,166,35,0.2)" : "1px solid rgba(0,212,200,0.2)",
              }}
              whileHover={{ scale: 1.03 }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: hasStake ? "#f5a623" : "#00d4c8" }}>
                Stake
              </span>
              <span className="text-lg font-black"
                    style={{ color: hasStake ? "#f5a623" : "#00d4c8" }}>
                {hasStake ? `${draft.stake}` : "Free"}
              </span>
              {hasStake && (
                <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5"
                      style={{ color: "rgba(245,166,35,0.6)" }}>
                  credits
                </span>
              )}
            </motion.div>
          </motion.div>

          <motion.div className="flex items-center gap-4 mb-5" variants={childVariants}>
            <PlayerCard name={editDraft.playerA} role="Challenger" gradient="from-[#7c5cfc] to-[#5b3fd9]" color="#7c5cfc" />

            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <motion.div
                className="w-9 h-9 rounded-full flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 0 16px rgba(124,92,252,0.1)",
                }}
                animate={{ boxShadow: ["0 0 12px rgba(124,92,252,0.08)", "0 0 20px rgba(124,92,252,0.18)", "0 0 12px rgba(124,92,252,0.08)"] }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <span className="text-[9px] font-black bg-gradient-to-r from-accent to-teal bg-clip-text text-transparent">VS</span>
              </motion.div>
              <div className="h-px w-10 bg-gradient-to-r from-transparent via-border-mid to-transparent" />
            </div>

            <PlayerCard
              name={editDraft.playerB ?? "Open Slot"}
              role={editDraft.playerB ? "Opponent" : "Anyone can join"}
              gradient={editDraft.playerB ? "from-[#00d4c8] to-[#0d9488]" : ""}
              color={editDraft.playerB ? "#00d4c8" : undefined}
              open={!editDraft.playerB}
            />
          </motion.div>

          <motion.div className="grid grid-cols-2 gap-2.5 mb-5" variants={childVariants}>
            <InfoCell icon="⏰" label="Deadline" value={draft.deadline} />
            <InfoCell icon="📋" label="Rules"    value={draft.rules} />
            <InfoCell icon="📸" label="Evidence" value={draft.evidence} />
            <InfoCell icon="🤖" label="Judgment" value={draft.aiReview ? "AI Review" : "Manual"} />
          </motion.div>

          <motion.div
            className="flex items-center gap-2.5 mb-5 px-4 py-2.5 rounded-xl"
            style={{
              background: editDraft.isPublic ? "rgba(0,232,122,0.06)" : "rgba(124,92,252,0.06)",
              border: editDraft.isPublic ? "1px solid rgba(0,232,122,0.12)" : "1px solid rgba(124,92,252,0.12)",
            }}
            variants={childVariants}
          >
            <div className="relative w-2 h-2">
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ background: editDraft.isPublic ? "#00e87a" : "#7c5cfc" }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <span className="text-xs font-medium text-text-secondary">
              {draft.isPublic
                ? "Public — anyone can view and join this challenge"
                : "Private — only invited participants can see this"}
            </span>
          </motion.div>

          <motion.div className="flex items-center gap-3" variants={childVariants}>
            <motion.button
              onClick={() => onPublish(editDraft)}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="shimmer-btn flex-1 py-3.5 rounded-xl text-sm font-extrabold text-white relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                boxShadow: `0 4px 24px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
              }}
            >
              Publish Challenge{hasStake ? ` (${draft.stake} credits)` : ""}
            </motion.button>

            <motion.button
              onClick={onEdit}
              whileHover={{ scale: 1.02, background: "rgba(255,255,255,0.07)" }}
              whileTap={{ scale: 0.97 }}
              className="px-5 py-3.5 rounded-xl text-sm font-bold text-text-secondary border border-border-subtle"
              style={{ background: "rgba(255,255,255,0.04)" }}
            >
              Edit
            </motion.button>
          </motion.div>

          <p className="text-[10px] text-text-muted/80 text-center leading-relaxed px-2 mt-3">
            After publishing, submit proof in the <span className="text-accent font-bold">AI Verdict</span> panel — Claude compares evidence to your rules, then credits move automatically.
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
          open ? "border-2 border-dashed border-white/10" : `bg-gradient-to-br ${gradient}`
        }`}
        style={!open && color ? { boxShadow: `0 0 16px ${color}33` } : undefined}
        whileHover={open ? {} : { scale: 1.05, boxShadow: `0 0 24px ${color}44` }}
      >
        {open
          ? <motion.span
              className="text-sm text-text-muted"
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
            >?</motion.span>
          : <span className="text-sm font-black text-white">{name.charAt(0)}</span>
        }
      </motion.div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text-primary truncate">{name}</p>
        <p className="text-[10px] text-text-muted">{role}</p>
      </div>
    </div>
  );
}
