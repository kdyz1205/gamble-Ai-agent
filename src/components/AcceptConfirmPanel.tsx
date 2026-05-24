"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import * as api from "@/lib/api-client";
import { acceptanceContract, parseChallengeRules, settlementSummary } from "@/lib/challenge-display";

interface Props {
  challenge: {
    id: string;
    title: string;
    stake: number;
    rules: string | null;
    type: string;
    evidenceType?: string | null;
    stakeToken?: string | null;
    disputeWindow?: string | null;
  };
  userCredits: number;
  onConfirmed: (challengeId: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

export default function AcceptConfirmPanel({ challenge, userCredits, onConfirmed, onCancel, onError }: Props) {
  const [accepting, setAccepting] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  const insufficientFunds = challenge.stake > 0 && userCredits < challenge.stake;
  const ruleCards = parseChallengeRules(challenge);
  const contract = acceptanceContract(challenge);

  const handleAccept = async () => {
    if (insufficientFunds || accepting) return;
    if (!contractAccepted) {
      onError("Accept the rule contract first.");
      return;
    }
    setAccepting(true);
    try {
      await api.acceptChallenge(challenge.id, null, { acceptedRuleContract: true });
      onConfirmed(challenge.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to accept";
      onError(msg.includes("taken") ? "Too slow! This challenge was just taken." : msg);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(13,13,30,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}
    >
      <div className="h-0.5 bg-gradient-to-r from-accent via-teal to-accent" />
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-extrabold text-text-primary">{challenge.title}</h3>

        <div className="grid gap-2">
          {ruleCards.slice(0, 3).map((card) => (
            <div
              key={card.label}
              className="px-3 py-2.5 rounded-xl text-xs leading-relaxed"
              style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)" }}
            >
              <span className="font-bold text-amber-400 text-[10px] uppercase tracking-wider block mb-1">
                {card.label}
              </span>
              <span className="line-clamp-2 text-amber-100">{card.value}</span>
            </div>
          ))}
        </div>

        {challenge.stake > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
               style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}>
            <span className="text-xs text-text-secondary">You will lock</span>
            <span className="text-xl font-black text-[#f5a623]">{challenge.stake} credits</span>
          </div>
        )}

        {insufficientFunds && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
               style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.2)", color: "#ff3b30" }}>
            Insufficient funds. You have {userCredits} credits, need {challenge.stake}.
          </div>
        )}

        <div className="px-3 py-2.5 rounded-xl text-xs text-text-secondary space-y-2"
             style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="font-bold text-amber-300">{settlementSummary(challenge)}</p>
          <details>
            <summary className="cursor-pointer font-black uppercase tracking-wider text-[10px] text-text-primary">
              Full terms
            </summary>
            <ul className="mt-2 space-y-1">
              {contract.map((item) => (
                <li key={item}>- {item}</li>
              ))}
            </ul>
          </details>
          <label className="flex items-start gap-2 font-bold text-text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={contractAccepted}
              onChange={(event) => setContractAccepted(event.target.checked)}
              className="mt-0.5"
            />
            <span>I accept rules, AI judging, disputes, and credits.</span>
          </label>
        </div>

        <div className="flex gap-3">
          <motion.button
            onClick={handleAccept}
            disabled={insufficientFunds || accepting || !contractAccepted}
            whileHover={!insufficientFunds && contractAccepted ? { scale: 1.02 } : {}}
            whileTap={!insufficientFunds && contractAccepted ? { scale: 0.97 } : {}}
            className={`flex-1 py-3.5 rounded-xl text-sm font-extrabold transition-all ${
              insufficientFunds || !contractAccepted
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-accent to-teal text-white shadow-lg shadow-accent/30"
            }`}
          >
            {accepting ? "Locking..." : insufficientFunds ? "Insufficient Funds" : challenge.stake > 0 ? `Accept + lock ${challenge.stake}` : "Accept"}
          </motion.button>

          <motion.button
            onClick={onCancel}
            whileHover={{ background: "rgba(255,255,255,0.08)" }}
            whileTap={{ scale: 0.97 }}
            className="px-5 py-3.5 rounded-xl text-sm font-bold text-text-secondary border border-border-subtle"
          >
            Cancel
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
