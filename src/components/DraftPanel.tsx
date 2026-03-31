"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";

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

interface Props {
  draft: ChallengeDraft;
  onPublish: () => void;
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

function InfoCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <motion.div
      className="relative flex flex-col gap-1 px-3.5 py-3 rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
      whileHover={{ background: "rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs">{icon}</span>
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-text-muted">{label}</span>
      </div>
      <p className="text-sm font-bold text-text-primary truncate">{value}</p>
    </motion.div>
  );
}

export default function DraftPanel({ draft, onPublish, onEdit }: Props) {
  const colors = TYPE_COLORS[draft.type] ?? TYPE_COLORS.General;

  const containerVariants: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.08 } },
  };
  const childVariants: Variants = {
    hidden:  { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Ready header */}
      <motion.div
        className="flex items-center gap-2.5 mb-4"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
      >
        <div className="w-5 h-5 rounded-md flex items-center justify-center"
             style={{ background: "rgba(0,232,122,0.15)" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="3" strokeLinecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <span className="text-sm font-bold text-text-secondary">Challenge Draft Ready</span>
      </motion.div>

      {/* Main card */}
      <motion.div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: "rgba(13,13,30,0.95)",
          boxShadow: `0 0 0 1px rgba(255,255,255,0.07), 0 20px 60px rgba(0,0,0,0.5), 0 0 60px ${colors.glow.replace("0.4", "0.08")}`,
          backdropFilter: "blur(24px)",
        }}
        whileHover={{ boxShadow: `0 0 0 1px rgba(255,255,255,0.1), 0 24px 70px rgba(0,0,0,0.5), 0 0 80px ${colors.glow.replace("0.4", "0.14")}` }}
      >
        {/* Gradient top bar */}
        <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${colors.from}, ${colors.to}, ${colors.from})`, backgroundSize: "200% 100%", animation: "gradient-drift 4s linear infinite" }} />

        <motion.div
          className="p-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Title row */}
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
                {draft.type}
              </span>
              <h3 className="text-lg font-extrabold text-text-primary leading-snug">{draft.title}</h3>
            </div>

            {/* Stake badge */}
            <div
              className="flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl"
              style={{
                background: draft.currency === "none"
                  ? "rgba(0,212,200,0.1)" : "rgba(245,166,35,0.1)",
                border: draft.currency === "none"
                  ? "1px solid rgba(0,212,200,0.2)" : "1px solid rgba(245,166,35,0.2)",
              }}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider"
                    style={{ color: draft.currency === "none" ? "#00d4c8" : "#f5a623" }}>
                Stake
              </span>
              <span className="text-lg font-black"
                    style={{ color: draft.currency === "none" ? "#00d4c8" : "#f5a623" }}>
                {draft.currency === "none" ? "Free" : draft.stake}
              </span>
            </div>
          </motion.div>

          {/* Players */}
          <motion.div className="flex items-center gap-4 mb-5" variants={childVariants}>
            <PlayerCard name={draft.playerA} role="Challenger" gradient="from-blue-500 to-indigo-600" />

            <div className="flex-shrink-0 flex flex-col items-center gap-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center border border-border-mid"
                   style={{ background: "rgba(255,255,255,0.04)" }}>
                <span className="text-[9px] font-black text-text-muted">VS</span>
              </div>
              <div className="h-px w-10 bg-gradient-to-r from-transparent via-border-mid to-transparent" />
            </div>

            <PlayerCard
              name={draft.playerB ?? "Open Slot"}
              role={draft.playerB ? "Opponent" : "Anyone can join"}
              gradient={draft.playerB ? "from-rose-500 to-pink-600" : ""}
              open={!draft.playerB}
            />
          </motion.div>

          {/* Info grid */}
          <motion.div className="grid grid-cols-2 gap-2.5 mb-5" variants={childVariants}>
            <InfoCell icon="⏰" label="Deadline" value={draft.deadline} />
            <InfoCell icon="📋" label="Rules"    value={draft.rules} />
            <InfoCell icon="📸" label="Evidence" value={draft.evidence} />
            <InfoCell icon="🤖" label="Judgment" value={draft.aiReview ? "AI Review" : "Manual"} />
          </motion.div>

          {/* Visibility pill */}
          <motion.div
            className="flex items-center gap-2.5 mb-5 px-4 py-2.5 rounded-xl"
            style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.12)" }}
            variants={childVariants}
          >
            <div className="relative w-2 h-2">
              <div className="absolute inset-0 rounded-full bg-success animate-pulse-dot" />
              <div className="absolute inset-0 rounded-full bg-success opacity-30 scale-150 animate-ping" />
            </div>
            <span className="text-xs font-medium text-text-secondary">
              {draft.isPublic
                ? "Public — anyone can view and bet on this challenge"
                : "Private — only invited participants can see this"}
            </span>
          </motion.div>

          {/* Actions */}
          <motion.div className="flex items-center gap-3" variants={childVariants}>
            <motion.button
              onClick={onPublish}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="shimmer-btn flex-1 py-3.5 rounded-xl text-sm font-extrabold text-white relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                boxShadow: `0 4px 24px ${colors.glow}, inset 0 1px 0 rgba(255,255,255,0.15)`,
              }}
            >
              Publish Challenge
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
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function PlayerCard({ name, role, gradient, open = false }: {
  name: string; role: string; gradient: string; open?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-1">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-md flex-shrink-0 ${
        open ? "border-2 border-dashed border-border-mid" : `bg-gradient-to-br ${gradient}`
      }`}>
        {open
          ? <span className="text-xs text-text-muted">?</span>
          : <span className="text-sm font-black text-white">{name.charAt(0)}</span>
        }
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-text-primary truncate">{name}</p>
        <p className="text-[10px] text-text-muted">{role}</p>
      </div>
    </div>
  );
}
