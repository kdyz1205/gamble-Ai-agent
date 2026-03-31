"use client";

import { useState, useCallback } from "react";
import ParticleBackground from "@/components/ParticleBackground";
import CenteredComposer from "@/components/CenteredComposer";
import ConversationThread from "@/components/ConversationThread";
import type { Message } from "@/components/ConversationThread";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import { FloatingActionBar } from "@/components/SecondaryPanels";

/* ────────────────────────────────────────────
   AI Conversation Simulation
   ──────────────────────────────────────────── */

type AppState = "idle" | "clarifying" | "drafting" | "live";

interface ConversationStep {
  aiMessage: string;
  options?: string[];
  nextState?: AppState;
  draft?: Partial<ChallengeDraft>;
}

function parseUserIntent(input: string): ConversationStep[] {
  const lower = input.toLowerCase();

  // Detect challenge type
  let challengeType = "General";
  if (lower.includes("pushup") || lower.includes("run") || lower.includes("fitness") || lower.includes("exercise") || lower.includes("plank") || lower.includes("squat")) {
    challengeType = "Fitness";
  } else if (lower.includes("cook") || lower.includes("bake") || lower.includes("food") || lower.includes("pasta") || lower.includes("recipe")) {
    challengeType = "Cooking";
  } else if (lower.includes("code") || lower.includes("coding") || lower.includes("program") || lower.includes("leetcode")) {
    challengeType = "Coding";
  } else if (lower.includes("read") || lower.includes("book") || lower.includes("study") || lower.includes("learn") || lower.includes("exam")) {
    challengeType = "Learning";
  } else if (lower.includes("chess") || lower.includes("game") || lower.includes("play")) {
    challengeType = "Games";
  } else if (lower.includes("video") || lower.includes("proof")) {
    challengeType = "Video Challenge";
  }

  // Detect money
  const moneyMatch = lower.match(/\$(\d+)/);
  const hasMoney = moneyMatch || lower.includes("money") || lower.includes("stake") || lower.includes("bet") || lower.includes("wager") || lower.includes("dollar");

  // Detect opponent
  const hasOpponent = lower.includes("friend") || lower.includes("someone") || lower.includes("opponent") || lower.includes("buddy") || lower.includes("vs") || lower.match(/and\s+\w+/);

  // Build conversation flow
  const steps: ConversationStep[] = [];

  // Step 1: Acknowledge and ask about opponent
  let ackMessage = `Got it! I'll help you set up a **${challengeType}** challenge.`;

  if (hasOpponent) {
    ackMessage += " Sounds like you already have someone in mind.";
  }

  steps.push({
    aiMessage: ackMessage + "\n\nWho is your opponent?",
    options: hasOpponent
      ? ["A specific friend", "Anyone nearby", "Open to public"]
      : ["Invite a friend", "Anyone nearby", "Open to public"],
  });

  // Step 2: Ask about stakes
  steps.push({
    aiMessage: hasMoney
      ? `Great! You mentioned a wager. How much do you want to stake?`
      : "Would you like to add a money stake, or keep it free?",
    options: hasMoney
      ? ["$10", "$20", "$50", "Custom amount"]
      : ["Free — just for fun", "$10 stake", "$20 stake", "$50 stake"],
  });

  // Step 3: Ask about evidence
  steps.push({
    aiMessage: "How should we verify the result?",
    options: ["Video proof", "Photo evidence", "GPS tracking", "Self-report + honor system"],
  });

  return steps;
}

function buildDraft(userInput: string, answers: string[]): ChallengeDraft {
  const lower = userInput.toLowerCase();

  let type = "General";
  if (lower.includes("pushup") || lower.includes("run") || lower.includes("fitness")) type = "Fitness";
  else if (lower.includes("cook") || lower.includes("pasta")) type = "Cooking";
  else if (lower.includes("code") || lower.includes("coding")) type = "Coding";
  else if (lower.includes("book") || lower.includes("read")) type = "Learning";
  else if (lower.includes("chess") || lower.includes("game")) type = "Games";

  // Extract stake from answers
  let stake = "Free";
  let currency: "USD" | "points" | "none" = "none";
  for (const a of answers) {
    const m = a.match(/\$(\d+)/);
    if (m) {
      stake = `$${m[1]}`;
      currency = "USD";
    }
  }

  // Extract evidence
  let evidence = "Self-report";
  for (const a of answers) {
    if (a.toLowerCase().includes("video")) evidence = "Video proof";
    else if (a.toLowerCase().includes("photo")) evidence = "Photo evidence";
    else if (a.toLowerCase().includes("gps")) evidence = "GPS tracking";
  }

  // Determine visibility
  const isPublic = answers.some(
    (a) => a.toLowerCase().includes("public") || a.toLowerCase().includes("nearby")
  );

  // Generate title from input (capitalize first letter, truncate)
  let title = userInput.charAt(0).toUpperCase() + userInput.slice(1);
  if (title.length > 60) title = title.slice(0, 57) + "...";

  return {
    title,
    playerA: "You",
    playerB: answers[0]?.toLowerCase().includes("friend") ? "Friend (invite sent)" : null,
    type,
    stake,
    currency,
    deadline: "48 hours",
    rules: `Standard ${type.toLowerCase()} rules — AI-reviewed`,
    evidence,
    aiReview: true,
    isPublic,
  };
}

/* ────────────────────────────────────────────
   Main Page Component
   ──────────────────────────────────────────── */

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [conversationSteps, setConversationSteps] = useState<ConversationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [originalInput, setOriginalInput] = useState("");
  const [draft, setDraft] = useState<ChallengeDraft | null>(null);
  const [published, setPublished] = useState(false);

  const addMessage = useCallback(
    (role: "user" | "ai", content: string, options?: string[]) => {
      const msg: Message = {
        id: `${Date.now()}-${Math.random()}`,
        role,
        content,
        timestamp: new Date(),
        options,
      };
      setMessages((prev) => [...prev, msg]);
    },
    []
  );

  const simulateAITyping = useCallback(
    (content: string, options?: string[], delay = 1200) => {
      setIsTyping(true);
      setTimeout(() => {
        setIsTyping(false);
        addMessage("ai", content, options);
      }, delay);
    },
    [addMessage]
  );

  /* ── First user message ── */
  const handleInitialSubmit = useCallback(
    (input: string) => {
      setOriginalInput(input);
      addMessage("user", input);
      setAppState("clarifying");

      const steps = parseUserIntent(input);
      setConversationSteps(steps);
      setCurrentStep(0);

      // Show first AI response
      simulateAITyping(steps[0].aiMessage, steps[0].options);
    },
    [addMessage, simulateAITyping]
  );

  /* ── Option selected / follow-up answer ── */
  const handleOptionSelect = useCallback(
    (option: string) => {
      addMessage("user", option);
      const newAnswers = [...userAnswers, option];
      setUserAnswers(newAnswers);

      const nextStepIndex = currentStep + 1;

      if (nextStepIndex < conversationSteps.length) {
        setCurrentStep(nextStepIndex);
        const next = conversationSteps[nextStepIndex];
        simulateAITyping(next.aiMessage, next.options);
      } else {
        // All questions answered → build draft
        setIsTyping(true);
        setTimeout(() => {
          setIsTyping(false);
          addMessage(
            "ai",
            "I've prepared your challenge draft. Review the details below and publish when you're ready!"
          );
          const d = buildDraft(originalInput, newAnswers);
          setDraft(d);
          setAppState("drafting");
        }, 1500);
      }
    },
    [
      addMessage,
      simulateAITyping,
      currentStep,
      conversationSteps,
      userAnswers,
      originalInput,
    ]
  );

  /* ── Follow-up from composer while in conversation ── */
  const handleFollowUp = useCallback(
    (input: string) => {
      // Treat typed text same as an option selection
      handleOptionSelect(input);
    },
    [handleOptionSelect]
  );

  /* ── Publish ── */
  const handlePublish = useCallback(() => {
    setPublished(true);
    setAppState("live");
    simulateAITyping(
      "Your challenge is now **LIVE**! Waiting for an opponent to join. I'll notify you when someone accepts.",
      ["View Live Activity", "Challenge Another"]
    );
  }, [simulateAITyping]);

  /* ── Edit draft ── */
  const handleEditDraft = useCallback(() => {
    setDraft(null);
    setAppState("clarifying");
    simulateAITyping("Sure! What would you like to change?", [
      "Change stake amount",
      "Change deadline",
      "Change evidence type",
      "Change opponent",
    ]);
  }, [simulateAITyping]);

  /* ── Reset ── */
  const handleReset = useCallback(() => {
    setAppState("idle");
    setMessages([]);
    setConversationSteps([]);
    setCurrentStep(0);
    setUserAnswers([]);
    setOriginalInput("");
    setDraft(null);
    setPublished(false);
  }, []);

  const isConversationActive = appState !== "idle";

  return (
    <div className="relative min-h-screen">
      {/* Particle Background */}
      <ParticleBackground />

      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-white/50 via-transparent to-white/30" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-accent/[0.03] blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] rounded-full bg-teal/[0.03] blur-3xl" />
      </div>

      {/* Minimal top bar (only when active) */}
      {isConversationActive && (
        <header className="fixed top-0 left-0 right-0 z-30 animate-fade-in">
          <div className="glass-strong border-b border-border-subtle/50">
            <div className="max-w-2xl mx-auto flex items-center justify-between px-4 py-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <span>ChallengeAI</span>
              </button>

              <div className="flex items-center gap-2">
                {appState === "live" && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-light text-success text-xs font-bold">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
                    LIVE
                  </div>
                )}
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-all"
                >
                  New Challenge
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main
        className={`relative z-10 flex flex-col items-center transition-all duration-700 ease-out ${
          isConversationActive
            ? "min-h-screen pt-20 pb-28 px-4"
            : "min-h-screen justify-center px-4 pb-12"
        }`}
      >
        {/* Conversation Thread (shows after first message) */}
        {isConversationActive && (
          <div className="w-full max-w-2xl mb-6 animate-expand">
            <ConversationThread
              messages={messages}
              isTyping={isTyping}
              onOptionSelect={handleOptionSelect}
            />
          </div>
        )}

        {/* Draft Panel (shows in drafting state) */}
        {appState === "drafting" && draft && (
          <div className="w-full max-w-2xl mb-6">
            <DraftPanel
              draft={draft}
              onPublish={handlePublish}
              onEdit={handleEditDraft}
            />
          </div>
        )}

        {/* Published confirmation */}
        {published && appState === "live" && (
          <div className="w-full max-w-2xl mb-6 animate-slide-up">
            <div className="bg-white rounded-2xl border border-success/20 shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-success-light flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-success">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">Challenge Published!</h3>
                  <p className="text-xs text-text-secondary">Waiting for opponent to accept</p>
                </div>
              </div>

              {draft && (
                <div className="flex items-center gap-4 text-xs text-text-secondary">
                  <span className="px-2 py-1 rounded-md bg-accent-light text-accent font-semibold">{draft.type}</span>
                  <span>{draft.stake}</span>
                  <span>{draft.evidence}</span>
                  <span className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-success animate-pulse-dot" />
                    Live
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Composer — always visible */}
        <CenteredComposer
          onSubmit={isConversationActive ? handleFollowUp : handleInitialSubmit}
          isActive={isConversationActive}
        />
      </main>

      {/* Floating Action Bar (secondary panels) */}
      <FloatingActionBar visible={isConversationActive} />

      {/* Bottom watermark (idle state only) */}
      {!isConversationActive && (
        <footer className="fixed bottom-4 left-0 right-0 z-10 text-center animate-fade-in">
          <p className="text-xs text-text-tertiary/60">
            AI-Powered Challenge Operating System
          </p>
        </footer>
      )}
    </div>
  );
}
