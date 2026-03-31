"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import type { Variants } from "framer-motion";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
}

const SUGGESTIONS = [
  "I bet my friend I can do 50 pushups in 2 min",
  "Who can run 5K faster this Saturday?",
  "Cooking battle — best pasta, community vote",
  "Let's bet on who finishes the book first",
];

const QUICK_ACTIONS = [
  { label: "Fitness",     icon: "⚡", from: "#7c5cfc", to: "#a78bfa" },
  { label: "Video Proof", icon: "◉",  from: "#0ea5e9", to: "#00d4c8" },
  { label: "Nearby",      icon: "◎",  from: "#00d4c8", to: "#10b981" },
  { label: "Money Stake", icon: "◈",  from: "#f5a623", to: "#f59e0b" },
  { label: "Free Mode",   icon: "◇",  from: "#ec4899", to: "#f43f5e" },
];

const PROMPT_MAP: Record<string, string> = {
  "Fitness":     "I want to create a fitness challenge",
  "Video Proof": "I want a challenge that requires video proof",
  "Nearby":      "Show me challenges from people nearby",
  "Money Stake": "I want to create a challenge with a money stake",
  "Free Mode":   "I want a free challenge with no money involved",
};

/* ── Stagger variants ── */
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export default function CenteredComposer({ onSubmit, isActive }: Props) {
  const [input, setInput]         = useState("");
  const [focused, setFocused]     = useState(false);
  const [hintIdx, setHintIdx]     = useState(0);
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const mouseX                    = useMotionValue(0);
  const mouseY                    = useMotionValue(0);

  // Rotate hints
  useEffect(() => {
    if (isActive) return;
    const id = setInterval(() => setHintIdx(i => (i + 1) % SUGGESTIONS.length), 4500);
    return () => clearInterval(id);
  }, [isActive]);

  // Magnetic card tilt
  const rotateX = useTransform(mouseY, [-60, 60], [4, -4]);
  const rotateY = useTransform(mouseX, [-60, 60], [-4, 4]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width  / 2);
    mouseY.set(e.clientY - rect.top  - rect.height / 2);
  };
  const handleMouseLeave = () => { mouseX.set(0); mouseY.set(0); };

  const send = () => {
    const v = input.trim();
    if (!v) return;
    onSubmit(v);
    setInput("");
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <motion.div
      className="w-full max-w-2xl"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* ── Hero Title (idle only) ── */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            key="hero"
            className="text-center mb-10"
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24, transition: { duration: 0.35 } }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Glowing logo mark */}
            <motion.div
              className="inline-flex relative mb-6"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-teal flex items-center justify-center shadow-2xl"
                   style={{ boxShadow: "0 0 40px rgba(124,92,252,0.4), 0 0 80px rgba(124,92,252,0.15)" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                {/* Inner glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />
              </div>
              {/* Orbiting dot */}
              <motion.div
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-teal"
                style={{ boxShadow: "0 0 8px rgba(0,212,200,0.8)" }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-none"
              variants={itemVariants}
            >
              <span className="bg-gradient-to-r from-text-primary via-accent to-teal bg-clip-text text-transparent animate-gradient-drift"
                    style={{ backgroundSize: "300% 100%" }}>
                Challenge Anyone.
              </span>
              <br />
              <span className="text-text-secondary text-3xl sm:text-4xl font-semibold">
                Let AI handle the rest.
              </span>
            </motion.h1>

            <motion.p
              className="text-sm text-text-tertiary max-w-sm mx-auto leading-relaxed"
              variants={itemVariants}
            >
              Describe your challenge in plain language — AI structures rules, matches opponents, and judges the outcome.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer Box ── */}
      <motion.div
        variants={itemVariants}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformPerspective: 800 }}
        className="relative"
      >
        {/* Outer glow ring */}
        <motion.div
          className="absolute -inset-px rounded-2xl pointer-events-none"
          animate={focused
            ? { opacity: 1 }
            : { opacity: [0.5, 1, 0.5] }
          }
          transition={focused
            ? { duration: 0.2 }
            : { duration: 3, repeat: Infinity, ease: "easeInOut" }
          }
          style={{
            background: "linear-gradient(135deg, rgba(124,92,252,0.4), rgba(0,212,200,0.2), rgba(124,92,252,0.15))",
            filter: focused ? "blur(0px)" : "blur(1px)",
          }}
        />

        {/* Card */}
        <div className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${
          focused ? "animate-focus-pulse" : "animate-breathe-glow"
        }`}
          style={{ background: "rgba(15,15,35,0.92)", backdropFilter: "blur(24px)" }}
        >
          {/* Top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

          {/* Header row */}
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <div className="relative flex items-center gap-1.5">
              <motion.div
                className="w-2 h-2 rounded-full bg-accent"
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-[0.12em]">
                AI Challenge Creator
              </span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full bg-text-muted" />
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKey}
            placeholder={isActive ? "Continue the conversation..." : SUGGESTIONS[hintIdx]}
            rows={isActive ? 2 : 3}
            className="w-full bg-transparent px-5 py-3 text-[15px] text-text-primary placeholder:text-text-muted/60 resize-none focus:outline-none leading-relaxed font-medium"
            style={{ caretColor: "rgb(124,92,252)" }}
          />

          {/* Footer row */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border-subtle">
            <div className="flex items-center gap-3 text-[10px] text-text-muted">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-bg-raised border border-border-subtle font-mono text-[9px]">↵</kbd>
                send
              </span>
              <span className="text-text-muted/40">·</span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 rounded bg-bg-raised border border-border-subtle font-mono text-[9px]">⇧↵</kbd>
                newline
              </span>
            </div>

            {/* Send button */}
            <motion.button
              onClick={send}
              disabled={!input.trim()}
              whileHover={input.trim() ? { scale: 1.04 } : {}}
              whileTap={input.trim() ? { scale: 0.96 } : {}}
              className={`shimmer-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                input.trim()
                  ? "bg-gradient-to-r from-accent to-accent-dark text-white shadow-lg shadow-accent/30"
                  : "bg-bg-raised text-text-muted cursor-not-allowed"
              }`}
              style={input.trim() ? {
                boxShadow: "0 4px 20px rgba(124,92,252,0.35), inset 0 1px 0 rgba(255,255,255,0.1)"
              } : {}}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Quick Actions ── */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            key="quick-actions"
            className="mt-6 flex flex-wrap justify-center gap-2"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.5, duration: 0.5, ease: [0.22,1,0.36,1] } }}
            exit={{ opacity: 0, y: 10, transition: { duration: 0.3 } }}
          >
            {QUICK_ACTIONS.map((a, i) => (
              <motion.button
                key={a.label}
                onClick={() => onSubmit(PROMPT_MAP[a.label])}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0, transition: { delay: 0.55 + i * 0.07 } }}
                whileHover={{ y: -3, scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="shimmer-btn relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border border-border-subtle overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  backdropFilter: "blur(12px)",
                }}
              >
                {/* Gradient underline */}
                <div className="absolute bottom-0 inset-x-0 h-px"
                     style={{ background: `linear-gradient(90deg, ${a.from}, ${a.to})`, opacity: 0.6 }} />
                <span className="text-base">{a.icon}</span>
                <span className="text-text-secondary">{a.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Suggestion cards ── */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            key="suggestions"
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.9, duration: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            <p className="text-center text-[10px] font-semibold text-text-muted uppercase tracking-[0.15em] mb-4">
              Try saying
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s}
                  onClick={() => onSubmit(s)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.95 + i * 0.08 } }}
                  whileHover={{ scale: 1.01, borderColor: "rgba(124,92,252,0.35)" }}
                  whileTap={{ scale: 0.98 }}
                  className="group text-left px-4 py-3.5 rounded-xl border border-border-subtle transition-colors duration-200"
                  style={{ background: "rgba(255,255,255,0.03)" }}
                >
                  <span className="text-sm text-text-tertiary group-hover:text-text-secondary transition-colors duration-200">
                    &ldquo;{s}&rdquo;
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
