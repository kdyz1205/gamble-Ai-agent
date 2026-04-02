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
import ChallengeVerdictPanel from "@/components/ChallengeVerdictPanel";
import AiOracleSettingsPanel from "@/components/AiOracleSettingsPanel";
import * as api from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";

const PRICING_SITE_URL = (process.env.NEXT_PUBLIC_PRICING_SITE_URL ?? "").trim();

/* ═══════════════════════════════════════════════════
   AI CONVERSATION ENGINE
   ═══════════════════════════════════════════════════ */

type AppState = "idle" | "clarifying" | "drafting" | "live";

interface ConvoStep { aiMessage: string; options?: string[]; }

function parseIntent(input: string): ConvoStep[] {
  const s = input.toLowerCase();

  let type = "General";
  if (/pushup|run|fitness|exercise|plank|squat|gym|workout/.test(s)) type = "Fitness";
  else if (/cook|bake|food|pasta|recipe|dish/.test(s))                 type = "Cooking";
  else if (/code|coding|program|leetcode|dev|developer/.test(s))       type = "Coding";
  else if (/read|book|study|learn|exam|test|quiz/.test(s))             type = "Learning";
  else if (/chess|game|play|match|tournament/.test(s))                 type = "Games";

  const hasMoney    = /\$\d+|money|stake|bet|wager|dollar/.test(s);
  const hasOpponent = /friend|someone|opponent|buddy|\bvs\b|and\s+\w+/.test(s);

  return [
    {
      aiMessage: `Got it — a **${type}** challenge. ${hasOpponent ? "Sounds like you have someone in mind." : "Let's set you up."}\n\nWho's your opponent?`,
      options: hasOpponent
        ? ["A specific friend", "Anyone nearby", "Open to public"]
        : ["Invite a friend", "Anyone nearby", "Open to public"],
    },
    {
      aiMessage: hasMoney
        ? "You mentioned a wager. How many credits do you want to stake?"
        : "Would you like to stake some credits, or keep it free?",
      options: hasMoney
        ? ["5 credits", "10 credits", "20 credits", "Custom amount"]
        : ["Free — just for fun", "5 credits", "10 credits", "20 credits"],
    },
    {
      aiMessage: "How should we verify the result?",
      options: ["Video proof", "Photo evidence", "GPS tracking", "Self-report"],
    },
  ];
}

function buildDraft(userInput: string, answers: string[]): ChallengeDraft {
  const s = userInput.toLowerCase();

  let type = "General";
  if (/pushup|run|fitness|exercise/.test(s)) type = "Fitness";
  else if (/cook|pasta|bake/.test(s))         type = "Cooking";
  else if (/code|coding|program/.test(s))     type = "Coding";
  else if (/book|read|study|exam/.test(s))    type = "Learning";
  else if (/chess|game|play/.test(s))         type = "Games";

  let stake = 0;
  for (const a of answers) {
    const m = a.match(/(\d+)\s*credit/i);
    if (m) { stake = parseInt(m[1]); break; }
    const dollars = a.match(/\$(\d+)/);
    if (dollars) { stake = parseInt(dollars[1]); break; }
  }

  let evidence = "Self-report";
  for (const a of answers) {
    if (/video/.test(a.toLowerCase()))  { evidence = "Video proof";   break; }
    if (/photo/.test(a.toLowerCase()))  { evidence = "Photo evidence"; break; }
    if (/gps/.test(a.toLowerCase()))    { evidence = "GPS tracking";   break; }
  }

  const isPublic = answers.some(a => /public|nearby/.test(a.toLowerCase()));
  let title = userInput.charAt(0).toUpperCase() + userInput.slice(1);
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return {
    title,
    playerA: "You",
    playerB: answers[0]?.toLowerCase().includes("friend") ? "Friend (invite sent)" : null,
    type, stake,
    deadline: "48 hours",
    rules: `Standard ${type.toLowerCase()} rules — AI reviewed`,
    evidence, aiReview: true, isPublic,
  };
}

/* ═══════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════ */

export default function Home() {
  const { data: session, update: updateSession } = useSession();
  const user = session?.user as { id: string; username: string; email: string; credits?: number; image?: string | null } | undefined;

  const [appState, setAppState]           = useState<AppState>("idle");
  const [messages, setMessages]           = useState<Message[]>([]);
  const [isTyping, setIsTyping]           = useState(false);
  const [steps, setSteps]                 = useState<ConvoStep[]>([]);
  const [stepIdx, setStepIdx]             = useState(0);
  const [answers, setAnswers]             = useState<string[]>([]);
  const [origInput, setOrigInput]         = useState("");
  const [draft, setDraft]                 = useState<ChallengeDraft | null>(null);
  const [published, setPublished]         = useState(false);
  const [showScanLine, setShowScanLine]   = useState(false);
  const [challengeId, setChallengeId]     = useState<string | null>(null);

  const [showAuth, setShowAuth]           = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setShowScanLine(true), 600);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !user?.id) return;
    const id = new URLSearchParams(window.location.search).get("challenge");
    if (!id) return;
    setChallengeId(id);
    setPublished(true);
    setAppState("live");
    setDraft(null);
  }, [user?.id]);

  const openChallengeRoom = useCallback(
    (id: string) => {
      setChallengeId(id);
      setPublished(true);
      setAppState("live");
      setDraft(null);
      if (typeof window !== "undefined" && window.history.replaceState) {
        const u = new URL(window.location.href);
        u.searchParams.set("challenge", id);
        window.history.replaceState({}, "", u.pathname + u.search);
      }
    },
    [],
  );

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

  /* ── First submit ── */
  const handleInitialSubmit = useCallback(async (input: string) => {
    setOrigInput(input);
    pushMsg("user", input);
    setAppState("clarifying");

    if (user) {
      try {
        setIsTyping(true);
        const prefs = readOracleLlmPrefs();
        const res = await api.parseChallenge(input, 1, {
          providerId: prefs.providerId,
          ...(prefs.model ? { model: prefs.model } : {}),
        });
        setIsTyping(false);

        if (res.confirmationPrompt?.trim()) {
          pushMsg("ai", res.confirmationPrompt.trim());
        }
        const apiSteps: ConvoStep[] = res.clarifications.map(c => ({
          aiMessage: c.question,
          options: c.options,
        }));
        setSteps(apiSteps);
        setStepIdx(0);
        pushMsg("ai", apiSteps[0].aiMessage, apiSteps[0].options);
        return;
      } catch {
        setIsTyping(false);
      }
    }

    const s = parseIntent(input);
    setSteps(s);
    setStepIdx(0);
    aiReply(s[0].aiMessage, s[0].options);
  }, [pushMsg, aiReply, user]);

  /* ── Option / follow-up ── */
  const handleOptionSelect = useCallback((opt: string) => {
    pushMsg("user", opt);
    const next = [...answers, opt];
    setAnswers(next);
    const nextIdx = stepIdx + 1;

    if (nextIdx < steps.length) {
      setStepIdx(nextIdx);
      aiReply(steps[nextIdx].aiMessage, steps[nextIdx].options);
    } else {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        pushMsg("ai", "I've structured your challenge. Review the draft below and publish when you're ready.");
        setDraft(buildDraft(origInput, next));
        setAppState("drafting");
      }, 1400);
    }
  }, [pushMsg, answers, stepIdx, steps, aiReply, origInput]);

  const handleFollowUp = useCallback((input: string) => {
    handleOptionSelect(input);
  }, [handleOptionSelect]);

  /* ── Publish ── */
  const handlePublish = useCallback(async () => {
    if (!user) {
      setShowAuth(true);
      return;
    }

    if (draft) {
      try {
        setIsTyping(true);
        const res = await api.createChallenge({
          title: draft.title,
          type: draft.type,
          stake: draft.stake,
          deadline: draft.deadline,
          rules: draft.rules,
          evidenceType: draft.evidence.toLowerCase().replace(/ /g, "_"),
          aiReview: draft.aiReview,
          isPublic: draft.isPublic,
        });
        setChallengeId(res.challenge.id);
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
      "Your challenge is **saved**. Use the command panel below: **submit evidence** (you can start solo — the AI will judge when everyone has posted). When all sides are in, tap **Run AI verdict** to let Claude rule and settle credits.",
      ["View Live Activity", "Challenge Another"],
      1200,
    );
  }, [aiReply, draft, user, pushMsg]);

  /* ── Edit ── */
  const handleEdit = useCallback(() => {
    setDraft(null);
    setAppState("clarifying");
    aiReply("Sure — what would you like to change?", [
      "Change stake amount", "Change deadline", "Change evidence type", "Change opponent",
    ], 700);
  }, [aiReply]);

  /* ── Reset ── */
  const reset = useCallback(() => {
    setAppState("idle");
    setMessages([]); setSteps([]); setStepIdx(0);
    setAnswers([]); setOrigInput(""); setDraft(null); setPublished(false);
    setChallengeId(null);
    if (typeof window !== "undefined" && window.history.replaceState) {
      const u = new URL(window.location.href);
      u.searchParams.delete("challenge");
      window.history.replaceState({}, "", u.pathname + u.search);
    }
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
            <div style={{
              background: "rgba(6,6,15,0.8)",
              backdropFilter: "blur(20px)",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}>
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
                  {appState === "live" && (
                    <motion.div
                      className="relative flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold"
                      style={{ background: "rgba(0,232,122,0.1)", color: "#00e87a", border: "1px solid rgba(0,232,122,0.2)" }}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      <div className="absolute inset-0 rounded-full animate-ping"
                           style={{ border: "1px solid rgba(0,232,122,0.3)", animationDuration: "1.5s" }} />
                      LIVE
                    </motion.div>
                  )}

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
                onOptionSelect={handleOptionSelect}
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

        <AnimatePresence>
          {published && appState === "live" && challengeId && user && (
            <motion.div
              key="published"
              className="w-full max-w-2xl mb-5 space-y-4"
              initial={{ opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {draft && (
                <div
                  className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-2"
                  style={{
                    background: "rgba(0,232,122,0.06)",
                    border: "1px solid rgba(0,232,122,0.12)",
                  }}
                >
                  <span className="text-xs font-extrabold text-[#00e87a]">Saved</span>
                  <span className="text-xs text-text-secondary">
                    Submit evidence below, then run the AI judge when everyone has sent proof.
                  </span>
                </div>
              )}
              <ChallengeVerdictPanel
                challengeId={challengeId}
                userId={user.id}
                credits={user.credits ?? 0}
                onCreditsMayChange={() => updateSession()}
              />
              <div className="flex flex-wrap gap-2 justify-center">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-white"
                  style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)", boxShadow: "0 4px 20px rgba(124,92,252,0.3)" }}
                  onClick={async () => {
                    if (!user) { setShowAuth(true); return; }
                    try {
                      await api.acceptChallenge(challengeId);
                      pushMsg("ai", "You joined the challenge. Add your evidence in the panel above.");
                    } catch (err) {
                      pushMsg("ai", err instanceof Error ? err.message : "Could not join — try the invite link as another account, or this may be your own challenge.");
                    }
                  }}
                >
                  I’m the opponent — Accept
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <CenteredComposer
          onSubmit={active ? handleFollowUp : handleInitialSubmit}
          isActive={active}
        />
      </main>

      <FloatingActionBar
        visible
        onRequireAuth={() => setShowAuth(true)}
        onOpenChallenge={openChallengeRoom}
      />

      {/* 财务测算在独立站点；配置 NEXT_PUBLIC_PRICING_SITE_URL */}
      {active && PRICING_SITE_URL && (
        <a
          href={PRICING_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-5 left-5 z-[35] text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted/50 transition-colors hover:text-text-muted"
          style={{ textShadow: "0 1px 12px rgba(0,0,0,0.9)" }}
        >
          财务测算
        </a>
      )}

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
            {PRICING_SITE_URL ? (
              <a
                href={PRICING_SITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text-muted transition-colors"
              >
                财务测算
              </a>
            ) : null}
            <span className="text-text-muted/20">·</span>
            <span>AI-Powered Challenge OS</span>
            <span className="text-text-muted/20">·</span>
            <span>Privacy</span>
          </motion.footer>
        )}
      </AnimatePresence>

      {/* ── Auth Modal ── */}
      <AiOracleSettingsPanel />

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
