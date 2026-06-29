"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ActionItem, ParsedChallenge } from "@/lib/api-client";

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
  rich?: ParsedChallenge | null;
  onPublish: (editedDraft: ChallengeDraft) => void;
  onEdit: () => void;
  onFieldChange?: (patch: Partial<ChallengeDraft>) => void;
  onActionItem?: (a: ActionItem) => void;
}

type ProtocolValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ProtocolRecord
  | ProtocolValue[];

interface ProtocolRecord {
  [key: string]: ProtocolValue;
}

type QuestProtocolView = ParsedChallenge & {
  userFacingSummary?: string;
  participantMode?: ProtocolValue;
  outcomeType?: ProtocolValue;
  evidenceProtocol?: ProtocolValue;
  timingProtocol?: ProtocolValue;
  settlementProtocol?: ProtocolValue;
  riskPolicy?: ProtocolValue;
};

const SUM_INK = "#153047";
const SUM_MUTED = "#60758A";
const SUM_SKY = "#DFF5FF";
const SUM_MINT = "#8FE6C1";
const SUM_PEACH = "#FFB978";
const SUM_SUN = "#FFD86B";
const SUM_BORDER = "rgba(41,112,142,0.16)";
const SUM_CARD = "rgba(255,255,255,0.9)";
const SUM_SHADOW = "0 18px 44px rgba(40,102,133,0.14)";
const SUM_DANGER = "#B4234A";
const SUM_DANGER_BG = "#FFE4EA";

function isRecord(value: ProtocolValue): value is ProtocolRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function humanize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const spaced = trimmed
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function protocolText(value: ProtocolValue, preferredKeys: string[] = []): string {
  if (value == null) return "";
  if (typeof value === "string") return humanize(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.map((item) => protocolText(item, preferredKeys)).filter(Boolean).join("; ");
  }
  if (isRecord(value)) {
    const fallbackKeys = [
      "userFacingSummary",
      "summary",
      "label",
      "description",
      "required",
      "requirement",
      "rule",
      "judgeRule",
      "proof",
      "window",
      "deadline",
      "timing",
      "note",
      "policy",
      "type",
    ];
    for (const key of [...preferredKeys, ...fallbackKeys]) {
      const text = protocolText(value[key]);
      if (text) return text;
    }
  }
  return "";
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => value && value.trim().length > 0)?.trim() ?? "";
}

function participantText(protocol: QuestProtocolView | null, draft: ChallengeDraft) {
  const fromProtocol = protocolText(protocol?.participantMode, ["summary", "label", "mode", "participants"]);
  if (fromProtocol) return fromProtocol;
  if (draft.playerB) return `${draft.playerA} vs ${draft.playerB}`;
  return draft.isPublic ? "Open arena" : "Invite only";
}

function safetyText(protocol: QuestProtocolView | null) {
  const risk = protocolText(protocol?.riskPolicy, ["safetyNote", "note", "summary", "policy", "warning"]);
  if (risk) return risk;
  return protocol?.redFlags?.find((flag) => flag.trim().length > 0) ?? "";
}

export default function DraftPanel({ draft, rich, onPublish, onFieldChange, onActionItem }: Props) {
  const [d, setD] = useState<ChallengeDraft>(draft);
  const [openField, setOpenField] = useState<null | "stake" | "evidence" | "deadline" | "type">(null);

  useEffect(() => setD(draft), [draft]);

  const protocol = (rich ?? null) as QuestProtocolView | null;
  const questTitle = firstText(protocol?.title, d.title, "Untitled quest");
  const summary = firstText(
    protocol?.userFacingSummary,
    protocol?.recommendationSummary,
    protocol?.proposition,
    d.rules,
    "Review the quest terms, send the invite, and let the Familiar judge the proof.",
  );
  const participants = participantText(protocol, d);
  const proofRequired = firstText(
    protocolText(protocol?.evidenceProtocol, ["summary", "required", "requirement", "proof", "type"]),
    protocol?.evidenceType,
    d.evidence,
    "Proof required before the Familiar judges.",
  );
  const winCondition = firstText(
    protocol?.proposition,
    d.rules,
    protocolText(protocol?.outcomeType, ["summary", "label", "rule", "type"]),
    "The quest rules decide the result.",
  );
  const deadline = firstText(
    protocolText(protocol?.timingProtocol, ["summary", "deadline", "window", "timing"]),
    protocol?.deadline,
    d.deadline,
    "Timing to be confirmed.",
  );
  const familiarJudge = firstText(
    protocolText(protocol?.settlementProtocol, ["judge", "arbiter", "reviewRule", "summary", "description", "rule"]),
    d.aiReview ? "AI Familiar reviews submitted proof." : "Summoner reviews submitted proof.",
  );
  const safety = safetyText(protocol);

  const applyField = (patch: Partial<ChallengeDraft>) => {
    setD(prev => ({ ...prev, ...patch }));
    onFieldChange?.(patch);
    setOpenField(null);
  };

  const detailRows = [
    ["Summoner / opponent", participants],
    ["Proof required", proofRequired],
    ["Win condition", winCondition],
    ["Deadline / timing", deadline],
    ["AI Familiar judge", familiarJudge],
  ] as const;

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="relative isolate overflow-visible"
      initial={{ opacity: 0, y: 8 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
    >
      <div
        className="relative overflow-hidden p-4 sm:p-5"
        style={{
          background:
            "radial-gradient(circle at 92% 0%, rgba(255,216,107,0.34), transparent 28%), radial-gradient(circle at 8% 14%, rgba(143,230,193,0.3), transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.96), rgba(223,245,255,0.9))",
          border: `1px solid ${SUM_BORDER}`,
          borderRadius: "28px",
          boxShadow: SUM_SHADOW,
          color: SUM_INK,
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute right-5 top-5 rounded-full"
          style={{
            width: "3rem",
            height: "3rem",
            background:
              "radial-gradient(circle at 35% 30%, #fff 0 18%, #ffd86b 19% 38%, #ffb978 39% 100%)",
            boxShadow: "0 0 0 4px rgba(255,216,107,0.18), 0 0 24px rgba(143,230,193,0.56)",
          }}
        />

        <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em]" style={{ color: SUM_MUTED }}>
              Quest Contract
            </p>
            <input
              className="mt-1 w-full bg-transparent text-2xl font-extrabold leading-tight outline-none"
              maxLength={64}
              onBlur={(event) => {
                event.currentTarget.style.borderBottomColor = "transparent";
              }}
              onChange={(event) => setD(prev => ({ ...prev, title: event.target.value }))}
              onFocus={(event) => {
                event.currentTarget.style.borderBottomColor = SUM_PEACH;
              }}
              style={{ color: SUM_INK, borderBottom: "2px solid transparent" }}
              type="text"
              value={d.title || questTitle}
            />
          </div>
          <span
            className="rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em]"
            style={{
              background: d.isPublic ? SUM_MINT : SUM_CARD,
              border: `1px solid ${SUM_BORDER}`,
              color: SUM_INK,
              boxShadow: "0 8px 18px rgba(40,102,133,0.08)",
            }}
          >
            {d.isPublic ? "Public arena" : "Invite quest"}
          </span>
        </div>

        <p className="relative z-10 mt-3 text-sm font-semibold leading-6" style={{ color: SUM_MUTED }}>
          {summary}
        </p>

        <div className="relative z-10 mt-4 grid gap-2">
          {detailRows.map(([label, value]) => (
            <div
              key={label}
              className="rounded-[18px] px-3 py-3 sm:px-4"
              style={{
                background: "rgba(255,255,255,0.72)",
                border: `1px solid ${SUM_BORDER}`,
              }}
            >
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: SUM_MUTED }}>
                {label}
              </p>
              <p className="mt-1 text-sm font-bold leading-5" style={{ color: SUM_INK }}>
                {value}
              </p>
            </div>
          ))}
        </div>

        {safety && (
          <div
            className="relative z-10 mt-4 rounded-[18px] px-4 py-3"
            style={{
              background: SUM_DANGER_BG,
              border: "1px solid rgba(180,35,74,0.2)",
              color: SUM_DANGER,
            }}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em]">Safety note</p>
            <p className="mt-1 text-sm font-semibold leading-5">{safety}</p>
          </div>
        )}

        {rich?.oracles && rich.oracles.length > 0 && (
          <div
            className="relative z-10 mt-4 rounded-[18px] px-4 py-3"
            style={{
              background: "rgba(143,230,193,0.22)",
              border: `1px solid ${SUM_BORDER}`,
            }}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: SUM_MUTED }}>
              Source attached
            </p>
            <div className="mt-2 grid gap-2">
              {rich.oracles.map((oracle, index) => (
                <div key={`${oracle.source}-${oracle.label}-${index}`} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold" style={{ color: SUM_INK }}>
                      {oracle.source} - {oracle.label}
                    </p>
                    {oracle.currentValue && (
                      <p className="text-xs font-semibold" style={{ color: SUM_MUTED }}>
                        Current: {oracle.currentValue}
                      </p>
                    )}
                  </div>
                  {oracle.oracleUrl && (
                    <a
                      className="shrink-0 rounded-full px-3 py-1 text-xs font-bold"
                      href={oracle.oracleUrl}
                      rel="noreferrer"
                      style={{ background: "#fff", color: SUM_INK, border: `1px solid ${SUM_BORDER}` }}
                      target="_blank"
                    >
                      Verify
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {rich?.actionItems && rich.actionItems.length > 0 && (
          <div className="relative z-10 mt-4 flex flex-wrap gap-2">
            {rich.actionItems.map((action, index) => (
              <button
                className="rounded-full px-3 py-2 text-xs font-extrabold transition-transform hover:scale-[1.02] active:scale-[0.98]"
                key={`${action.label}-${index}`}
                onClick={() => onActionItem?.(action)}
                style={{
                  background: SUM_PEACH,
                  border: "1px solid rgba(255,185,120,0.7)",
                  boxShadow: "0 8px 18px rgba(255,164,96,0.18)",
                  color: SUM_INK,
                }}
                title={action.reasoning}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div className="relative z-20 mt-4 grid grid-cols-2 gap-2.5">
          <ClickableField
            isOpen={openField === "stake"}
            label="Points"
            marker="XP"
            onToggle={() => setOpenField(openField === "stake" ? null : "stake")}
            options={rich?.stakeOptions?.map(option => ({
              active: option.amount === d.stake,
              label: option.amount === 0 ? `Free - ${option.label}` : `${option.amount} cr - ${option.label}`,
              onClick: () => applyField({ stake: option.amount }),
              reasoning: option.reasoning,
            }))}
            tint={SUM_PEACH}
            value={d.stake > 0 ? `${d.stake} credits` : "Free"}
            customInput={{
              placeholder: "e.g. 7 or 0 for free",
              onApply: (raw) => {
                const n = Math.max(0, Math.floor(Number(raw) || 0));
                applyField({ stake: n });
              },
            }}
          />
          <ClickableField
            isOpen={openField === "deadline"}
            label="Deadline"
            marker="T"
            onToggle={() => setOpenField(openField === "deadline" ? null : "deadline")}
            options={rich?.deadlineOptions?.map(option => ({
              active: option.duration === d.deadline,
              label: option.duration,
              onClick: () => applyField({ deadline: option.duration }),
              reasoning: option.reasoning,
            }))}
            tint={SUM_SUN}
            value={d.deadline}
            customInput={{
              placeholder: "e.g. 3 days, 2 hours",
              onApply: (raw) => applyField({ deadline: raw }),
            }}
          />
          <ClickableField
            isOpen={openField === "evidence"}
            label="Proof"
            marker="P"
            onToggle={() => setOpenField(openField === "evidence" ? null : "evidence")}
            options={rich?.evidenceOptions?.map(option => ({
              active: option.label === d.evidence,
              label: `${option.label}${option.required ? " required" : ""}`,
              onClick: () => applyField({ evidence: option.label }),
              reasoning: option.reasoning,
            }))}
            tint={SUM_MINT}
            value={d.evidence}
            customInput={{
              placeholder: "e.g. screenshot plus timestamp",
              onApply: (raw) => applyField({ evidence: raw }),
            }}
          />
          <ClickableField
            isOpen={openField === "type"}
            label="Quest style"
            marker="Q"
            onToggle={() => setOpenField(openField === "type" ? null : "type")}
            tint={SUM_SKY}
            value={d.type}
            customInput={{
              placeholder: "e.g. Fitness, Games, Debate",
              onApply: (raw) => applyField({ type: raw }),
            }}
          />
        </div>

        <motion.button
          className="relative z-10 mt-5 w-full py-4 text-base font-extrabold"
          onClick={() => onPublish(d)}
          style={{
            background: `linear-gradient(135deg, ${SUM_PEACH}, ${SUM_SUN})`,
            border: "1px solid rgba(255,185,120,0.72)",
            borderRadius: "9999px",
            boxShadow: "0 14px 30px rgba(255,164,96,0.24)",
            color: SUM_INK,
            letterSpacing: "0",
          }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          type="button"
          whileHover={{ scale: 1.02, y: -1 }}
          whileTap={{ scale: 0.97 }}
        >
          Send Quest
        </motion.button>
      </div>
    </motion.div>
  );
}

interface ClickableFieldProps {
  label: string;
  value: string;
  tint: string;
  marker: string;
  isOpen: boolean;
  onToggle: () => void;
  options?: Array<{ label: string; reasoning: string; onClick: () => void; active: boolean }>;
  customInput?: {
    placeholder: string;
    onApply: (raw: string) => void;
  };
}

function ClickableField({ label, value, tint, marker, isOpen, onToggle, options, customInput }: ClickableFieldProps) {
  const [customValue, setCustomValue] = useState("");
  const clickable = Boolean((options && options.length > 0) || customInput);

  const applyCustom = () => {
    const nextValue = customValue.trim();
    if (nextValue.length === 0 || !customInput) return;
    customInput.onApply(nextValue);
    setCustomValue("");
  };

  return (
    <div className="relative" style={{ zIndex: isOpen ? 30 : 1 }}>
      <motion.button
        className="w-full px-3 py-3 text-left transition-all"
        onClick={onToggle}
        style={{
          background: "rgba(255,255,255,0.7)",
          border: `1px solid ${SUM_BORDER}`,
          borderRadius: "16px",
          cursor: clickable ? "pointer" : "default",
        }}
        type="button"
        whileTap={clickable ? { scale: 0.97 } : undefined}
      >
        <p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.16em]" style={{ color: SUM_MUTED }}>
          <span
            className="grid h-5 w-5 place-items-center rounded-full text-[9px]"
            style={{ background: tint, color: SUM_INK }}
          >
            {marker}
          </span>
          <span>{label}</span>
          {clickable && <span className="ml-auto text-[9px] font-semibold" style={{ color: SUM_MUTED }}>Tap</span>}
        </p>
        <p className="truncate text-sm font-bold" style={{ color: SUM_INK }}>{value}</p>
      </motion.button>

      <AnimatePresence>
        {isOpen && clickable && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute left-0 right-0 top-full z-20 mt-1 space-y-1 p-2"
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            onWheel={(event) => event.stopPropagation()}
            style={{
              background: "#fff",
              border: `1px solid ${SUM_BORDER}`,
              borderRadius: "16px",
              boxShadow: "0 18px 34px rgba(40,102,133,0.16)",
            }}
            transition={{ duration: 0.15 }}
          >
            {options?.map((option, index) => (
              <button
                className="w-full rounded-xl px-3 py-2 text-left transition-colors"
                key={`${option.label}-${index}`}
                onClick={option.onClick}
                style={{
                  background: option.active ? `${tint}66` : "transparent",
                  border: option.active ? `1px solid ${tint}` : "1px solid transparent",
                }}
                type="button"
              >
                <p className="mb-0.5 text-xs font-bold" style={{ color: SUM_INK }}>{option.label}</p>
                <p className="text-[10px] font-medium leading-snug" style={{ color: SUM_MUTED }}>{option.reasoning}</p>
              </button>
            ))}

            {customInput && (
              <>
                {(options?.length ?? 0) > 0 && (
                  <div className="my-1 flex items-center gap-2 px-2">
                    <div className="h-px flex-1" style={{ background: SUM_BORDER }} />
                    <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: SUM_MUTED }}>Custom</span>
                    <div className="h-px flex-1" style={{ background: SUM_BORDER }} />
                  </div>
                )}
                <div
                  className="flex items-center gap-2 rounded-xl px-3 py-2"
                  style={{
                    background: "#FFFFFF",
                    border: `2px dashed ${tint}`,
                  }}
                >
                  <input
                    autoFocus
                    className="min-w-0 flex-1 bg-transparent text-xs font-bold focus:outline-none placeholder:font-medium"
                    onChange={event => setCustomValue(event.target.value)}
                    onKeyDown={event => event.key === "Enter" && applyCustom()}
                    placeholder={customInput.placeholder}
                    style={{ color: SUM_INK }}
                    type="text"
                    value={customValue}
                  />
                  <button
                    className="rounded-full px-3 py-1 text-[11px] font-bold transition-all active:scale-95 disabled:opacity-40"
                    disabled={customValue.trim().length === 0}
                    onClick={applyCustom}
                    style={{ color: SUM_INK, background: tint, border: `1px solid ${tint}` }}
                    type="button"
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
