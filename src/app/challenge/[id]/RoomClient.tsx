"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChallengeVerdictPanel from "@/components/ChallengeVerdictPanel";
import AuthModal from "@/components/AuthModal";

const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const CREAM = "#FFEDD5";

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

  return (
    <div className="relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <button
          onClick={() => router.push("/")}
          className="text-base font-bold tracking-tight active:scale-95 transition-transform"
          style={{ color: NAVY }}
        >
          LuckyPlay
        </button>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xs font-bold px-3 py-1.5 active:scale-95 transition-transform"
            style={{
              color: PEACH_TEXT,
              background: CREAM,
              border: "1px solid #FFE0CC",
              borderRadius: "9999px",
            }}
          >
            + New bet
          </Link>
          {user ? (
            <div
              className="flex items-center gap-2 px-3 py-1.5"
              style={{
                background: "#FFFFFF",
                border: `1px solid ${NAVY_FAINT}`,
                borderRadius: "9999px",
                boxShadow: "0 4px 14px 0 rgba(15,23,42,0.04)",
              }}
            >
              <span
                className="w-6 h-6 flex items-center justify-center text-[11px] font-bold"
                style={{ background: PEACH, color: PEACH_TEXT, borderRadius: "9999px" }}
              >
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-bold" style={{ color: NAVY }}>
                {user.username}
              </span>
              <span
                className="text-[11px] font-bold px-1.5 py-0.5"
                style={{ background: CREAM, color: PEACH_TEXT, borderRadius: "9999px" }}
              >
                {user.credits ?? 0}
              </span>
            </div>
          ) : (
            <motion.button
              onClick={() => setShowAuth(true)}
              whileTap={{ scale: 0.95 }}
              className="px-4 py-2 text-sm font-bold"
              style={{
                color: PEACH_TEXT,
                background: PEACH,
                borderRadius: "9999px",
                boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
              }}
            >
              Sign In
            </motion.button>
          )}
        </div>
      </header>

      <main className="relative z-10 max-w-xl mx-auto px-4 pt-2 pb-24 space-y-4">
        {user ? (
          <ChallengeVerdictPanel
            challengeId={challengeId}
            userId={user.id}
            credits={user.credits ?? 0}
            onCreditsMayChange={() => updateSession()}
          />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="lp-glass p-8 text-center"
            style={{ borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
          >
            <h2 className="text-xl font-extrabold mb-2" style={{ color: NAVY }}>
              {title}
            </h2>
            <p className="text-sm font-medium mb-5" style={{ color: NAVY_DIM }}>
              Sign in to view rules, accept the challenge contract, or submit evidence.
            </p>
            <motion.button
              onClick={() => setShowAuth(true)}
              whileTap={{ scale: 0.95 }}
              className="px-6 py-3 text-sm font-extrabold"
              style={{
                color: PEACH_TEXT,
                background: PEACH,
                borderRadius: "9999px",
                boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}`,
              }}
            >
              Sign In to Continue
            </motion.button>
          </motion.div>
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
