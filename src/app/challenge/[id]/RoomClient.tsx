"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ChallengeVerdictPanel from "@/components/ChallengeVerdictPanel";
import AuthModal from "@/components/AuthModal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
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
    <div className="sum-map-world sum-world-shell relative min-h-screen">
      <header className="relative z-20 flex items-center justify-between border-b border-[color:var(--sum-border)] bg-white/82 px-4 py-3 shadow-[0_8px_24px_rgba(40,102,133,0.08)] backdrop-blur-xl sm:px-6">
        <button
          className="flex items-center gap-2 text-base font-extrabold tracking-tight text-[color:var(--sum-ink)] transition-transform active:scale-95"
          onClick={() => router.push("/enter")}
          type="button"
        >
          <PicoFamiliar className="h-11 w-11" />
          Summoner<span className="ml-[-0.5rem] text-[#e98648]">.world</span>
        </button>
        <div className="flex items-center gap-2">
          <Link className="rounded-full border border-[color:var(--sum-border)] bg-white/80 px-3 py-2 text-xs font-extrabold text-[color:var(--sum-ink)]" href="/summons">
            + New quest
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

      <main className="relative z-10 mx-auto max-w-3xl space-y-4 px-4 pb-24 pt-5 sm:pt-7">
        <div className="flex items-center gap-3 rounded-[22px] border border-[color:var(--sum-border)] bg-white/72 p-3 backdrop-blur-xl">
          <PicoFamiliar className="h-16 w-16 shrink-0" mood="referee" />
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Quest room</p>
            <h1 className="mt-1 text-lg font-extrabold leading-tight text-[color:var(--sum-ink)]">{title}</h1>
            <p className="mt-1 text-xs font-semibold text-[color:var(--sum-muted)]">One shared place for players, proof, Familiar result, and receipt.</p>
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
