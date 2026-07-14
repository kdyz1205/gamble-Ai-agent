"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestGlyph from "@/components/world/QuestGlyph";
import QuestWorldScene from "@/components/world/QuestWorldScene";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

const INK = "var(--sum-ink)";
const MUTED = "var(--sum-muted)";
const CARD = "var(--sum-card)";
const BORDER = "var(--sum-border)";
const PEACH = "var(--sum-peach)";
const MINT = "var(--sum-mint)";
const GRASS = "var(--sum-grass)";
const SUN = "var(--sum-sun)";
const SHADOW = "var(--sum-shadow-soft)";

function formatLabel(value?: string | null) {
  if (!value) return "Proof";

  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .trim();
}

function oneSentence(value: string | null | undefined, fallback: string) {
  const raw = (value || fallback).replace(/\s+/g, " ").trim();
  if (!raw) return fallback;

  const firstSentence = raw.match(/^(.+?[.!?])(\s|$)/)?.[1] ?? raw;
  return firstSentence.length > 155
    ? `${firstSentence.slice(0, 152).trim()}...`
    : firstSentence;
}

function formatTime(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusMessage(status: string) {
  switch (status) {
    case "live":
      return "This quest is already live. Open the quest room to submit proof.";
    case "judging":
      return "The AI Familiar is already reviewing this quest.";
    case "pending_settlement":
      return "This quest is waiting for the result receipt.";
    case "settled":
      return "This quest already has a result receipt.";
    case "cancelled":
      return "This quest is no longer active.";
    case "disputed":
      return "This quest is under review.";
    default:
      return "This quest is no longer open.";
  }
}

export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id: string; username: string } | undefined;

  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    api.getChallenge(id)
      .then(res => { setChallenge(res.challenge); setLoading(false); })
      .catch(() => { setError("Can't find this quest."); setLoading(false); });
  }, [id]);

  const handleAccept = async () => {
    if (!user) { setShowAuth(true); return; }
    setAccepting(true);
    try {
      await api.acceptChallenge(id);
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept");
    }
    setAccepting(false);
  };

  if (loading) {
    return (
      <div className="sum-map-world min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <motion.div
          className="h-14 w-14 rounded-full border-[5px] border-t-transparent"
          style={{ borderColor: PEACH, borderTopColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <span className="text-sm font-extrabold" style={{ color: MUTED }}>
          Opening the quest portal...
        </span>
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="sum-map-world min-h-screen flex flex-col items-center justify-center gap-5 px-5 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-full text-3xl font-black"
          style={{ background: CARD, border: `1px solid ${BORDER}`, color: INK, boxShadow: SHADOW }}
          aria-hidden="true"
        >
          ?
        </div>
        <div>
          <p className="text-lg font-black" style={{ color: INK }}>
            Quest portal not found
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: MUTED }}>
            {error}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full px-5 py-3 text-sm font-black active:scale-95 transition-transform"
          style={{ color: INK, background: PEACH, boxShadow: "0 12px 24px rgba(251, 146, 60, 0.22)" }}
        >
          Summon a Quest
        </Link>
      </div>
    );
  }

  const c = challenge!;
  const summoner = c.creator?.username || "A Summoner";
  const hasStake = Number(c.stake) > 0;
  const stakeLabel = `${c.stake} credits`;
  const proofRequired = c.evidenceType
    ? `${formatLabel(c.evidenceType)} proof`
    : `${formatLabel(c.proofSource)} proof`;
  const deadline = formatTime(c.deadline);
  const questTiming = c.proofWindow || c.joinWindow || deadline;
  const summary = oneSentence(
    c.description || c.proposition || c.rules,
    `${summoner} is inviting you to complete this quest and submit ${proofRequired.toLowerCase()}.`
  );
  const judgeCopy = c.aiReview === false
    ? "Summoner review is enabled for submitted proof."
    : c.arbiter
      ? `${formatLabel(c.arbiter)} Familiar reviews the submitted proof.`
      : "AI Familiar reviews the submitted proof and explains the result.";
  const fallbackRules = c.rules || c.proposition || summary;

  return (
    <div className="quest-invite-world sum-map-world min-h-screen relative overflow-hidden">
      <div
        className="sum-quest-orb absolute left-6 top-24 h-16 w-16 opacity-80"
        style={{ background: PEACH }}
        aria-hidden="true"
      />
      <div
        className="sum-quest-orb absolute right-4 top-52 h-10 w-10 opacity-75"
        style={{ background: SUN }}
        aria-hidden="true"
      />
      <div
        className="sum-quest-orb absolute bottom-20 left-10 h-12 w-12 opacity-70"
        style={{ background: MINT }}
        aria-hidden="true"
      />

      <header className="relative z-20 mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="summoner-wordmark text-base" style={{ color: INK }}>
          <span className="summoner-wordmark__crest h-9 w-9"><QuestGlyph className="h-4 w-4" kind="spark" /></span>
          Summoner<span className="ml-[-0.55rem] text-[#e85f4e]">.world</span>
        </Link>
        <span className="sum-sticker-badge px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: INK }}>
          Quest invite
        </span>
      </header>

      <main className="relative z-10 mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-7 px-4 py-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)]">
        <aside className="hidden lg:block">
          <QuestWorldScene compact />
          <p className="mx-auto -mt-4 w-[84%] rounded-[1.25rem] border-2 border-white/80 bg-[rgba(255,253,244,0.9)] px-4 py-3 text-center text-xs font-black text-[color:var(--sum-ink)] shadow-[0_7px_0_rgba(23,53,75,0.08)]">
            A shared quest starts only after both friends agree.
          </p>
        </aside>
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="quest-invitation w-full overflow-hidden"
          style={{ boxShadow: SHADOW }}
        >
          <div
            className="relative px-5 py-5 pr-24"
            style={{ borderBottom: `1px solid ${BORDER}`, background: "rgba(255, 255, 255, 0.64)" }}
          >
            <span className="absolute right-5 top-4 grid h-16 w-16 place-items-center rounded-full border-2 border-dashed border-[#e85f4e] bg-[#fff7d5]">
              <PicoFamiliar className="h-14 w-14" mood="guide" />
            </span>
            <p className="text-xs font-black uppercase tracking-[0.18em]" style={{ color: GRASS }}>
              Sealed by Pico
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-3xl" style={{ color: INK }}>
              {summoner} summoned a quest for you
            </h1>
          </div>

          <div className="p-5 sm:p-6">
            <div className="mb-5 flex items-start gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-black"
                style={{ background: PEACH, color: INK, boxShadow: "0 10px 20px rgba(251, 146, 60, 0.2)" }}
                aria-hidden="true"
              >
                {summoner.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                  Quest Title
                </p>
                <h2 className="mt-1 text-xl font-black leading-snug sm:text-2xl" style={{ color: INK }}>
                  {c.title}
                </h2>
              </div>
            </div>

            <p className="mb-5 text-base font-semibold leading-relaxed" style={{ color: MUTED }}>
              {summary}
            </p>

            <div className="grid gap-3">
              <div
                className="rounded-2xl px-4 py-3"
                style={{ background: "rgba(167, 243, 208, 0.32)", border: `1px solid ${BORDER}` }}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                  Proof Required
                </p>
                <p className="mt-1 text-sm font-black" style={{ color: INK }}>
                  {proofRequired}
                </p>
              </div>

              <div
                className="rounded-2xl px-4 py-3"
                style={{ background: "rgba(255, 255, 255, 0.72)", border: `1px solid ${BORDER}` }}
              >
                <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                  AI Familiar Judge
                </p>
                <p className="mt-1 text-sm font-bold leading-relaxed" style={{ color: INK }}>
                  {judgeCopy}
                </p>
              </div>

              <div className={`grid gap-3 ${hasStake && questTiming ? "sm:grid-cols-2" : ""}`}>
                {questTiming && (
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{ background: "rgba(255, 229, 180, 0.42)", border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                      Timing
                    </p>
                    <p className="mt-1 text-sm font-black" style={{ color: INK }}>
                      {questTiming}
                    </p>
                  </div>
                )}

                {hasStake && (
                  <div
                    className="rounded-2xl px-4 py-3"
                    style={{ background: "rgba(255, 190, 146, 0.32)", border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                      Quest Credits
                    </p>
                    <p className="mt-1 text-sm font-black" style={{ color: INK }}>
                      {stakeLabel}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence initial={false}>
              {showRules && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -4 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="rounded-2xl px-4 py-3" style={{ background: CARD, border: `1px solid ${BORDER}` }}>
                    <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: MUTED }}>
                      Quest Rules
                    </p>
                    <p className="mt-2 text-sm font-semibold leading-relaxed" style={{ color: INK }}>
                      {fallbackRules}
                    </p>
                    {deadline && (
                      <p className="mt-3 text-xs font-bold" style={{ color: MUTED }}>
                        Deadline: {deadline}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-6 grid gap-3">
              <AnimatePresence mode="wait">
                {accepted ? (
                  <motion.div
                    key="accepted"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-3xl px-5 py-5 text-center"
                    style={{ background: "rgba(167, 243, 208, 0.48)", border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-lg font-black" style={{ color: INK }}>
                      Quest accepted
                    </p>
                    <p className="mt-1 text-sm font-semibold" style={{ color: MUTED }}>
                      Your next step is to enter the quest room and submit proof.
                    </p>
                    <Link
                      href={`/challenge/${id}`}
                      className="mt-4 inline-flex rounded-full px-5 py-2.5 text-sm font-black active:scale-95 transition-transform"
                      style={{ background: CARD, border: `1px solid ${BORDER}`, color: INK }}
                    >
                      Go to Quest
                    </Link>
                  </motion.div>
                ) : c.status !== "open" ? (
                  <motion.div
                    key="closed"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl px-4 py-4 text-center"
                    style={{ background: CARD, border: `1px solid ${BORDER}` }}
                  >
                    <p className="text-sm font-black" style={{ color: INK }}>
                      {statusMessage(c.status)}
                    </p>
                  </motion.div>
                ) : (
                  <motion.button
                    key="accept"
                    type="button"
                    onClick={handleAccept}
                    disabled={accepting}
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: "spring", stiffness: 420, damping: 24 }}
                    className="quest-primary-button w-full px-5 py-4 text-base font-black disabled:opacity-60"
                    style={{
                      background: accepting ? BORDER : undefined,
                      color: INK,
                      boxShadow: accepting ? "none" : undefined,
                    }}
                  >
                    {accepting ? "Accepting Quest..." : "Accept Quest"}
                  </motion.button>
                )}
              </AnimatePresence>

              {!accepted && (
                <button
                  type="button"
                  onClick={() => setShowRules(value => !value)}
                  className="w-full rounded-full px-5 py-3 text-sm font-black active:scale-95 transition-transform"
                  style={{ background: CARD, border: `1px solid ${BORDER}`, color: INK }}
                >
                  View Rules
                </button>
              )}
            </div>

            {error && !accepted && (
              <p
                className="mt-4 rounded-2xl px-4 py-3 text-center text-sm font-bold"
                style={{ color: "#991B1B", background: "#FEE2E2", border: "1px solid #FECACA" }}
              >
                {error}
              </p>
            )}

            {!user && !accepted && (
              <p className="mt-4 text-center text-sm font-semibold" style={{ color: MUTED }}>
                <button
                  type="button"
                  onClick={() => setShowAuth(true)}
                  className="font-black underline decoration-dotted underline-offset-4"
                  style={{ color: INK }}
                >
                  Sign in
                </button>
                {" "}to accept this quest.
              </p>
            )}
          </div>
        </motion.section>
      </main>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
