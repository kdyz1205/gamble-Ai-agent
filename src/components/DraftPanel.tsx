"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ParsedChallenge, ActionItem } from "@/lib/api-client";

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
  /** AI's rich parsed output — when present, we render chip dropdowns per field with reasoning. */
  rich?: ParsedChallenge | null;
  onPublish: (editedDraft: ChallengeDraft) => void;
  onEdit: () => void;
  /** Called when user picks a different stake/evidence/deadline option from AI's list. */
  onFieldChange?: (patch: Partial<ChallengeDraft>) => void;
  /** Called when the user clicks one of AI's proactive action suggestions (top up, reduce scope, …). */
  onActionItem?: (a: ActionItem) => void;
}

// LuckyPlay canonical palette — see project_luckyplay_design_system memory
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

export default function DraftPanel({ draft, rich, onPublish, onFieldChange, onActionItem }: Props) {
  const [d, setD] = useState<ChallengeDraft>(draft);
  const [openField, setOpenField] = useState<null | "stake" | "evidence" | "deadline" | "type">(null);
  useEffect(() => setD(draft), [draft]);

  const applyField = (patch: Partial<ChallengeDraft>) => {
    setD(prev => ({ ...prev, ...patch }));
    onFieldChange?.(patch);
    setOpenField(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className="lp-glass"
      style={{
        borderRadius: "28px",
        boxShadow: "0 8px 30px rgba(15,23,42,0.04)",
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
          className="w-full text-xl font-extrabold bg-transparent border-b-2 border-transparent focus:outline-none transition-colors mb-2 pb-1"
          style={{ color: NAVY, borderBottomColor: "transparent" }}
          onFocus={e => (e.currentTarget.style.borderBottomColor = PEACH)}
          onBlur={e => (e.currentTarget.style.borderBottomColor = "transparent")}
        />

        {/* AI's overall take — one-sentence summary */}
        {rich?.recommendationSummary && (
          <p className="text-xs font-medium mb-4 leading-relaxed" style={{ color: NAVY_DIM }}>
            <span style={{ color: PEACH_DARK }}>✨ </span>{rich.recommendationSummary}
          </p>
        )}

        {/* Oracle attachments — AI called real tools and wired them into the bet.
            Rendered as a dashed card with source + current value + verify link. */}
        {rich?.oracles && rich.oracles.length > 0 && (
          <div
            className="mb-4 px-3 py-2.5"
            style={{
              background: `linear-gradient(135deg, ${MINT}33, ${LAVENDER}22)`,
              border: `1.5px dashed ${MINT_TEXT}`,
              borderRadius: "14px",
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: MINT_TEXT }}>🔗 Oracle attached</p>
            {rich.oracles.map((o, i) => (
              <div key={i} className="flex items-center justify-between gap-2 mb-1 last:mb-0">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate" style={{ color: NAVY }}>{o.source} · {o.label}</p>
                  {o.currentValue && (
                    <p className="text-[11px] font-semibold" style={{ color: MINT_TEXT }}>Now: {o.currentValue}</p>
                  )}
                </div>
                {o.oracleUrl && (
                  <a
                    href={o.oracleUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] font-bold shrink-0 px-2 py-0.5 hover:underline"
                    style={{ background: "#FFFFFF", color: MINT_TEXT, borderRadius: "999px", border: `1px solid ${MINT_TEXT}` }}
                  >
                    verify ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Red flags — AI-raised concerns */}
        {rich?.redFlags && rich.redFlags.length > 0 && (
          <div
            className="mb-4 px-3 py-2"
            style={{ background: ROSE_BG, border: `1px solid #FDA4AF`, borderRadius: "14px" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: ROSE_TEXT }}>⚠️ Heads up</p>
            {rich.redFlags.map((f, i) => (
              <p key={i} className="text-xs font-medium leading-relaxed" style={{ color: ROSE_TEXT }}>• {f}</p>
            ))}
          </div>
        )}

        {/* Proactive action items — AI proposes clickable next-steps (top up, reduce scope, etc.)
            Parent handles actual click via onActionItem; we just render buttons. */}
        {rich?.actionItems && rich.actionItems.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {rich.actionItems.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onActionItem?.(a)}
                title={a.reasoning}
                className="px-3 py-1.5 text-[11px] font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: PEACH,
                  color: PEACH_TEXT,
                  borderRadius: "999px",
                  border: `1.5px solid ${PEACH_DARK}`,
                  boxShadow: `0 2px 8px ${ORANGE_GLOW}`,
                }}
              >
                ✨ {a.label}
              </button>
            ))}
          </div>
        )}

        {/* Key fields — each clickable to reveal AI's alternative options with reasoning */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          <ClickableField
            label="Stake"
            value={d.stake > 0 ? `${d.stake} cr` : "Free"}
            tint={d.stake > 0 ? PEACH : MINT}
            emoji="💰"
            isOpen={openField === "stake"}
            onToggle={() => setOpenField(openField === "stake" ? null : "stake")}
            options={rich?.stakeOptions?.map(o => ({
              label: o.amount === 0 ? `Free — ${o.label}` : `${o.amount} cr — ${o.label}`,
              reasoning: o.reasoning,
              onClick: () => applyField({ stake: o.amount }),
              active: o.amount === d.stake,
            }))}
            customInput={{
              placeholder: "e.g. 7 or 0 for free",
              onApply: (raw) => {
                const n = Math.max(0, Math.floor(Number(raw) || 0));
                applyField({ stake: n });
              },
            }}
          />
          <ClickableField
            label="Deadline"
            value={d.deadline}
            tint={LAVENDER}
            emoji="⏰"
            isOpen={openField === "deadline"}
            onToggle={() => setOpenField(openField === "deadline" ? null : "deadline")}
            options={rich?.deadlineOptions?.map(o => ({
              label: o.duration,
              reasoning: o.reasoning,
              onClick: () => applyField({ deadline: o.duration }),
              active: o.duration === d.deadline,
            }))}
            customInput={{
              placeholder: "e.g. 3 days, 2 hours",
              onApply: (raw) => applyField({ deadline: raw }),
            }}
          />
          <ClickableField
            label="Evidence"
            value={d.evidence}
            tint={MINT}
            emoji="📸"
            isOpen={openField === "evidence"}
            onToggle={() => setOpenField(openField === "evidence" ? null : "evidence")}
            options={rich?.evidenceOptions?.map(o => ({
              label: `${o.label}${o.required ? " ★" : ""}`,
              reasoning: o.reasoning,
              onClick: () => applyField({ evidence: o.label }),
              active: o.label === d.evidence,
            }))}
            customInput={{
              placeholder: "e.g. screenshot + timestamp",
              onApply: (raw) => applyField({ evidence: raw }),
            }}
          />
          <ClickableField
            label="Type"
            value={d.type}
            tint={PEACH}
            emoji="🏷️"
            isOpen={openField === "type"}
            onToggle={() => setOpenField(openField === "type" ? null : "type")}
            customInput={{
              placeholder: "e.g. Fitness, Combat, Art",
              onApply: (raw) => applyField({ type: raw }),
            }}
          />
        </div>

        {/* Rules */}
        {d.rules && (
          <div
            className="mb-5 px-4 py-3"
            style={{ background: CREAM, border: `1px solid #FFE0CC`, borderRadius: "16px" }}
          >
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: PEACH_DARK }}>📖 Rules</p>
            <p className="text-sm font-medium leading-relaxed" style={{ color: NAVY }}>{d.rules}</p>
          </div>
        )}

        {/* Publish */}
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

interface ClickableFieldProps {
  label: string;
  value: string;
  tint: string;
  emoji: string;
  isOpen: boolean;
  onToggle: () => void;
  options?: Array<{ label: string; reasoning: string; onClick: () => void; active: boolean }>;
  /** Optional custom-value override — if provided, shows a "Custom…" input at the bottom. */
  customInput?: {
    placeholder: string;
    onApply: (raw: string) => void;
  };
}

function ClickableField({ label, value, tint, emoji, isOpen, onToggle, options, customInput }: ClickableFieldProps) {
  const [customValue, setCustomValue] = useState("");
  const clickable = Boolean((options && options.length > 0) || customInput);

  const applyCustom = () => {
    const v = customValue.trim();
    if (v.length === 0 || !customInput) return;
    customInput.onApply(v);
    setCustomValue("");
  };

  return (
    <div className="relative">
      <motion.button
        onClick={onToggle}
        whileTap={clickable ? { scale: 0.97 } : undefined}
        className="w-full px-3 py-3 text-left transition-all"
        style={{
          background: `${tint}14`,
          border: `1px solid ${tint}33`,
          borderRadius: "16px",
          cursor: clickable ? "pointer" : "default",
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: NAVY_DIM }}>
          <span>{emoji}</span>
          <span>{label}</span>
          {clickable && <span className="ml-auto text-[9px] font-semibold" style={{ color: NAVY_DIM, opacity: 0.7 }}>tap ↓</span>}
        </p>
        <p className="text-sm font-bold" style={{ color: NAVY }}>{value}</p>
      </motion.button>

      <AnimatePresence>
        {isOpen && clickable && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1 z-20 p-2 space-y-1 lp-glass"
            style={{ borderRadius: "16px", boxShadow: "0 8px 24px rgba(15,23,42,0.12)" }}
            onWheel={(e) => e.stopPropagation()}
          >
            {options?.map((opt, i) => (
              <button
                key={i}
                onClick={opt.onClick}
                className="w-full text-left px-3 py-2 transition-colors rounded-xl"
                style={{
                  background: opt.active ? `${tint}40` : "transparent",
                  border: opt.active ? `1px solid ${tint}` : "1px solid transparent",
                }}
              >
                <p className="text-xs font-bold mb-0.5" style={{ color: NAVY }}>{opt.label}</p>
                <p className="text-[10px] font-medium leading-snug" style={{ color: NAVY_DIM }}>{opt.reasoning}</p>
              </button>
            ))}

            {customInput && (
              <>
                {(options?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-2 my-1 px-2">
                    <div className="flex-1 h-px" style={{ background: NAVY_FAINT }} />
                    <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NAVY_DIM }}>or type your own</span>
                    <div className="flex-1 h-px" style={{ background: NAVY_FAINT }} />
                  </div>
                )}
                <div
                  className="px-3 py-2 rounded-xl flex items-center gap-2"
                  style={{
                    background: "#FFFFFF",
                    border: `2px dashed ${tint}`,
                  }}
                >
                  <span className="text-xs font-bold opacity-80" style={{ color: NAVY_DIM }}>✏️</span>
                  <input
                    type="text"
                    value={customValue}
                    onChange={e => setCustomValue(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && applyCustom()}
                    placeholder={customInput.placeholder}
                    className="flex-1 bg-transparent text-xs font-bold focus:outline-none placeholder:font-medium"
                    style={{ color: NAVY }}
                    autoFocus
                  />
                  <button
                    onClick={applyCustom}
                    disabled={customValue.trim().length === 0}
                    className="px-3 py-1 text-[11px] font-bold rounded-full disabled:opacity-40 transition-all active:scale-95"
                    style={{ color: NAVY, background: tint, border: `1px solid ${tint}` }}
                  >
                    Set
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
