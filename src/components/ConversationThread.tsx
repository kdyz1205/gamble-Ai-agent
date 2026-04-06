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

/* ── Lex Divina palette ── */
const lex = {
  oracleBlue: "#005F6F",
  gold: "#D4AF37",
  goldDim: "rgba(212,175,55,0.15)",
  goldBorder: "rgba(212,175,55,0.35)",
  goldHover: "rgba(212,175,55,0.9)",
  obsidian: "#1a1a1a",
  parchment: "#E5E0D8",
  secondary: "#8b8b83",
  brushedMetal: "linear-gradient(135deg, #2a2d2e 0%, #1e2122 40%, #2a2d2e 100%)",
  userBg: "linear-gradient(135deg, #2e2816 0%, #1f1b0e 100%)",
  insetShadowAI:
    "inset 0 2px 6px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(212,175,55,0.06), 0 1px 2px rgba(0,0,0,0.3)",
  insetShadowUser:
    "inset 0 2px 6px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(212,175,55,0.1), 0 1px 2px rgba(0,0,0,0.3)",
};

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
      <div
        className="px-4 py-3.5 rounded-2xl rounded-tl-md border"
        style={{
          background: lex.brushedMetal,
          borderColor: lex.goldBorder,
          boxShadow: lex.insetShadowAI,
        }}
      >
        <div className="flex flex-col items-start gap-1.5">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: lex.gold }}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
              />
            ))}
          </div>
          <span className="text-[10px] font-medium" style={{ color: lex.secondary }}>
            The Oracle deliberates...
          </span>
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
        background: `linear-gradient(135deg, ${lex.gold}, #b8962e)`,
        boxShadow: `0 0 20px rgba(212,175,55,0.35)`,
      }}
      animate={{
        boxShadow: [
          "0 0 16px rgba(212,175,55,0.25)",
          "0 0 24px rgba(212,175,55,0.5)",
          "0 0 16px rgba(212,175,55,0.25)",
        ],
      }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <span className="text-base leading-none" role="img" aria-label="scales of justice">
        ⚖
      </span>
      {/* Subtle orbiting dot */}
      <motion.div
        className="absolute w-1.5 h-1.5 rounded-full"
        style={{ background: lex.oracleBlue, boxShadow: `0 0 6px ${lex.oracleBlue}` }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        initial={{ x: 14, y: 0 }}
      />
    </motion.div>
  );
}

function UserAvatar() {
  return (
    <div
      className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
      style={{
        background: `linear-gradient(135deg, ${lex.gold}, #a08030)`,
        boxShadow: "0 0 12px rgba(212,175,55,0.25)",
      }}
    >
      <span className="text-xs font-bold" style={{ color: lex.obsidian }}>
        Y
      </span>
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
        {/* Role label */}
        <span
          className="text-[9px] font-bold uppercase tracking-[0.15em] px-1"
          style={{ color: isAI ? lex.oracleBlue : lex.gold }}
        >
          {isAI ? "ORACLE" : "YOU"}
        </span>

        {/* Bubble */}
        <motion.div
          className={`px-4 py-3 text-sm leading-relaxed font-medium rounded-2xl ${
            isAI ? "rounded-tl-md" : "rounded-tr-md"
          }`}
          style={{
            background: isAI ? lex.brushedMetal : lex.userBg,
            border: `1px solid ${isAI ? lex.goldBorder : "rgba(212,175,55,0.2)"}`,
            boxShadow: isAI ? lex.insetShadowAI : lex.insetShadowUser,
            color: lex.parchment,
          }}
          whileHover={isAI ? { borderColor: "rgba(0,95,111,0.3)" } : {}}
        >
          {/* Render markdown-style bold */}
          {message.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
            if (part.startsWith("**") && part.endsWith("**")) {
              return (
                <strong
                  key={i}
                  className="font-extrabold"
                  style={{ color: lex.gold, textShadow: `0 0 8px rgba(212,175,55,0.3)` }}
                >
                  {part.slice(2, -2)}
                </strong>
              );
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
                  boxShadow: `0 4px 20px rgba(212,175,55,0.2)`,
                  borderColor: lex.gold,
                  color: lex.goldHover,
                }}
                whileTap={{ scale: 0.95 }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold border transition-all duration-300"
                style={{
                  background: lex.obsidian,
                  borderColor: lex.goldBorder,
                  color: lex.secondary,
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
