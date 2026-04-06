"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ChallengeVerdictPanel from "@/components/ChallengeVerdictPanel";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";

export default function RoomClient({
  challengeId,
  title,
}: {
  challengeId: string;
  title: string;
}) {
  const { data: session, update: updateSession } = useSession();
  const user = session?.user as
    | { id: string; username: string; credits?: number; image?: string | null }
    | undefined;
  const router = useRouter();

  const [showAuth, setShowAuth] = useState(false);
  const [joinMsg, setJoinMsg] = useState("");

  const handleAccept = useCallback(async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }
    try {
      await api.acceptChallenge(challengeId);
      setJoinMsg("You joined the challenge. Submit your evidence below.");
      await updateSession();
    } catch (err) {
      setJoinMsg(
        err instanceof Error
          ? err.message
          : "Could not join — you may already be in this challenge.",
      );
    }
  }, [challengeId, user, updateSession]);

  const creditsBadge = user ? (
    <span
      className="px-2 py-0.5 rounded-md text-[9px] font-black"
      style={{
        background:
          (user.credits ?? 0) > 0
            ? "rgba(0,232,122,0.15)"
            : "rgba(255,59,48,0.15)",
        color: (user.credits ?? 0) > 0 ? "#00e87a" : "#ff3b30",
        border: `1px solid ${(user.credits ?? 0) > 0 ? "rgba(0,232,122,0.3)" : "rgba(255,59,48,0.3)"}`,
      }}
    >
      {user.credits ?? 0} credits
    </span>
  ) : null;

  return (
    <div
      className="relative min-h-screen"
      style={{ background: "#06060f" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-30 glass-panel"
        style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}
      >
        <div className="plasma-line" />
        <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
          <motion.button
            onClick={() => router.push("/")}
            className="flex items-center gap-2.5 group"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
                boxShadow: "0 0 16px rgba(124,92,252,0.4)",
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-sm font-extrabold text-text-primary group-hover:text-white transition-colors">
              ChallengeAI
            </span>
          </motion.button>

          <div className="flex items-center gap-2.5">
            <motion.button
              onClick={() => router.push("/")}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted border border-border-subtle"
              style={{ background: "rgba(255,255,255,0.04)" }}
              whileHover={{
                color: "#f0f0ff",
                background: "rgba(255,255,255,0.08)",
              }}
              whileTap={{ scale: 0.96 }}
            >
              New Challenge
            </motion.button>

            {user ? (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white"
                  style={{
                    background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
                  }}
                >
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-text-secondary">
                  {user.username}
                </span>
                {creditsBadge}
              </div>
            ) : (
              <motion.button
                onClick={() => setShowAuth(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                style={{
                  background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Sign In
              </motion.button>
            )}
          </div>
        </div>
      </header>

      {/* Room content */}
      <main className="max-w-2xl mx-auto px-4 pt-6 pb-32 space-y-4">
        {/* Join message */}
        {joinMsg && (
          <div
            className="rounded-xl px-4 py-3 text-xs font-bold"
            style={{
              background: "rgba(0,232,122,0.06)",
              border: "1px solid rgba(0,232,122,0.12)",
              color: "#00e87a",
            }}
          >
            {joinMsg}
          </div>
        )}

        {/* Verdict panel — the core room UI */}
        {user ? (
          <ChallengeVerdictPanel
            challengeId={challengeId}
            userId={user.id}
            credits={user.credits ?? 0}
            onCreditsMayChange={() => updateSession()}
          />
        ) : (
          <div
            className="rounded-2xl p-8 text-center space-y-4"
            style={{
              background:
                "linear-gradient(165deg, rgba(18,18,40,0.98) 0%, rgba(8,8,20,0.98) 100%)",
              border: "1px solid rgba(124,92,252,0.15)",
            }}
          >
            <h2 className="text-xl font-black text-text-primary">{title}</h2>
            <p className="text-sm text-text-muted">
              Sign in to view details, submit evidence, or accept this
              challenge.
            </p>
            <motion.button
              onClick={() => setShowAuth(true)}
              className="px-6 py-3 rounded-xl text-sm font-extrabold text-white"
              style={{
                background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                boxShadow: "0 4px 20px rgba(124,92,252,0.35)",
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Sign In to Continue
            </motion.button>
          </div>
        )}

        {/* Accept button for non-participants */}
        {user && (
          <div className="flex flex-wrap gap-2 justify-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-white"
              style={{
                background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                boxShadow: "0 4px 20px rgba(124,92,252,0.3)",
              }}
              onClick={handleAccept}
            >
              I&apos;m the opponent — Accept
            </motion.button>
          </div>
        )}
      </main>

      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => updateSession()}
      />
    </div>
  );
}
