"use client";

import { useState, useEffect, use } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";

interface Challenge {
  id: string;
  title: string;
  type: string;
  status: string;
  stake: number;
  deadline: string | null;
  rules: string | null;
  evidenceType: string;
  creator: { id: string; username: string };
}

const TYPE_COLORS: Record<string, string> = {
  Fitness: "#7c5cfc", Cooking: "#f5a623", Learning: "#00d4c8",
  Coding: "#0ea5e9", Games: "#ec4899", General: "#7c5cfc",
};

export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id: string; username: string } | undefined;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [accepted, setAccepted]   = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showAuth, setShowAuth]   = useState(false);

  useEffect(() => {
    api.getChallenge(id)
      .then(res => { setChallenge(res.challenge); setLoading(false); })
      .catch(() => { setError("Challenge not found"); setLoading(false); });
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#06060f" }}>
        <motion.div
          className="w-8 h-8 rounded-full border-2 border-t-transparent"
          style={{ borderColor: "#7c5cfc", borderTopColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#06060f" }}>
        <p className="text-lg font-bold text-red-400">{error}</p>
        <Link href="/" className="text-sm text-text-secondary underline">Create your own challenge</Link>
      </div>
    );
  }

  const c = challenge!;
  const color = TYPE_COLORS[c.type] || TYPE_COLORS.General;
  const stakeLabel = c.stake > 0 ? `${c.stake} credits` : "Free";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden" style={{ background: "#06060f" }}>
      {/* Background gradient orbs */}
      <div
        className="pointer-events-none absolute w-[500px] h-[500px] rounded-full opacity-[0.07] blur-[120px]"
        style={{ background: color, top: "-10%", left: "-10%" }}
      />
      <div
        className="pointer-events-none absolute w-[400px] h-[400px] rounded-full opacity-[0.05] blur-[100px]"
        style={{ background: color, bottom: "-10%", right: "-15%" }}
      />

      <motion.div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "rgba(13,13,30,0.95)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 40px ${color}15`,
        }}
        initial={{ opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Top bar */}
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}80, ${color})`, backgroundSize: "200% 100%", animation: "gradient-drift 4s linear infinite" }} />

        <div className="p-6">
          {/* Creator info */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                 style={{ background: `linear-gradient(135deg, ${color}, ${color}80)` }}>
              {c.creator.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-text-primary">{c.creator.username}</p>
              <p className="text-xs text-text-muted">challenged you</p>
            </div>
            <span className="ml-auto px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase"
                  style={{ background: `${color}20`, color, border: `1px solid ${color}30` }}>
              {c.type}
            </span>
          </div>

          {/* Challenge title */}
          <h1 className="text-xl font-extrabold text-text-primary mb-4 leading-snug">{c.title}</h1>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] font-bold uppercase text-text-muted mb-0.5">Stake</p>
              <p className="text-sm font-bold" style={{ color: c.stake > 0 ? "#f5a623" : "#00d4c8" }}>{stakeLabel}</p>
            </div>
            <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[9px] font-bold uppercase text-text-muted mb-0.5">Evidence</p>
              <p className="text-sm font-bold text-text-primary">{c.evidenceType.replace(/_/g, " ")}</p>
            </div>
          </div>

          {c.rules && (
            <p className="text-xs text-text-tertiary mb-5 px-3 py-2 rounded-lg"
               style={{ background: "rgba(255,255,255,0.03)" }}>
              {c.rules}
            </p>
          )}

          {/* Accept button */}
          {accepted ? (
            <motion.div
              className="text-center py-5 rounded-xl relative overflow-hidden"
              style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.2)" }}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
            >
              {/* Green glow burst */}
              <motion.div
                className="absolute inset-0 rounded-xl pointer-events-none"
                style={{ background: "radial-gradient(circle at center, rgba(0,232,122,0.25) 0%, transparent 70%)" }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: [0, 1, 0.3], scale: [0.5, 1.2, 1] }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
              {/* Checkmark icon */}
              <motion.div
                className="relative mx-auto mb-2 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,232,122,0.2)" }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.1 }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </motion.div>
              <p className="relative text-lg font-extrabold text-green-400 mb-1">You&apos;re In!</p>
              <p className="relative text-xs text-text-secondary">Submit your evidence before the deadline</p>
              {/* Go to Challenge link - appears after delay */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              >
                <Link
                  href={`/challenge/${id}`}
                  className="relative inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-lg text-xs font-bold text-white transition-colors"
                  style={{ background: "rgba(0,232,122,0.2)", border: "1px solid rgba(0,232,122,0.3)" }}
                >
                  Go to Challenge
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </Link>
              </motion.div>
            </motion.div>
          ) : c.status !== "open" ? (
            <div className="text-center py-4 rounded-xl"
                 style={{ background: "rgba(255,255,255,0.04)" }}>
              <p className="text-sm font-bold text-text-muted">
                {c.status === "live" ? "Already matched" : c.status === "settled" ? "Already settled" : "Not available"}
              </p>
            </div>
          ) : (
            <motion.button
              onClick={handleAccept}
              disabled={accepting}
              whileHover={{ scale: 1.02, y: -1, boxShadow: `0 8px 36px ${color}70, 0 0 60px ${color}25` }}
              whileTap={{ scale: 0.97 }}
              className="shimmer-btn w-full py-4 rounded-xl text-base font-extrabold text-white relative overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                boxShadow: `0 4px 24px ${color}50, 0 0 40px ${color}15`,
                opacity: accepting ? 0.7 : 1,
              }}
            >
              {accepting ? "Joining..." : `Accept Challenge${c.stake > 0 ? ` — ${stakeLabel}` : ""}`}
            </motion.button>
          )}

          {error && !accepted && (
            <p className="text-xs text-red-400 text-center mt-3">{error}</p>
          )}

          {/* Sign in prompt */}
          {!user && !accepted && (
            <p className="text-xs text-text-muted text-center mt-3">
              You need to{" "}
              <button onClick={() => setShowAuth(true)} className="text-accent underline font-bold">sign in</button>
              {" "}to accept
            </p>
          )}
        </div>
      </motion.div>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
