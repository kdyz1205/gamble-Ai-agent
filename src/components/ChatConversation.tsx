"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAmbientMotionAllowed } from "@/lib/use-motion-policy";

/**
 * LuckyPlay chat thread. Each Turn is either a plain user message, a plain
 * AI message, or an AI message with an inline structured card slotted below
 * the text (used for the current / updated draft).
 *
 * The whole point: the user experience of BUILDING a bet should feel like
 * talking to ChatGPT — you say something, AI talks back, a structured card
 * materializes, you tweak by typing, AI replies + updates the card.
 * Previously the product jumped from composer to a silent DraftPanel with
 * no conversational glue. This component IS the glue.
 */

export interface Turn {
  id: string;
  role: "user" | "ai";
  text: string;
  card?: ReactNode;      // optional slot: an AI turn can have a DraftPanel below its message
}

interface Props {
  turns: Turn[];
  isAiThinking: boolean; // shows the typing indicator as the final row
}

// LuckyPlay palette
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";

function AIAvatar({ animate }: { animate: boolean }) {
  return (
    <motion.div
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${MINT} 0%, ${PEACH} 100%)`,
        boxShadow: "0 2px 8px rgba(251,146,60,0.25)",
      }}
      animate={animate ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={animate ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      aria-label="AI"
    >
      <span className="text-sm" role="img" aria-hidden>✨</span>
    </motion.div>
  );
}

function UserAvatar() {
  return (
    <div
      className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black"
      style={{
        background: PEACH,
        color: PEACH_TEXT,
        boxShadow: "0 2px 6px rgba(251,146,60,0.2)",
      }}
      aria-label="You"
    >
      YOU
    </div>
  );
}

function TypingIndicator({ animate }: { animate: boolean }) {
  return (
    <motion.div
      className="flex items-start gap-2.5"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.18 } }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      <AIAvatar animate={animate} />
      <div
        className="lp-glass px-3.5 py-2.5 rounded-2xl rounded-tl-md flex items-center gap-1.5"
        style={{ minHeight: 40 }}
      >
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: PEACH_DARK }}
            animate={animate ? { y: [0, -4, 0], opacity: [0.4, 1, 0.4] } : { y: 0, opacity: 0.6 }}
            transition={animate ? { duration: 1.1, repeat: Infinity, delay: i * 0.14, ease: "easeInOut" } : { duration: 0 }}
          />
        ))}
      </div>
    </motion.div>
  );
}

function Bubble({ turn, index }: { turn: Turn; index: number }) {
  const isAI = turn.role === "ai";

  return (
    <motion.div
      className={`flex items-start gap-2.5 ${isAI ? "" : "flex-row-reverse"}`}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: Math.min(index * 0.03, 0.15) }}
    >
      {isAI ? <AIAvatar animate={false} /> : <UserAvatar />}

      <div className={`flex flex-col gap-2 ${isAI ? "items-start" : "items-end"} max-w-[85%] w-full`}>
        {/* Tiny role label — fades after a second so the thread stays clean */}
        <span className="text-[9px] font-black uppercase tracking-[0.12em] px-1"
              style={{ color: isAI ? MINT_TEXT : PEACH_TEXT, opacity: 0.7 }}>
          {isAI ? "AI" : "YOU"}
        </span>

        {/* Text bubble */}
        {turn.text && (
          <div
            className={`px-3.5 py-2.5 text-sm leading-relaxed font-medium ${
              isAI ? "lp-glass rounded-2xl rounded-tl-md" : "rounded-2xl rounded-tr-md"
            }`}
            style={
              isAI
                ? { color: NAVY }
                : {
                    background: PEACH,
                    color: PEACH_TEXT,
                    boxShadow: "0 2px 8px rgba(251,146,60,0.25)",
                  }
            }
          >
            {/* Simple markdown-ish bold */}
            {turn.text.split(/(\*\*.*?\*\*)/).map((part, i) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <strong key={i} className="font-extrabold" style={{ color: isAI ? PEACH_TEXT : NAVY }}>
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={i}>{part}</span>;
            })}
          </div>
        )}

        {/* Inline card slot — DraftPanel or similar. Only AI can attach one. */}
        {isAI && turn.card && (
          <motion.div
            className="w-full"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {turn.card}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default function ChatConversation({ turns, isAiThinking }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const allowAnim = useAmbientMotionAllowed();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns.length, isAiThinking]);

  if (turns.length === 0 && !isAiThinking) return null;

  return (
    <div className="flex flex-col gap-4 pb-3" aria-label="Conversation with AI">
      <AnimatePresence initial={false}>
        {turns.map((t, i) => (
          <Bubble key={t.id} turn={t} index={i} />
        ))}
        {isAiThinking && <TypingIndicator key="typing" animate={allowAnim} />}
      </AnimatePresence>
      <div ref={bottomRef} />
      <span className="sr-only" aria-live="polite">
        {isAiThinking ? "AI is thinking" : `${turns.length} turns`}
      </span>
    </div>
  );
}

// Token exports so the page can render a consistent "you said" style for placeholder text etc.
export const CHAT_TOKENS = { PEACH, PEACH_DARK, PEACH_TEXT, MINT, MINT_TEXT, NAVY, NAVY_DIM };
