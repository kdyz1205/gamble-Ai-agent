"use client";

import { useEffect, useRef } from "react";

export interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
  options?: string[];
}

interface ConversationThreadProps {
  messages: Message[];
  isTyping: boolean;
  onOptionSelect: (option: string) => void;
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center shadow-sm">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-white border border-border-subtle shadow-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-accent/60 typing-dot" />
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  onOptionSelect,
}: {
  message: Message;
  onOptionSelect: (option: string) => void;
}) {
  const isAI = message.role === "ai";

  return (
    <div
      className={`flex items-start gap-3 animate-slide-up ${
        isAI ? "" : "flex-row-reverse"
      }`}
    >
      {/* Avatar */}
      {isAI ? (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center shadow-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      ) : (
        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
          <span className="text-xs font-bold text-white">Y</span>
        </div>
      )}

      {/* Message Content */}
      <div className={`max-w-[80%] ${isAI ? "" : "text-right"}`}>
        <div
          className={`inline-block px-4 py-3 text-sm leading-relaxed ${
            isAI
              ? "rounded-2xl rounded-tl-md bg-white border border-border-subtle shadow-sm text-text-primary"
              : "rounded-2xl rounded-tr-md bg-accent text-white shadow-md shadow-accent/20"
          }`}
        >
          {message.content}
        </div>

        {/* Option buttons */}
        {isAI && message.options && message.options.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2.5">
            {message.options.map((option) => (
              <button
                key={option}
                onClick={() => onOptionSelect(option)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium border border-accent/20 bg-accent-light/50 text-accent hover:bg-accent hover:text-white hover:shadow-md hover:shadow-accent/20 transition-all duration-300 active:scale-95"
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConversationThread({
  messages,
  isTyping,
  onOptionSelect,
}: ConversationThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div
      ref={scrollRef}
      className="flex flex-col gap-4 max-h-[40vh] overflow-y-auto pr-1 py-2"
    >
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onOptionSelect={onOptionSelect}
        />
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}
