"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { ChallengeData } from "@/lib/api-client";
import QuestGlyph from "@/components/world/QuestGlyph";

type Judgment = NonNullable<ChallengeData["judgments"]>[number];
type Participant = ChallengeData["participants"][number];

interface ResultReceiptCardProps {
  challenge: Pick<
    ChallengeData,
    "id" | "title" | "evidenceType" | "participants" | "creator" | "status"
  >;
  judgment: Judgment;
  shareUrl?: string;
  className?: string;
}

const INK = "var(--sum-ink)";
const MUTED = "var(--sum-muted)";
const CARD = "var(--sum-card)";
const BORDER = "var(--sum-border)";
const PEACH = "var(--sum-peach)";
const MINT = "var(--sum-mint)";
const GRASS = "var(--sum-grass)";
const SUN = "var(--sum-sun)";

function formatLabel(value?: string | null) {
  if (!value) return "Proof";

  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .trim();
}

function confidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "Not scored";
  return `${Math.round(value * 100)}%`;
}

function cleanReason(line: string) {
  return line
    .replace(/^[-*\d.)\s]+/, "")
    .replace(/^(because|reason|proof|evidence|therefore)[:\s-]+/i, "")
    .trim();
}

function proofReasons(reasoning?: string | null) {
  const source = (reasoning || "").replace(/\s+/g, " ").trim();
  if (!source) {
    return [
      "The Familiar reviewed the submitted proof against the quest rules.",
      "The receipt keeps the result easy to share and revisit.",
    ];
  }

  const parts = source
    .split(/(?:\n+|(?<=[.!?])\s+|;\s+)/)
    .map(cleanReason)
    .filter(part => part.length > 0 && part.length < 220);

  const unique = Array.from(new Set(parts));
  return unique.slice(0, 4).length >= 2 ? unique.slice(0, 4) : unique.concat(
    "The Familiar checked the available proof before creating this receipt.",
  ).slice(0, 4);
}

function participantName(participant: Participant | undefined) {
  return participant?.user?.username || null;
}

function findOpponent(participants: Participant[], winnerId: string | null) {
  if (winnerId) {
    return participants.find(participant => participant.user.id !== winnerId);
  }

  return participants.find(participant => participant.role === "opponent")
    || participants.find(participant => participant.role !== "creator");
}

function shareText(challenge: ResultReceiptCardProps["challenge"], judgment: Judgment, reasons: string[]) {
  const winner = judgment.winner?.username || "No clear winner";
  const confidence = confidenceLabel(judgment.confidence);

  return [
    `Quest Settled: ${challenge.title}`,
    `Winner: ${winner}`,
    `Confidence: ${confidence}`,
    reasons.length ? `Proof reason: ${reasons[0]}` : null,
  ].filter(Boolean).join("\n");
}

function TrophyMark() {
  return (
    <div
      className="relative grid h-16 w-16 place-items-center rounded-full"
      style={{
        background: `radial-gradient(circle at 35% 30%, ${SUN}, ${PEACH})`,
        border: `2px solid ${CARD}`,
        boxShadow: "0 16px 32px rgba(251, 146, 60, 0.22)",
      }}
      aria-hidden="true"
    >
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
        <path d="M5 6H3a3 3 0 0 0 3 3h1" />
        <path d="M19 6h2a3 3 0 0 1-3 3h-1" />
      </svg>
    </div>
  );
}

export default function ResultReceiptCard({
  challenge,
  judgment,
  shareUrl,
  className = "",
}: ResultReceiptCardProps) {
  const [shareState, setShareState] = useState<"idle" | "shared" | "failed">("idle");
  const reasons = useMemo(() => proofReasons(judgment.reasoning), [judgment.reasoning]);
  const opponent = participantName(findOpponent(challenge.participants ?? [], judgment.winnerId));
  const winner = judgment.winner?.username || "No clear winner";
  const familiar = "AI Familiar";
  const receiptUrl = shareUrl || (typeof window !== "undefined" ? window.location.href : "");
  const isSettled = challenge.status === "settled";

  const handleShare = async () => {
    const text = shareText(challenge, judgment, reasons);
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Quest Settled: ${challenge.title}`,
          text,
          url: receiptUrl || undefined,
        });
      } else {
        await navigator.clipboard.writeText(receiptUrl ? `${text}\n${receiptUrl}` : text);
      }
      setShareState("shared");
      setTimeout(() => setShareState("idle"), 2200);
    } catch {
      try {
        await navigator.clipboard.writeText(receiptUrl ? `${text}\n${receiptUrl}` : text);
        setShareState("shared");
        setTimeout(() => setShareState("idle"), 2200);
      } catch {
        setShareState("failed");
      }
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className={`result-receipt relative overflow-hidden p-5 sm:p-6 ${className}`}
      style={{
        color: INK,
      }}
      data-testid="result-receipt-card"
    >
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-60" style={{ background: PEACH }} aria-hidden="true" />
      <div className="absolute -bottom-10 left-6 h-24 w-24 rounded-full opacity-60" style={{ background: MINT }} aria-hidden="true" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: GRASS }}>
              {isSettled ? "Quest Settled" : "Result Receipt"}
            </p>
            <h3 className="mt-2 text-2xl font-black leading-tight sm:text-3xl" style={{ color: INK }}>
              {challenge.title || "Untitled quest"}
            </h3>
          </div>
          <TrophyMark />
        </div>

        <div className="mt-5 rounded-[24px] p-4" style={{ background: "rgba(255, 255, 255, 0.72)", border: `1px solid ${BORDER}` }}>
          <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
            Winner
          </p>
          <p className="mt-1 text-2xl font-black leading-tight" style={{ color: INK }}>
            {winner}
          </p>
          {opponent && (
            <p className="mt-1 text-sm font-bold" style={{ color: MUTED }}>
              Opponent: {opponent}
            </p>
          )}
          {!judgment.winner && (
            <p className="mt-2 rounded-full px-3 py-1 text-xs font-black inline-flex" style={{ background: PEACH, color: INK }}>
              Manual review or inconclusive result
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(255, 255, 255, 0.68)", border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              AI Familiar
            </p>
            <p className="mt-1 text-sm font-black" style={{ color: INK }}>
              {familiar}
            </p>
          </div>
          <div className="rounded-2xl px-4 py-3" style={{ background: "rgba(255, 255, 255, 0.68)", border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              Confidence
            </p>
            <p className="mt-1 text-sm font-black" style={{ color: INK }}>
              {confidenceLabel(judgment.confidence)}
            </p>
          </div>
          <div className="col-span-2 rounded-2xl px-4 py-3" style={{ background: "rgba(255, 255, 255, 0.68)", border: `1px solid ${BORDER}` }}>
            <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
              Proof Type
            </p>
            <p className="mt-1 text-sm font-black" style={{ color: INK }}>
              {formatLabel(challenge.evidenceType)} proof
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] p-4" style={{ background: "rgba(255, 255, 255, 0.72)", border: `1px solid ${BORDER}` }}>
          <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
            Proof Reasons
          </p>
          <ul className="mt-3 space-y-2">
            {reasons.map((reason, index) => (
              <li key={`${reason}-${index}`} className="flex gap-2 text-sm font-semibold leading-relaxed" style={{ color: INK }}>
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black"
                  style={{ background: MINT, color: INK }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>

        <button
          type="button"
          onClick={() => void handleShare()}
          className="quest-primary-button mt-5 inline-flex w-full items-center justify-center gap-2 px-5 py-3.5 text-sm font-black"
          style={{ color: INK }}
        >
          <QuestGlyph className="h-4 w-4" kind="receipt" />
          {shareState === "shared" ? "Receipt Copied" : shareState === "failed" ? "Copy Failed" : "Share Receipt"}
        </button>
      </div>
    </motion.article>
  );
}
