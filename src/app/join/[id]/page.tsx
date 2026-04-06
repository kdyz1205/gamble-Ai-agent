"use client";

import { useState, useEffect, use } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
      .catch(() => { setError("Contract not found in the archives"); setLoading(false); });
  }, [id]);

  const handleAccept = async () => {
    if (!user) { setShowAuth(true); return; }
    setAccepting(true);
    try {
      await api.acceptChallenge(id);
      setAccepted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept the contract");
    }
    setAccepting(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0A0A0B" }}>
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-t-transparent"
          style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
        <span className="text-[10px] font-mono tracking-[0.3em] text-[#8b8b83] uppercase">Retrieving Contract...</span>
      </div>
    );
  }

  if (error && !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0A0A0B" }}>
        <p className="text-lg font-serif" style={{ color: "#A31F34" }}>{error}</p>
        <Link href="/" className="text-xs font-mono text-[#8b8b83] underline tracking-wider uppercase">Return to the Tribunal</Link>
      </div>
    );
  }

  const c = challenge!;
  const stakeLabel = c.stake > 0 ? `${c.stake} credits` : "No stake";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative overflow-hidden" style={{ background: "#0A0A0B" }}>
      {/* Ambient gold radiance */}
      <div
        className="pointer-events-none absolute w-[600px] h-[600px] rounded-full opacity-[0.04] blur-[150px]"
        style={{ background: "#D4AF37", top: "-15%", left: "-15%" }}
      />
      <div
        className="pointer-events-none absolute w-[400px] h-[400px] rounded-full opacity-[0.03] blur-[120px]"
        style={{ background: "#005F6F", bottom: "-10%", right: "-10%" }}
      />

      <motion.div
        className="w-full max-w-md overflow-hidden"
        style={{
          background: "linear-gradient(180deg, #16160F 0%, #0E0E0C 100%)",
          border: "1px solid rgba(212,175,55,0.12)",
          boxShadow: "inset 0 1px 0 rgba(212,175,55,0.08), 0 24px 80px rgba(0,0,0,0.7)",
          borderRadius: "2px",
        }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Gold accent line */}
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, #D4AF37, transparent)" }} />

        {/* Sacred header */}
        <div className="text-center py-4 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
          <span className="text-[9px] font-mono tracking-[0.4em] uppercase" style={{ color: "#D4AF37" }}>
            Lex Divina • Summons
          </span>
        </div>

        <div className="p-6">
          {/* Creator info */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 flex items-center justify-center text-sm font-serif font-bold"
                 style={{
                   background: "radial-gradient(circle at 50% 30%, #2a2820, #0E0E0C)",
                   border: "1px solid rgba(212,175,55,0.25)",
                   color: "#D4AF37",
                   borderRadius: "2px",
                 }}>
              {c.creator.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-serif font-bold" style={{ color: "#E5E0D8" }}>{c.creator.username}</p>
              <p className="text-[10px] font-mono tracking-wider" style={{ color: "#8b8b83" }}>has summoned you</p>
            </div>
            <span className="ml-auto px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-[0.15em]"
                  style={{ background: "rgba(212,175,55,0.08)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.15)", borderRadius: "1px" }}>
              {c.type}
            </span>
          </div>

          {/* Challenge title */}
          <h1 className="text-2xl font-serif font-bold mb-5 leading-snug" style={{ color: "#E5E0D8" }}>{c.title}</h1>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="px-3 py-3" style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.08)", borderRadius: "1px" }}>
              <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>Stake</p>
              <p className="text-sm font-serif font-bold" style={{ color: c.stake > 0 ? "#D4AF37" : "#005F6F" }}>{stakeLabel}</p>
            </div>
            <div className="px-3 py-3" style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.08)", borderRadius: "1px" }}>
              <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>Evidence</p>
              <p className="text-sm font-serif font-bold" style={{ color: "#E5E0D8" }}>{c.evidenceType.replace(/_/g, " ")}</p>
            </div>
          </div>

          {c.rules && (
            <div className="mb-5 px-3 py-2.5" style={{ borderLeft: "2px solid rgba(212,175,55,0.2)", background: "rgba(212,175,55,0.03)" }}>
              <p className="text-[10px] font-mono italic leading-relaxed" style={{ color: "#8b8b83" }}>
                &ldquo;{c.rules}&rdquo;
              </p>
            </div>
          )}

          {/* Accept / Status */}
          <AnimatePresence mode="wait">
            {accepted ? (
              <motion.div
                key="accepted"
                className="text-center py-6 relative overflow-hidden"
                style={{ background: "rgba(99,154,103,0.06)", border: "1px solid rgba(99,154,103,0.15)", borderRadius: "1px" }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <motion.div
                  className="mx-auto mb-3 w-12 h-12 flex items-center justify-center"
                  style={{ border: "1px solid rgba(99,154,103,0.3)", borderRadius: "50%" }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#639A67" strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </motion.div>
                <p className="text-xl font-serif font-bold mb-1" style={{ color: "#639A67" }}>Oath Sealed</p>
                <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Submit your evidence before the deadline</p>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <Link
                    href={`/challenge/${id}`}
                    className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                    style={{ background: "rgba(99,154,103,0.12)", border: "1px solid rgba(99,154,103,0.25)", color: "#639A67", borderRadius: "1px" }}
                  >
                    Enter the Arena
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </motion.div>
              </motion.div>
            ) : c.status !== "open" ? (
              <motion.div
                key="closed"
                className="text-center py-5"
                style={{ background: "rgba(212,175,55,0.03)", border: "1px solid rgba(212,175,55,0.08)", borderRadius: "1px" }}
              >
                <p className="text-sm font-mono" style={{ color: "#8b8b83" }}>
                  {c.status === "live" ? "[ TRIBUNAL IN SESSION ]" : c.status === "settled" ? "[ JUDGMENT RENDERED ]" : "[ CONTRACT VOID ]"}
                </p>
              </motion.div>
            ) : (
              <motion.button
                key="accept"
                onClick={handleAccept}
                disabled={accepting}
                whileHover={{ y: -2, boxShadow: "0 8px 40px rgba(212,175,55,0.25), inset 0 1px 0 rgba(212,175,55,0.3)" }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-4 text-sm font-mono font-bold uppercase tracking-[0.2em] transition-all"
                style={{
                  background: accepting ? "#1C1C14" : "linear-gradient(135deg, #D4AF37, #A38829)",
                  color: accepting ? "#8b8b83" : "#0A0A0B",
                  border: "1px solid rgba(212,175,55,0.4)",
                  boxShadow: "0 4px 24px rgba(212,175,55,0.15), inset 0 1px 0 rgba(255,255,255,0.15)",
                  borderRadius: "1px",
                }}
              >
                {accepting ? "Aligning Cylinders..." : `Accept the Contract${c.stake > 0 ? ` — ${stakeLabel}` : ""}`}
              </motion.button>
            )}
          </AnimatePresence>

          {error && !accepted && (
            <p className="text-xs font-mono text-center mt-3" style={{ color: "#A31F34" }}>{error}</p>
          )}

          {!user && !accepted && (
            <p className="text-xs font-mono text-center mt-3" style={{ color: "#8b8b83" }}>
              You must{" "}
              <button onClick={() => setShowAuth(true)} className="underline font-bold" style={{ color: "#D4AF37" }}>enter the tribunal</button>
              {" "}to accept
            </p>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.15), transparent)" }} />
      </motion.div>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    </div>
  );
}
