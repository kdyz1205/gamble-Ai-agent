"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import ParticleBackground from "@/components/ParticleBackground";
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
    <span className="px-2 py-0.5 rounded-md text-[9px] font-black"
          style={{
            background: (user.credits ?? 0) > 0 ? "rgba(0,232,122,0.15)" : "rgba(255,59,48,0.15)",
            color: (user.credits ?? 0) > 0 ? "#00e87a" : "#ff3b30",
            border: `1px solid ${(user.credits ?? 0) > 0 ? "rgba(0,232,122,0.3)" : "rgba(255,59,48,0.3)"}`,
          }}>
      {user.credits ?? 0} credits
    </span>
  ) : null;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#06060f" }}>

      <ParticleBackground />

      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,92,252,0.06) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,200,0.05) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full"
             style={{ background: "radial-gradient(ellipse, rgba(124,92,252,0.025) 0%, transparent 60%)" }} />
      </div>

      {showScanLine && <div className="scan-line" />}

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
            <div className="glass-panel" style={{ borderTop: "none", borderLeft: "none", borderRight: "none" }}>
              <div className="plasma-line" />
              <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">

                <motion.button
                  onClick={reset}
                  className="flex items-center gap-2.5 group"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                       style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)", boxShadow: "0 0 16px rgba(124,92,252,0.4)" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <span className="text-sm font-extrabold text-text-primary group-hover:text-white transition-colors">
                    ChallengeAI
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
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border-subtle"
                         style={{ background: "rgba(255,255,255,0.04)" }}>
                      {user.image ? (
                        <img src={user.image} alt="" className="w-5 h-5 rounded-md" />
                      ) : (
                        <div className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black text-white"
                             style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}>
                          {user.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs font-bold text-text-secondary">{user.username}</span>
                      {creditsBadge}
                    </div>
                  ) : (
                    <motion.button
                      onClick={() => setShowAuth(true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                      style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}
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
                  background: "rgba(0,232,122,0.06)",
                  border: "1px solid rgba(0,232,122,0.15)",
                  boxShadow: "0 0 30px rgba(0,232,122,0.06)",
                }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="relative w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "rgba(0,232,122,0.12)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div className="absolute inset-0 rounded-xl border border-success opacity-30 animate-ping" style={{ animationDuration: "2s" }} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-text-primary">Challenge Live!</h3>
                    <p className="text-xs text-text-secondary">Send the link to your friend</p>
                  </div>
                  <span className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                        style={{ background: "rgba(0,232,122,0.1)", color: "#00e87a" }}>
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
                        style={{ background: copied ? "rgba(0,232,122,0.3)" : "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}
                      >
                        {copied ? "Copied!" : "Copy"}
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
                  Create Another Challenge
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

      <FloatingActionBar visible={active} />

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
            <span>AI-Powered Challenge OS</span>
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
          style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)", boxShadow: "0 4px 16px rgba(124,92,252,0.3)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 1.5 } }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
        >
          Sign In
        </motion.button>
      )}
      {!active && user && (
        <motion.div
          className="fixed top-5 right-5 z-20 flex items-center gap-2 px-3 py-2 rounded-xl border border-border-subtle"
          style={{ background: "rgba(10,10,24,0.8)", backdropFilter: "blur(12px)" }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 1.5 } }}
        >
          {user.image ? (
            <img src={user.image} alt="" className="w-6 h-6 rounded-lg" />
          ) : (
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black text-white"
                 style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-xs font-bold text-text-secondary">{user.username}</span>
          {creditsBadge}
          <button
            onClick={() => signOut()}
            className="ml-1 text-[10px] text-text-muted hover:text-danger transition-colors"
          >
            ×
          </button>
        </motion.div>
      )}
    </div>
  );
}
