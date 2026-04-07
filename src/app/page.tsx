"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";

import CenteredComposer from "@/components/CenteredComposer";
import ConversationThread from "@/components/ConversationThread";
import type { Message } from "@/components/ConversationThread";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import { FloatingActionBar } from "@/components/SecondaryPanels";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";

/* ═══════════════════════════════════════════════════
   INSTANT DRAFT ENGINE — no Q&A, straight to draft
   ═══════════════════════════════════════════════════ */

type AppState = "idle" | "drafting" | "live";

function instantDraft(userInput: string): ChallengeDraft {
  const s = userInput.toLowerCase();

  let type = "General";
  if (/pushup|run|fitness|exercise|plank|squat|gym|workout|mile|km|walk|jog/.test(s)) type = "Fitness";
  else if (/cook|bake|food|pasta|recipe|dish|meal/.test(s))   type = "Cooking";
  else if (/code|coding|program|leetcode|dev|hack/.test(s))   type = "Coding";
  else if (/read|book|study|learn|exam|test|quiz/.test(s))    type = "Learning";
  else if (/chess|game|play|match|tournament|bet|赌|比/.test(s)) type = "Games";

  // Extract credits from input like "10 credits", "$10", "10c"
  let stake = 0;
  const creditMatch = s.match(/(\d+)\s*credit/i);
  const dollarMatch = s.match(/\$(\d+)/);
  if (creditMatch) stake = parseInt(creditMatch[1]);
  else if (dollarMatch) stake = parseInt(dollarMatch[1]);

  // Smart evidence detection
  let evidence = "Self-report";
  if (/video|录像|拍/.test(s))       evidence = "Video proof";
  else if (/photo|照片|pic/.test(s)) evidence = "Photo evidence";
  else if (/gps|location|跑/.test(s)) evidence = "GPS tracking";
  else if (type === "Fitness")        evidence = "Video proof";

  let title = userInput.charAt(0).toUpperCase() + userInput.slice(1);
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return {
    title,
    playerA: "You",
    playerB: null,
    type, stake,
    deadline: "24 hours",
    durationMinutes: 1440,
    rules: `${type} challenge — AI judges the result`,
    evidence, aiReview: true, isPublic: false,
  };
}

/* ═══════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════ */

export default function Home() {
  const { data: session, update: updateSession } = useSession();
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number; image?: string | null } | undefined;
  const user = rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined;

  const [appState, setAppState]           = useState<AppState>("idle");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [isTyping, setIsTyping]           = useState(false);
  const [draft, setDraft]                 = useState<ChallengeDraft | null>(null);
  const [showScanLine, setShowScanLine]   = useState(false);
  const [published, setPublished]         = useState(false);
  const [_challengeId, setChallengeId]     = useState<string | null>(null);
  const [shareLink, setShareLink]         = useState<string | null>(null);
  const [copied, setCopied]              = useState(false);

  const [showAuth, setShowAuth]           = useState(false);
  const [showProfile, setShowProfile]     = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowScanLine(true), 600);
    return () => clearTimeout(id);
  }, []);

  const pushMsg = useCallback((role: "user"|"ai", content: string, options?: string[]) => {
    setMessages(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      role, content, timestamp: new Date(), options,
    }]);
  }, []);

  const aiReply = useCallback((content: string, options?: string[], delay = 1100) => {
    setIsTyping(true);
    setTimeout(() => { setIsTyping(false); pushMsg("ai", content, options); }, delay);
  }, [pushMsg]);

  /* ── Submit → instant draft (no Q&A) ── */
  const handleInitialSubmit = useCallback((input: string) => {
    pushMsg("user", input);
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const d = instantDraft(input);
      setDraft(d);
      pushMsg("ai", `**${d.type}** challenge ready — ${d.stake > 0 ? `${d.stake} credits` : "free"} — ${d.evidence}. Hit **Publish** to get a share link, or edit below.`);
      setAppState("drafting");
    }, 600);
  }, [pushMsg]);

  /* ── Follow-up in draft mode (edit via text) ── */
  const handleFollowUp = useCallback((input: string) => {
    pushMsg("user", input);
    if (!draft) return;
    const s = input.toLowerCase();
    const updated = { ...draft };

    // Parse inline edits
    const creditMatch = s.match(/(\d+)\s*credit/i);
    const dollarMatch = s.match(/\$(\d+)/);
    if (creditMatch) updated.stake = parseInt(creditMatch[1]);
    else if (dollarMatch) updated.stake = parseInt(dollarMatch[1]);
    if (/free|免费|no.?stake/.test(s)) updated.stake = 0;
    if (/video|录像/.test(s)) updated.evidence = "Video proof";
    if (/photo|照片/.test(s)) updated.evidence = "Photo evidence";
    if (/gps/.test(s)) updated.evidence = "GPS tracking";
    if (/self.?report|自己报/.test(s)) updated.evidence = "Self-report";
    if (/1.?hour|1小时/.test(s)) updated.deadline = "1 hour";
    if (/24.?h|一天/.test(s)) updated.deadline = "24 hours";
    if (/48.?h|两天/.test(s)) updated.deadline = "48 hours";
    if (/1.?week|一周/.test(s)) updated.deadline = "1 week";

    setDraft(updated);
    aiReply(`Updated — ${updated.stake > 0 ? `${updated.stake} credits` : "free"}, ${updated.evidence}, deadline ${updated.deadline}. Publish when ready.`);
  }, [pushMsg, aiReply, draft]);

  /* ── Publish ── */
  const handlePublish = useCallback(async (editedDraft?: ChallengeDraft) => {
    if (!user) {
      setShowAuth(true);
      return;
    }

    const d = editedDraft || draft;
    if (d && d !== draft) setDraft(d);

    if (d) {
      try {
        setIsTyping(true);
        const res = await api.createChallenge({
          title: d.title,
          type: d.type,
          stake: d.stake,
          deadline: d.deadline,
          rules: d.rules,
          evidenceType: d.evidence.toLowerCase().replace(/ /g, "_"),
          aiReview: d.aiReview,
          isPublic: d.isPublic,
        });
        const id = res.challenge.id;
        setChallengeId(id);
        setShareLink(`${window.location.origin}/join/${id}`);
        setIsTyping(false);
      } catch (err) {
        setIsTyping(false);
        pushMsg("ai", `Failed to publish: ${err instanceof Error ? err.message : "Unknown error"}. You can try again.`);
        return;
      }
    }

    setPublished(true);
    setAppState("live");
    aiReply(
      "Challenge is **LIVE**! Copy the link below and send it to your friend — they can join in one click.",
      undefined,
      600,
    );
  }, [aiReply, draft, user, pushMsg]);

  /* ── Copy share link ── */
  const copyShareLink = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

  /* ── Edit ── */
  const handleEdit = useCallback(() => {
    aiReply("Type what you want to change — e.g. \"10 credits\" or \"video proof\" or \"1 hour deadline\"", undefined, 400);
  }, [aiReply]);

  /* ── Reset ── */
  const reset = useCallback(() => {
    setAppState("idle");
    setMessages([]); setDraft(null); setPublished(false);
    setChallengeId(null); setShareLink(null); setCopied(false);
  }, []);

  const active = appState !== "idle";

  const creditsBadge = user ? (
    <span className={`px-2 py-0.5 rounded-md text-[9px] font-black${(user.credits ?? 0) > 0 ? " animate-credits-glow" : ""}`}
          style={{
            background: (user.credits ?? 0) > 0 ? "rgba(99,154,103,0.15)" : "rgba(255,59,48,0.15)",
            color: (user.credits ?? 0) > 0 ? "#639A67" : "#ff3b30",
            border: `1px solid ${(user.credits ?? 0) > 0 ? "rgba(99,154,103,0.3)" : "rgba(255,59,48,0.3)"}`,
          }}>
      {user.credits ?? 0} credits
    </span>
  ) : null;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#0A0A0B" }} onClick={() => showProfile && setShowProfile(false)}>

      {/* Subtle gold ambient light — no particles */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.04] blur-[150px]"
             style={{ background: "#D4AF37" }} />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full opacity-[0.03] blur-[120px]"
             style={{ background: "#005F6F" }} />
      </div>



      {/* ── Minimal header (active state only) ── */}
      <AnimatePresence>
        {active && (
          <motion.header
            className="fixed top-0 inset-x-0 z-30"
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
          >
            <div className="glass-panel" style={{ borderTop: "none", borderLeft: "none", borderRight: "none", backdropFilter: "blur(20px) saturate(180%)", boxShadow: "0 1px 0 rgba(255,255,255,0.04), 0 4px 24px rgba(0,0,0,0.3)" }}>
              <div className="plasma-line" />
              <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">

                <motion.button
                  onClick={reset}
                  className="flex items-center gap-2.5 group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                       style={{ background: "linear-gradient(135deg, #D4AF37, #005F6F)", boxShadow: "0 0 16px rgba(212,175,55,0.4)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <span className="text-sm font-extrabold text-text-primary group-hover:text-white transition-colors">
                    Lex Divina
                  </span>
                </motion.button>

                <div className="flex items-center gap-2.5">
                  <motion.button
                    onClick={reset}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-text-muted border border-border-subtle"
                    style={{ background: "rgba(255,255,255,0.04)" }}
                    whileHover={{ color: "#f0f0ff", background: "rgba(255,255,255,0.08)" }}
                    whileTap={{ scale: 0.96 }}
                  >
                    New Challenge
                  </motion.button>

                  {user ? (
                    <div className="relative">
                      <motion.button
                        onClick={() => setShowProfile(!showProfile)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-sm border cursor-pointer"
                        style={{ background: "rgba(212,175,55,0.04)", borderColor: "rgba(212,175,55,0.12)" }}
                        whileHover={{ borderColor: "rgba(212,175,55,0.3)", background: "rgba(212,175,55,0.08)" }}
                        whileTap={{ scale: 0.97 }}
                      >
                        <div className="w-5 h-5 rounded-sm flex items-center justify-center text-[9px] font-serif font-bold"
                             style={{ background: "rgba(212,175,55,0.15)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)" }}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-xs font-mono text-text-secondary">{user.username}</span>
                        {creditsBadge}
                      </motion.button>
                      {/* Header profile dropdown */}
                      <AnimatePresence>
                        {showProfile && (
                          <motion.div
                            className="absolute top-full right-0 mt-2 w-52 overflow-hidden z-50"
                            style={{
                              background: "#0E0E0C",
                              border: "1px solid rgba(212,175,55,0.12)",
                              boxShadow: "0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(212,175,55,0.06)",
                              borderRadius: "2px",
                            }}
                            initial={{ opacity: 0, y: -8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="p-3 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
                              <p className="text-sm font-serif font-bold" style={{ color: "#E5E0D8" }}>{user.username}</p>
                              <p className="text-[10px] font-mono" style={{ color: "#8b8b83" }}>{user.email || "Oracle Seeker"}</p>
                            </div>
                            <div className="p-2 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
                              <div className="flex items-center justify-between px-2 py-1.5" style={{ background: "rgba(212,175,55,0.04)" }}>
                                <span className="text-[10px] font-mono" style={{ color: "#8b8b83" }}>Credits</span>
                                <span className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>{user.credits ?? 0}</span>
                              </div>
                            </div>
                            <div className="p-2">
                              <motion.button
                                onClick={() => { setShowProfile(false); signOut(); reset(); }}
                                whileHover={{ background: "rgba(163,31,52,0.1)" }}
                                className="w-full text-left px-2 py-2 text-[10px] font-mono uppercase tracking-wider transition-colors"
                                style={{ color: "#8b8b83" }}
                              >
                                Sign Out
                              </motion.button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.button
                      onClick={() => setShowAuth(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #D4AF37, #A38829)" }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      Sign In
                    </motion.button>
                  )}
                </div>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* ── Main content ── */}
      <main className={`relative z-10 flex flex-col items-center px-4 transition-all duration-700 ${
        active ? "min-h-screen pt-20 pb-32" : "min-h-screen justify-center pb-16"
      }`}>

        <AnimatePresence>
          {active && (
            <motion.div
              className="w-full max-w-2xl mb-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <ConversationThread
                messages={messages}
                isTyping={isTyping}
                onOptionSelect={() => {}}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {appState === "drafting" && draft && (
            <motion.div
              key="draft"
              className="w-full max-w-2xl mb-5"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <DraftPanel draft={draft} onPublish={handlePublish} onEdit={handleEdit} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Published — share link card */}
        <AnimatePresence>
          {published && appState === "live" && draft && (
            <motion.div
              key="published"
              className="w-full max-w-2xl mb-5"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                className="rounded-2xl p-5"
                style={{
                  background: "rgba(99,154,103,0.06)",
                  border: "1px solid rgba(99,154,103,0.15)",
                  boxShadow: "0 0 30px rgba(99,154,103,0.06)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "rgba(99,154,103,0.12)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#639A67" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div className="absolute inset-0 rounded-xl border border-success opacity-30 animate-ping" style={{ animationDuration: "2s" }} />
                  </div>
                  <div>
                    <h3 className="text-base font-serif font-bold" style={{ color: "#E5E0D8" }}>Contract Sealed</h3>
                    <p className="text-[10px] font-mono tracking-wider" style={{ color: "#8b8b83" }}>Dispatch the summons</p>
                  </div>
                  <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: "rgba(99,154,103,0.1)", color: "#639A67" }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                    Live
                  </span>
                </div>

                {/* Share link — the key UX */}
                {shareLink && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2 rounded-xl overflow-hidden"
                         style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <input
                        type="text"
                        readOnly
                        value={shareLink}
                        className="flex-1 bg-transparent px-4 py-3 text-sm text-text-primary font-mono focus:outline-none truncate"
                      />
                      <motion.button
                        onClick={copyShareLink}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className="flex-shrink-0 px-4 py-3 text-sm font-extrabold text-white"
                        style={{ background: copied ? "rgba(99,154,103,0.3)" : "linear-gradient(135deg, #D4AF37, #A38829)" }}
                      >
                        {copied ? (
                          <span className="flex items-center gap-1">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Copied!
                          </span>
                        ) : "Copy"}
                      </motion.button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {[draft.type, draft.stake > 0 ? `${draft.stake} credits` : "Free", draft.evidence].map(tag => (
                    <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-bold"
                          style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,240,255,0.7)" }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <motion.button
                  onClick={reset}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full py-3 rounded-xl text-sm font-bold text-text-secondary border border-border-subtle"
                  style={{ background: "rgba(255,255,255,0.04)" }}
                >
                  Forge Another Contract
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <CenteredComposer
          onSubmit={active ? handleFollowUp : handleInitialSubmit}
          isActive={active}
          isParsing={isTyping}
        />
      </main>

      <FloatingActionBar visible={active && !published} />

      <AnimatePresence>
        {!active && (
          <motion.footer
            className="fixed bottom-5 inset-x-0 z-10 flex items-center justify-center gap-6 text-[10px] font-semibold text-text-muted/40 uppercase tracking-[0.12em]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 1.8, duration: 0.6 } }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.3 } }}
          >
            <span>Terms</span>
            <span className="text-text-muted/20">·</span>
            <span>Lex Divina · AI Oracle Tribunal</span>
            <span className="text-text-muted/20">·</span>
            <span>Privacy</span>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* ── Auth Modal ── */}
      <AuthModal
        open={showAuth}
        onClose={() => setShowAuth(false)}
        onSuccess={() => updateSession()}
      />

      {/* ── Idle auth prompt (top-right) ── */}
      {!active && !user && (
        <motion.button
          onClick={() => setShowAuth(true)}
          className="fixed top-5 right-5 z-20 px-4 py-2 rounded-xl text-xs font-bold text-white"
          style={{ background: "linear-gradient(135deg, #D4AF37, #A38829)", boxShadow: "0 4px 16px rgba(212,175,55,0.3)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          Sign In
        </motion.button>
      )}
      {!active && user && (
        <motion.div
          className="fixed top-5 right-5 z-20"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.3 } }}
        >
          <motion.button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle cursor-pointer"
            style={{ background: "rgba(10,10,24,0.8)", backdropFilter: "blur(12px)" }}
            whileHover={{ borderColor: "rgba(212,175,55,0.3)", background: "rgba(10,10,24,0.95)" }}
            whileTap={{ scale: 0.97 }}
          >
            {user.image ? (
              <img src={user.image} alt="" className="w-6 h-6 rounded-lg" />
            ) : (
              <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
                   style={{ background: "linear-gradient(135deg, #D4AF37, #005F6F)" }}>
                {user.username.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-xs font-bold text-text-secondary">{user.username}</span>
            {creditsBadge}
          </motion.button>

          {/* Profile dropdown */}
          <AnimatePresence>
            {showProfile && (
              <motion.div
                className="absolute top-full right-0 mt-2 w-56 rounded-xl overflow-hidden"
                style={{
                  background: "rgba(13,13,30,0.97)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.5), 0 0 40px rgba(212,175,55,0.06)",
                  backdropFilter: "blur(20px)",
                }}
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                         style={{ background: "linear-gradient(135deg, #D4AF37, #005F6F)" }}>
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-text-primary">{user.username}</p>
                      <p className="text-[10px] text-text-muted">{user.email || "Player"}</p>
                    </div>
                  </div>
                </div>
                <div className="p-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between px-2 py-2 rounded-lg"
                       style={{ background: "rgba(99,154,103,0.06)" }}>
                    <span className="text-xs font-bold text-text-secondary">Credits</span>
                    <span className="text-sm font-black" style={{ color: "#639A67" }}>{user.credits ?? 0}</span>
                  </div>
                </div>
                <div className="p-2">
                  <motion.button
                    onClick={() => { setShowProfile(false); signOut(); reset(); }}
                    whileHover={{ background: "rgba(255,71,87,0.1)" }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold text-text-muted hover:text-danger transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
