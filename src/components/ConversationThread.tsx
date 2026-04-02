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
      <div className="px-4 py-3.5 rounded-2xl rounded-tl-md border border-border-subtle"
           style={{ background: "rgba(19,19,38,0.9)", backdropFilter: "blur(12px)" }}>
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/60 typing-dot" />
          ))}
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
      animate={{ boxShadow: ["0 0 20px rgba(124,92,252,0.35)", "0 0 30px rgba(124,92,252,0.5)", "0 0 20px rgba(124,92,252,0.35)"] }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    </motion.div>
  );
}

function UserAvatar() {
  return (
    <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
         style={{ background: "linear-gradient(135deg, #3b82f6, #6366f1)" }}>
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
      initial={{ opacity: 0, y: 18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: index * 0.04 }}
    >
      {isAI ? <AIAvatar /> : <UserAvatar />}

      <div className={`flex flex-col gap-2.5 max-w-[82%] ${isAI ? "" : "items-end"}`}>
        {/* Bubble */}
        <div
          className={`px-4 py-3 text-sm leading-relaxed font-medium rounded-2xl ${
            isAI
              ? "rounded-tl-md border border-border-subtle text-text-primary"
              : "rounded-tr-md text-white"
          }`}
          style={isAI
            ? { background: "rgba(19,19,38,0.9)", backdropFilter: "blur(12px)" }
            : {
                background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                boxShadow: "0 4px 20px rgba(124,92,252,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
              }
          }
        >
          {message.content}
        </div>

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
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1, transition: { delay: 0.3 + i * 0.06 } }}
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                className="shimmer-btn px-3.5 py-2 rounded-xl text-xs font-bold border transition-all duration-300"
                style={{
                  background: "rgba(124,92,252,0.08)",
                  borderColor: "rgba(124,92,252,0.25)",
                  color: "rgba(167,139,250,0.9)",
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(124,92,252,0.2)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,92,252,0.5)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(124,92,252,0.2)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(124,92,252,0.08)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(124,92,252,0.25)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "none";
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
    <div className="flex flex-col gap-5 max-h-[45vh] overflow-y-auto pr-2 pb-1">
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
