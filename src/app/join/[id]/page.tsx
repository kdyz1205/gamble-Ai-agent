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
    <div className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "#06060f" }}>
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
        <div className="h-1" style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }} />

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
              className="text-center py-4 rounded-xl"
              style={{ background: "rgba(0,232,122,0.1)", border: "1px solid rgba(0,232,122,0.2)" }}
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
            >
              <p className="text-lg font-extrabold text-green-400 mb-1">You&apos;re In!</p>
              <p className="text-xs text-text-secondary">Submit your evidence before the deadline</p>
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
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="w-full py-4 rounded-xl text-base font-extrabold text-white"
              style={{
                background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                boxShadow: `0 4px 20px ${color}50`,
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
