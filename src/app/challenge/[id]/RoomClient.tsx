"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChallengeVerdictPanel from "@/components/ChallengeVerdictPanel";
import AuthModal from "@/components/AuthModal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestGlyph from "@/components/world/QuestGlyph";
import * as api from "@/lib/api-client";

const MINT = "#BFF3C7";
const MINT_TEXT = "#157B58";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

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
  const [joinErr, setJoinErr] = useState(false);

  const handleAccept = useCallback(async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }

    try {
      await api.acceptChallenge(challengeId);
      setJoinMsg("You joined the quest. Submit your proof below.");
      setJoinErr(false);
      await updateSession();
    } catch (err) {
      setJoinMsg(err instanceof Error ? err.message : "Could not join — you may already be in this quest.");
      setJoinErr(true);
    }
  }, [challengeId, user, updateSession]);

  return (
    <div className="quest-room-world sum-map-world sum-world-shell relative min-h-screen">
      <header className="quest-hud">
        <button
          className="quest-hud__cluster text-base font-black tracking-tight text-[color:var(--sum-ink)] transition-transform active:scale-95"
          onClick={() => router.push("/enter")}
          type="button"
        >
          <PicoFamiliar className="h-11 w-11" />
          Summoner<span className="ml-[-0.5rem] text-[#e98648]">.world</span>
        </button>
        <div className="flex items-center gap-2">
          <Link className="sum-world-button inline-flex items-center gap-2 px-3 py-2 text-xs font-black" href="/summons">
            <QuestGlyph className="h-3.5 w-3.5" kind="spark" /> New quest
          </Link>
          {user ? (
            <div className="hidden items-center gap-2 rounded-full border border-[color:var(--sum-border)] bg-white px-2 py-1.5 shadow-[0_4px_14px_rgba(40,102,133,0.08)] sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[color:var(--sum-peach)] text-[11px] font-extrabold text-[color:var(--sum-ink)]">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="text-xs font-extrabold text-[color:var(--sum-ink)]">{user.username}</span>
              <span className="rounded-full bg-[#fff4dd] px-2 py-1 text-[10px] font-extrabold text-[#7c2d12]">{user.credits ?? 0} cr</span>
            </div>
          ) : (
            <motion.button
              className="sum-world-button px-4 py-2 text-sm font-extrabold"
              onClick={() => setShowAuth(true)}
              type="button"
              whileTap={{ scale: 0.95 }}
            >
              Sign in
            </motion.button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl space-y-5 px-4 pb-24 pt-5 sm:pt-7">
        <div className="quest-room-banner flex items-center gap-3 p-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[1.25rem] border-2 border-white bg-[#eafaff] shadow-[0_6px_0_rgba(23,53,75,0.08)]"><PicoFamiliar className="h-16 w-16" mood="referee" /></span>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2a9f84]">Shared quest camp</p>
            <h1 className="mt-1 text-lg font-extrabold leading-tight text-[color:var(--sum-ink)]">{title}</h1>
            <p className="mt-1 text-xs font-bold text-[color:var(--sum-muted)]">Players → proof → Familiar result → collectible receipt</p>
          </div>
        </div>

        {joinMsg && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[18px] px-4 py-3 text-sm font-bold"
            initial={{ opacity: 0, y: -4 }}
            style={{ background: joinErr ? ROSE_BG : MINT, color: joinErr ? ROSE_TEXT : MINT_TEXT }}
          >
            {joinMsg}
          </motion.div>
        )}

        {user ? (
          <ChallengeVerdictPanel
            challengeId={challengeId}
            credits={user.credits ?? 0}
            onCreditsMayChange={() => updateSession()}
            userId={user.id}
          />
        ) : (
          <motion.div animate={{ opacity: 1, y: 0 }} className="sum-world-panel p-7 text-center" initial={{ opacity: 0, y: 8 }}>
            <PicoFamiliar className="mx-auto h-24 w-24" />
            <h2 className="mt-2 text-xl font-extrabold text-[color:var(--sum-ink)]">Join this quest room</h2>
            <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">
              Sign in to see the shared rules, accept the challenge, and submit your own proof.
            </p>
            <motion.button className="sum-world-button mt-5 px-6 py-3 text-sm font-extrabold" onClick={() => setShowAuth(true)} whileTap={{ scale: 0.95 }}>
              Sign in to continue
            </motion.button>
          </motion.div>
        )}

        {user && (
          <div className="flex justify-center">
            <motion.button
              className="sum-world-button px-6 py-3 text-sm font-extrabold"
              onClick={handleAccept}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
            >
              Accept quest
            </motion.button>
          </div>
        )}
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
  );
}
