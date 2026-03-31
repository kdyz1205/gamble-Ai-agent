"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ParticleBackground from "@/components/ParticleBackground";
import CenteredComposer from "@/components/CenteredComposer";
import ConversationThread from "@/components/ConversationThread";
import type { Message } from "@/components/ConversationThread";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import { FloatingActionBar } from "@/components/SecondaryPanels";

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
        ? "You mentioned a wager. How much do you want to stake?"
        : "Would you like to add a money stake, or keep it free?",
      options: hasMoney
        ? ["$10", "$20", "$50", "Custom amount"]
        : ["Free — just for fun", "$10 stake", "$20 stake", "$50 stake"],
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

  let stake = "Free", currency: "USD" | "points" | "none" = "none";
  for (const a of answers) {
    const m = a.match(/\$(\d+)/);
    if (m) { stake = `$${m[1]}`; currency = "USD"; break; }
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
    type, stake, currency,
    deadline: "48 hours",
    rules: `Standard ${type.toLowerCase()} rules — AI reviewed`,
    evidence, aiReview: true, isPublic,
  };
}

/* ═══════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════ */

export default function Home() {
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

  // Scan-line effect on mount
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

  /* ── First submit ── */
  const handleInitialSubmit = useCallback((input: string) => {
    setOrigInput(input);
    pushMsg("user", input);
    setAppState("clarifying");
    const s = parseIntent(input);
    setSteps(s);
    setStepIdx(0);
    aiReply(s[0].aiMessage, s[0].options);
  }, [pushMsg, aiReply]);

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
  const handlePublish = useCallback(() => {
    setPublished(true);
    setAppState("live");
    aiReply(
      "Your challenge is now **LIVE**. I'm scanning for opponents. I'll notify you the moment someone accepts.",
      ["View Live Activity", "Challenge Another"],
      1200,
    );
  }, [aiReply]);

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
  }, []);

  const active = appState !== "idle";

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#06060f" }}>

      {/* ── 3-layer particle system ── */}
      <ParticleBackground />

      {/* ── Background gradient volumes ── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Deep violet orb — top-left */}
        <motion.div
          className="absolute -top-40 -left-40 w-[700px] h-[700px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,92,252,0.06) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Cyan orb — bottom-right */}
        <motion.div
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,200,0.05) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 3 }}
        />
        {/* Centre ambient haze */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full"
             style={{ background: "radial-gradient(ellipse, rgba(124,92,252,0.025) 0%, transparent 60%)" }} />
      </div>

      {/* ── Scan line ── */}
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

                {/* Logo */}
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

                {/* Right side */}
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

        {/* Conversation thread */}
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

        {/* Draft panel */}
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

        {/* Published confirmation */}
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
                <div className="flex items-start gap-4">
                  <div className="relative w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
                       style={{ background: "rgba(0,232,122,0.12)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {/* Pulse ring */}
                    <div className="absolute inset-0 rounded-xl border border-success opacity-30 animate-ping" style={{ animationDuration: "2s" }} />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-text-primary mb-1">Challenge Published!</h3>
                    <p className="text-sm text-text-secondary mb-3">Scanning for opponents — you&rsquo;ll be notified when someone accepts.</p>
                    <div className="flex flex-wrap gap-2">
                      {[draft.type, draft.stake, draft.evidence].map(tag => (
                        <span key={tag} className="px-2.5 py-1 rounded-lg text-xs font-bold"
                              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(240,240,255,0.7)" }}>
                          {tag}
                        </span>
                      ))}
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold"
                            style={{ background: "rgba(0,232,122,0.1)", color: "#00e87a" }}>
                        <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                        Live
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Composer — always present */}
        <CenteredComposer
          onSubmit={active ? handleFollowUp : handleInitialSubmit}
          isActive={active}
        />
      </main>

      {/* ── Floating action bar ── */}
      <FloatingActionBar visible={active} />

      {/* ── Idle footer watermark ── */}
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
    </div>
  );
}
