"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  options?: string[];
}

interface Props {
  messages: Message[];
  isTyping: boolean;
  onOptionSelect: (option: string) => void;
}

/* ── Typing indicator ── */
function TypingIndicator() {
  return (
    <motion.div
      className="flex items-start gap-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <AIAvatar />
      <div className="px-4 py-3.5 rounded-2xl rounded-tl-md glass-card border border-border-subtle">
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
              />
            ))}
          </div>
          <span className="text-[10px] font-medium text-text-muted">AI is thinking</span>
        </div>
      </div>
    </motion.div>
  );
}

function AIAvatar() {
  return (
    <motion.div
      className="flex-shrink-0 relative w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
      style={{
        background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
        boxShadow: "0 0 20px rgba(124,92,252,0.35)"
      }}
      animate={{
        boxShadow: [
          "0 0 16px rgba(124,92,252,0.25)",
          "0 0 24px rgba(124,92,252,0.45)",
          "0 0 16px rgba(124,92,252,0.25)"
        ]
      }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
      {/* Subtle orbiting dot */}
      <motion.div
        className="absolute w-1.5 h-1.5 rounded-full bg-teal"
        style={{ boxShadow: "0 0 6px rgba(0,212,200,0.8)" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        initial={{ x: 14, y: 0 }}
      />
    </motion.div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
         style={{
           background: "linear-gradient(135deg, #3b82f6, #6366f1)",
           boxShadow: "0 0 12px rgba(99,102,241,0.25)"
         }}>
      <span className="text-xs font-bold text-white">Y</span>
    </div>
  );
}

function MessageBubble({ message, onOptionSelect, index }: {
  message: Message;
  onOptionSelect: (o: string) => void;
  index: number;
}) {
  const isAI = message.role === "ai";

  return (
    <motion.div
      className={`flex items-start gap-3 ${isAI ? "" : "flex-row-reverse"}`}
      initial={{ opacity: 0, x: isAI ? -20 : 20, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
    >
      {isAI ? <AIAvatar /> : <UserAvatar />}

      <div className={`flex flex-col gap-2.5 max-w-[82%] ${isAI ? "" : "items-end"}`}>
        {/* Bubble */}
        <motion.div
          className={`px-4 py-3 text-sm leading-relaxed font-medium rounded-2xl ${
            isAI
              ? "rounded-tl-md glass-card border border-border-subtle text-text-primary"
              : "rounded-tr-md text-white"
          }`}
          style={isAI
            ? {}
            : {
                background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                boxShadow: "0 4px 20px rgba(124,92,252,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              }
          }
          whileHover={isAI ? { borderColor: "rgba(124,92,252,0.15)" } : {}}
        >
          {/* Render markdown-style bold */}
          {message.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return <strong key={i} className="font-extrabold text-accent" style={{ textShadow: "0 0 8px rgba(124,92,252,0.3)" }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={i}>{part}</span>;
          })}
        </motion.div>

        {/* Option pills */}
        {isAI && message.options && message.options.length > 0 && (
          <motion.div
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            {message.options.map((opt, i) => (
              <motion.button
                key={opt}
                onClick={() => onOptionSelect(opt)}
                initial={{ opacity: 0, scale: 0.9, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: { delay: 0.3 + i * 0.06 } }}
                whileHover={{
                  scale: 1.05,
                  y: -2,
                  boxShadow: "0 4px 20px rgba(124,92,252,0.2)",
                  backdropFilter: "blur(4px)",
                  borderLeft: "2px solid rgba(124,92,252,0.6)",
                }}
                whileTap={{ scale: 0.95 }}
                className="shimmer-btn px-3.5 py-2 rounded-xl text-xs font-bold border transition-all duration-300"
                style={{
                  background: "rgba(124,92,252,0.08)",
                  borderColor: "rgba(124,92,252,0.25)",
                  color: "rgba(167,139,250,0.9)",
                }}
              >
                {opt}
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default function ConversationThread({ messages, isTyping, onOptionSelect }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col gap-5 max-h-[50vh] overflow-y-auto pr-2 pb-1"
         style={{ scrollbarGutter: "stable" }}>
      <AnimatePresence initial={false}>
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onOptionSelect={onOptionSelect}
            index={i}
          />
        ))}
        {isTyping && <TypingIndicator key="typing" />}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  );
}
