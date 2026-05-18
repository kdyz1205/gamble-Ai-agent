"use client";

import { useEffect, useState, use } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { acceptanceContract, compactChallengeRules, parseChallengeRules, settlementSummary } from "@/lib/challenge-display";
import { isAiReviewStatus, isEvidenceWindowStatus, isOpenForOpponentStatus } from "@/lib/challenge-state-machine";

interface Challenge {
  id: string;
  title: string;
  type: string;
  status: string;
  stake: number;
  deadline: string | null;
  rules: string | null;
  evidenceType: string;
  stakeToken: string;
  disputeWindow: string | null;
  proofWindow: string | null;
  settlementMode: string;
  fallbackRule: string | null;
  creator: { id: string; username: string };
}

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id: string; username: string } | undefined;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);

  useEffect(() => {
    api.getChallenge(id)
      .then((res) => {
        setChallenge(res.challenge);
        setLoading(false);
      })
      .catch(() => {
        setError("Can't find this challenge.");
        setLoading(false);
      });
  }, [id]);

  const handleAccept = async () => {
    if (!contractAccepted) {
      setError("Accept the rule contract first.");
      return;
    }
    if (!user) {
      setShowAuth(true);
      return;
    }
    setAccepting(true);
    setError(null);
    try {
      await api.acceptChallenge(id);
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept challenge.");
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <motion.div
          className="w-10 h-10 rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: PEACH, borderTopColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <span className="text-sm font-semibold" style={{ color: NAVY_DIM }}>
          Loading the challenge...
        </span>
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-base font-bold" style={{ color: ROSE_TEXT }}>
          {error}
        </p>
        <Link
          href="/"
          className="px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
          style={{
            color: PEACH_TEXT,
            background: PEACH,
            borderRadius: "9999px",
            boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
          }}
        >
          Create a new challenge
        </Link>
      </div>
    );
  }

  const c = challenge!;
  const stakeLabel = c.stake > 0 ? `${c.stake} cr` : "Free";
  const ruleCards = parseChallengeRules(c);
  const compactRules = compactChallengeRules(c);
  const contract = acceptanceContract(c);

  return (
    <div className="min-h-screen relative">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          LuckyPlay
        </Link>
      </header>

      <main className="relative z-10 max-w-lg mx-auto px-4 py-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 22 }}
          className="lp-glass overflow-hidden"
          style={{ borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
        >
          <div
            className="px-5 py-3 text-center"
            style={{
              background: `linear-gradient(90deg, ${PEACH}1A, ${LAVENDER}1A, ${MINT}1A)`,
              borderBottom: `1px solid ${NAVY_FAINT}`,
            }}
          >
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: PEACH_TEXT }}>
              You have been challenged
            </span>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-base font-extrabold"
                style={{ background: PEACH, color: PEACH_TEXT }}
              >
                {c.creator.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {c.creator.username}
                </p>
                <p className="text-xs font-medium" style={{ color: NAVY_DIM }}>
                  wants to challenge you
                </p>
              </div>
              <span
                className="ml-auto text-[11px] font-bold px-2.5 py-1"
                style={{ color: PEACH_TEXT, background: CREAM, borderRadius: "9999px" }}
              >
                {c.type}
              </span>
            </div>

            <h1 className="text-2xl font-extrabold mb-5 leading-tight" style={{ color: NAVY }}>
              {c.title}
            </h1>

            <div className="mb-5 px-4 py-3" style={{ background: `${MINT}14`, border: `1px solid ${MINT}55`, borderRadius: "16px" }}>
              <p className="text-[11px] font-black uppercase tracking-wider mb-1.5" style={{ color: MINT_TEXT }}>
                What you are joining
              </p>
              <p className="text-sm font-semibold leading-relaxed" style={{ color: NAVY }}>
                This is an AI-judged challenge between two people. Join only if you agree to the rules. Upload evidence when done. AI reviews the evidence and recommends a winner.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div
                className="px-3 py-3"
                style={{
                  background: `${c.stake > 0 ? PEACH : MINT}14`,
                  border: `1px solid ${(c.stake > 0 ? PEACH : MINT)}33`,
                  borderRadius: "16px",
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>
                  Stake
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {stakeLabel}
                </p>
              </div>
              <div
                className="px-3 py-3"
                style={{ background: `${MINT}14`, border: `1px solid ${MINT}33`, borderRadius: "16px" }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>
                  Evidence
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {c.evidenceType.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            <div className="grid gap-2 mb-5">
              {compactRules.map((card) => (
                <div
                  key={card.label}
                  className="px-4 py-3"
                  style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}
                >
                  <p className="text-[10px] font-black uppercase tracking-wider mb-1" style={{ color: MINT_TEXT }}>
                    {card.label}
                  </p>
                  <p className="text-sm font-semibold leading-relaxed" style={{ color: NAVY }}>
                    {card.value}
                  </p>
                </div>
              ))}
              {ruleCards.length > 0 && (
                <details className="px-4 py-3" style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}>
                  <summary className="cursor-pointer text-xs font-black" style={{ color: NAVY }}>
                    Full rule contract
                  </summary>
                  <div className="mt-3 grid gap-2">
                    {ruleCards.map((card) => (
                      <div key={card.label}>
                        <p className="text-[10px] font-black uppercase tracking-wider" style={{ color: NAVY_DIM }}>
                          {card.label}
                        </p>
                        <p className="text-xs font-semibold leading-relaxed" style={{ color: NAVY }}>
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <div className="mb-5 px-4 py-3" style={{ background: CREAM, border: "1px solid #FFE0CC", borderRadius: "16px" }}>
              <p className="text-[11px] font-black uppercase tracking-wider mb-2" style={{ color: PEACH_TEXT }}>
                Acceptance contract
              </p>
              <ul className="space-y-1.5 mb-3">
                {contract.map((item) => (
                  <li key={item} className="text-xs font-semibold leading-relaxed" style={{ color: NAVY }}>
                    - {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs font-bold mb-3" style={{ color: PEACH_TEXT }}>
                {settlementSummary(c)}
              </p>
              <label className="flex items-start gap-2 text-xs font-bold cursor-pointer" style={{ color: NAVY }}>
                <input
                  type="checkbox"
                  checked={contractAccepted}
                  onChange={(event) => setContractAccepted(event.target.checked)}
                  className="mt-0.5"
                />
                <span>I agree to these rules, evidence requirements, AI judging, dispute window, and credit settlement.</span>
              </label>
            </div>

            {c.deadline && (
              <div className="mb-5 px-4 py-2.5" style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: NAVY_DIM }}>
                  Deadline
                </p>
                <p className="text-sm font-bold" style={{ color: NAVY }}>
                  {new Date(c.deadline).toLocaleString()}
                </p>
              </div>
            )}

            <AnimatePresence mode="wait">
              {accepted ? (
                <motion.div
                  key="accepted"
                  className="text-center py-5"
                  style={{
                    background: MINT,
                    border: `1px solid ${MINT}`,
                    borderRadius: "20px",
                    boxShadow: "0 4px 14px 0 rgba(110,231,183,0.40)",
                  }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  <p className="text-lg font-extrabold mb-1" style={{ color: MINT_TEXT }}>
                    You are in.
                  </p>
                  <p className="text-sm font-medium" style={{ color: MINT_TEXT, opacity: 0.85 }}>
                    Submit your evidence before the deadline.
                  </p>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <Link
                      href={`/challenge/${id}`}
                      className="inline-block mt-4 px-5 py-2.5 text-sm font-bold active:scale-95 transition-transform"
                      style={{
                        background: "#FFFFFF",
                        color: MINT_TEXT,
                        border: `1px solid ${MINT}`,
                        borderRadius: "9999px",
                      }}
                    >
                      Go to the challenge
                    </Link>
                  </motion.div>
                </motion.div>
              ) : !isOpenForOpponentStatus(c.status) ? (
                <motion.div
                  key="closed"
                  className="text-center py-4"
                  style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}
                >
                  <p className="text-sm font-bold" style={{ color: NAVY_DIM }}>
                    {isEvidenceWindowStatus(c.status)
                      ? "Challenge is live. Go submit evidence."
                      : isAiReviewStatus(c.status)
                        ? "AI is reviewing."
                        : c.status === "settled"
                          ? "Already settled."
                          : "This challenge is no longer open."}
                  </p>
                </motion.div>
              ) : (
                <motion.button
                  key="accept"
                  onClick={handleAccept}
                  disabled={accepting || !contractAccepted}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="w-full py-4 text-base font-extrabold disabled:opacity-60"
                  style={{
                    background: accepting || !contractAccepted ? NAVY_FAINT : PEACH,
                    color: accepting || !contractAccepted ? NAVY_DIM : PEACH_TEXT,
                    borderRadius: "9999px",
                    boxShadow: accepting || !contractAccepted ? "none" : `0 4px 14px 0 ${ORANGE_GLOW}`,
                  }}
                >
                  {accepting ? "Joining..." : c.stake > 0 ? `Accept rules - risk ${stakeLabel}` : "Accept rules and join"}
                </motion.button>
              )}
            </AnimatePresence>

            {error && !accepted && (
              <p
                className="text-xs font-semibold text-center mt-3 px-3 py-2"
                style={{ color: ROSE_TEXT, background: ROSE_BG, borderRadius: "12px" }}
              >
                {error}
              </p>
            )}

            {!user && !accepted && (
              <p className="text-sm font-medium text-center mt-3" style={{ color: NAVY_DIM }}>
                <button
                  onClick={() => setShowAuth(true)}
                  className="font-extrabold underline decoration-dotted"
                  style={{ color: PEACH_TEXT }}
                >
                  Sign in
                </button>{" "}
                to accept this challenge
              </p>
            )}
          </div>
        </motion.div>
      </main>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
