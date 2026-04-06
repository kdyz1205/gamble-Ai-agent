"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import type { Variants } from "framer-motion";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean;
}

const PLACEHOLDER_HINTS = [
  "I bet 5 credits I can do 30 pushups in 2 min",
  "Bet 10U the next car outside is red",
  "Challenge: who can cook better pasta, video proof",
  "I bet my friend can't solve this LeetCode in 15 min",
  "Race to finish reading Chapter 5 — loser buys coffee",
  "Wager 20 credits on tonight's Lakers game",
];

const QUICK_ACTIONS = [
  { label: "Fitness",     icon: "\u26A1", from: "#D4AF37", to: "#B8962E" },
  { label: "Video Proof", icon: "\u25C9",  from: "#D4AF37", to: "#005F6F" },
  { label: "Nearby",      icon: "\u25CE",  from: "#005F6F", to: "#D4AF37" },
  { label: "Money Stake", icon: "\u25C8",  from: "#D4AF37", to: "#C5A028" },
  { label: "Free Mode",   icon: "\u25C7",  from: "#005F6F", to: "#007A8A" },
];

const PROMPT_MAP: Record<string, string> = {
  "Fitness":     "I want to create a fitness challenge",
  "Video Proof": "I want a challenge that requires video proof",
  "Nearby":      "Show me challenges from people nearby",
  "Money Stake": "I want to create a challenge with a money stake",
  "Free Mode":   "I want a free challenge with no money involved",
};

const SUGGESTION_COLORS = ["#D4AF37", "#005F6F", "#D4AF37", "#005F6F"];

/* ── Stagger variants ── */
const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
};
const itemVariants: Variants = {
  hidden:  { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

export default function CenteredComposer({ onSubmit, isActive, isParsing }: Props) {
  const [input, setInput]         = useState("");
  const [focused, setFocused]     = useState(false);
  const [hintIdx, setHintIdx]     = useState(0);
  const [sendPulse, setSendPulse] = useState(false);
  const [composerHovered, setComposerHovered] = useState(false);
  const [showWand, setShowWand] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    setShowWand(val.trim().length >= 5);
  };
  const textareaRef               = useRef<HTMLTextAreaElement>(null);
  const composerRef               = useRef<HTMLDivElement>(null);
  const mouseX                    = useMotionValue(0);
  const mouseY                    = useMotionValue(0);

  // Rotate hints
  useEffect(() => {
    if (isActive) return;
    const id = setInterval(() => setHintIdx(i => (i + 1) % PLACEHOLDER_HINTS.length), 4500);
    return () => clearInterval(id);
  }, [isActive]);

  const rotateX = useTransform(mouseY, [-300, 300], [2, -2]);
  const rotateY = useTransform(mouseX, [-300, 300], [-2, 2]);

  // Mouse-tracking spotlight for the composer card
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = composerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseX.set(x - rect.width / 2);
    mouseY.set(y - rect.height / 2);
    // Set CSS custom properties for the spotlight
    composerRef.current?.style.setProperty("--spot-x", `${x}px`);
    composerRef.current?.style.setProperty("--spot-y", `${y}px`);
    if (!composerHovered) setComposerHovered(true);
  }, [mouseX, mouseY, composerHovered]);

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
    setComposerHovered(false);
  }, [mouseX, mouseY]);

  const send = () => {
    const v = input.trim();
    if (!v) return;
    setSendPulse(true);
    setTimeout(() => setSendPulse(false), 1500);
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
            {/* Glowing oracle sigil */}
            <motion.div
              className="inline-flex relative mb-6"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="relative w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl"
                   style={{
                     background: "linear-gradient(135deg, #D4AF37, #005F6F)",
                     boxShadow: "0 0 40px rgba(212,175,55,0.4), 0 0 80px rgba(212,175,55,0.15)",
                   }}>
                {/* Oracle eye / scales icon */}
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
                {/* Inner glow */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/20 to-transparent" />
              </div>

              {/* Orbiting dot 1 (clockwise, gold) */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 animate-orbit"
                style={{ transformOrigin: "center" }}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: "#D4AF37",
                    boxShadow: "0 0 12px rgba(212,175,55,0.9), 0 0 24px rgba(212,175,55,0.5)",
                  }}
                />
              </div>

              {/* Orbiting dot 2 (counter-clockwise, oracle blue) */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 animate-orbit-reverse"
                style={{ transformOrigin: "center" }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: "#005F6F",
                    boxShadow: "0 0 10px rgba(0,95,111,0.9), 0 0 20px rgba(0,95,111,0.4)",
                  }}
                />
              </div>
            </motion.div>

            {/* Headline with animated gradient */}
            <motion.h1
              className="text-4xl sm:text-5xl font-bold tracking-tight mb-4 leading-none font-serif"
              variants={itemVariants}
            >
              <motion.span
                className="bg-clip-text text-transparent inline-block"
                style={{
                  backgroundImage: "linear-gradient(90deg, #E5E0D8, #D4AF37, #005F6F, #D4AF37, #E5E0D8)",
                  backgroundSize: "400% 100%",
                }}
                animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              >
                Challenge the Oracle.
              </motion.span>
              <br />
              <span className="text-3xl sm:text-4xl font-semibold font-serif" style={{ color: "#8b8b83" }}>
                Divine Law awaits.
              </span>
            </motion.h1>

            <motion.p
              className="text-sm max-w-sm mx-auto leading-relaxed"
              variants={itemVariants}
              style={{ color: "#8b8b83" }}
            >
              Speak your challenge. The Oracle will forge the sacred contract.
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Composer Box ── */}
      <motion.div
        ref={composerRef}
        variants={itemVariants}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ rotateX, rotateY, transformPerspective: 800 }}
        className="relative"
      >
        {/* Outer glow ring — gold */}
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
            background: "linear-gradient(135deg, rgba(212,175,55,0.5), rgba(0,95,111,0.25), rgba(212,175,55,0.2))",
            filter: focused ? "blur(0px)" : "blur(1px)",
          }}
        />

        {/* Card — brushed metal plate */}
        <div className={`relative rounded-2xl overflow-hidden transition-all duration-500 ${
          focused ? "animate-focus-pulse" : "animate-breathe-glow"
        }`}
          data-spotlight=""
          style={{
            background: "#0A0A0B",
            backdropFilter: "blur(24px)",
            border: "1px solid rgba(212,175,55,0.2)",
          }}
        >
          {/* Mouse-tracking spotlight overlay */}
          <div
            className="spotlight-layer absolute inset-0 pointer-events-none rounded-2xl transition-opacity duration-300"
            style={{
              background: "radial-gradient(400px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(212,175,55,0.08), rgba(0,95,111,0.04) 40%, transparent 70%)",
              opacity: focused ? 1 : composerHovered ? 0.7 : 0,
            }}
          />

          {/* Top accent line — gold gradient */}
          <div className="h-px" style={{ background: "linear-gradient(to right, transparent, rgba(212,175,55,0.6), transparent)" }} />

          {/* Parsing overlay */}
          <AnimatePresence>
            {isParsing && (
              <motion.div
                className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl"
                style={{ background: "rgba(10,10,11,0.94)", backdropFilter: "blur(8px)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="relative mb-4">
                  {/* Radial gradient pulse behind icon */}
                  <motion.div
                    className="absolute inset-0 -m-6 rounded-full pointer-events-none"
                    style={{
                      background: "radial-gradient(circle, rgba(212,175,55,0.25) 0%, rgba(0,95,111,0.1) 40%, transparent 70%)",
                    }}
                    animate={{ scale: [1, 1.5, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                  <motion.div
                    className="relative w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #D4AF37, #005F6F)" }}
                    animate={{
                      scale: [1, 1.1, 1],
                      boxShadow: [
                        "0 0 20px rgba(212,175,55,0.3)",
                        "0 0 40px rgba(212,175,55,0.6)",
                        "0 0 20px rgba(212,175,55,0.3)",
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M12 3v1m0 16v1m-9-9h1m16 0h1m-2.636-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
                    </svg>
                  </motion.div>
                </div>
                <motion.p
                  className="text-sm font-bold"
                  style={{ color: "#E5E0D8" }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  The Oracle is forging your contract...
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Header row */}
          <div className="flex items-center gap-2.5 px-5 pt-4 pb-2">
            <div className="relative flex items-center gap-1.5">
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{ background: "#D4AF37" }}
                animate={{ opacity: [0.5, 1, 0.5], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "#8b8b83" }}>
                Oracle Directive
              </span>
              {showWand && !isActive && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  className="ml-1.5 text-sm"
                  title="The Oracle is ready to forge your challenge"
                >
                  &#10024;
                </motion.span>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {[0,1,2].map(i => (
                <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: "#8b8b83" }} />
              ))}
            </div>
          </div>

          {/* Textarea — brushed metal feel */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKey}
            placeholder={isActive ? "Continue the conversation..." : PLACEHOLDER_HINTS[hintIdx]}
            disabled={isParsing}
            rows={isActive ? 2 : 3}
            className="w-full px-5 py-3 text-[15px] resize-none focus:outline-none leading-relaxed font-medium relative z-10"
            style={{
              caretColor: "#D4AF37",
              color: "#E5E0D8",
              background: "transparent",
            }}
          />

          {/* Footer row */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: "1px solid rgba(212,175,55,0.15)" }}>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: "#8b8b83" }}>
              <span className="flex items-center gap-1 group/hint">
                <kbd className={`px-1.5 py-0.5 rounded font-mono text-[9px] transition-all duration-300 ${
                  focused ? "shadow-[0_0_6px_rgba(212,175,55,0.15)]" : ""
                }`} style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  color: focused ? "#E5E0D8" : "#8b8b83",
                }}>&#8629;</kbd>
                send
              </span>
              <span style={{ color: "rgba(139,139,131,0.4)" }}>&middot;</span>
              <span className="flex items-center gap-1 group/hint">
                <kbd className={`px-1.5 py-0.5 rounded font-mono text-[9px] transition-all duration-300 ${
                  focused ? "shadow-[0_0_6px_rgba(212,175,55,0.15)]" : ""
                }`} style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  color: focused ? "#E5E0D8" : "#8b8b83",
                }}>&#8679;&#8629;</kbd>
                newline
              </span>
            </div>

            {/* Send button — gold gradient "Invoke" */}
            <motion.button
              onClick={send}
              disabled={!input.trim() || isParsing}
              whileHover={input.trim() ? { scale: 1.04 } : {}}
              whileTap={input.trim() ? { scale: 0.94 } : {}}
              className={`shimmer-btn flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                sendPulse ? "animate-energy-pulse" : ""
              }`}
              style={input.trim() ? {
                background: "linear-gradient(135deg, #D4AF37, #B8962E, #D4AF37)",
                color: "#0A0A0B",
                boxShadow: "0 4px 24px rgba(212,175,55,0.45), 0 0 40px rgba(212,175,55,0.15), inset 0 1px 0 rgba(255,255,255,0.2)",
                backgroundSize: "200% 100%",
                cursor: "pointer",
              } : {
                background: "rgba(212,175,55,0.1)",
                color: "#8b8b83",
                cursor: "not-allowed",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Invoke
            </motion.button>
          </div>
        </div>
      </motion.div>

      {/* ── Quick Actions — Lex Divina styled ── */}
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
                whileTap={{ scale: 0.95 }}
                className="energy-btn shimmer-btn relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold overflow-hidden group/qb active:scale-95"
                style={{
                  background: "#0A0A0B",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(212,175,55,0.25)",
                  ["--glow-color" as string]: a.from,
                }}
              >
                {/* Hover glow background */}
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover/qb:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{
                    background: `radial-gradient(circle at 50% 50%, ${a.from}18, transparent 70%)`,
                    boxShadow: `inset 0 0 20px ${a.from}10`,
                  }}
                />
                {/* Gradient underline — gold */}
                <div className="absolute bottom-0 inset-x-0 h-px transition-opacity duration-300 opacity-60 group-hover/qb:opacity-100"
                     style={{ background: `linear-gradient(90deg, ${a.from}, ${a.to})` }} />
                {/* Gold dot indicator */}
                <span
                  className="relative w-1.5 h-1.5 rounded-full flex-shrink-0 group-hover/qb:scale-125 transition-transform duration-200"
                  style={{
                    background: "#D4AF37",
                    boxShadow: "0 0 6px rgba(212,175,55,0.7)",
                  }}
                />
                {/* Icon with circular gradient background */}
                <span className="text-base relative flex items-center justify-center w-7 h-7 rounded-full"
                  style={{
                    background: `radial-gradient(circle, ${a.from}20 0%, ${a.to}10 60%, transparent 100%)`,
                  }}
                >{a.icon}</span>
                <span className="relative font-mono" style={{ color: "#E5E0D8" }}>{a.label}</span>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Suggestion cards — inscribed tablets ── */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            key="suggestions"
            className="mt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { delay: 0.9, duration: 0.5 } }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
          >
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.15em] mb-4" style={{ color: "#8b8b83" }}>
              Try saying
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PLACEHOLDER_HINTS.map((s, i) => (
                <motion.button
                  key={s}
                  onClick={() => onSubmit(s)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: 0.95 + i * 0.08 } }}
                  whileHover={{ scale: 1.01, borderColor: "rgba(212,175,55,0.4)" }}
                  whileTap={{ scale: 0.98 }}
                  className="group text-left px-4 py-3.5 rounded-xl transition-all duration-300 relative overflow-hidden"
                  style={{
                    background: "#0A0A0B",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(212,175,55,0.15)",
                  }}
                >
                  {/* Left accent bar that slides in on hover — gold */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full transition-all duration-300 -translate-x-full group-hover:translate-x-0"
                    style={{
                      background: `linear-gradient(180deg, ${SUGGESTION_COLORS[i % SUGGESTION_COLORS.length]}, ${SUGGESTION_COLORS[(i + 1) % SUGGESTION_COLORS.length]})`,
                      boxShadow: `0 0 8px ${SUGGESTION_COLORS[i % SUGGESTION_COLORS.length]}60`,
                    }}
                  />
                  {/* Glass highlight on hover */}
                  <div
                    className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{
                      background: "linear-gradient(135deg, rgba(212,175,55,0.04) 0%, rgba(212,175,55,0.01) 50%, transparent 100%)",
                    }}
                  />
                  <span className="text-sm transition-colors duration-200 relative" style={{ color: "#8b8b83" }}>
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
