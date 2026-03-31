"use client";

import { useState, useRef, useEffect } from "react";

interface CenteredComposerProps {
  onSubmit: (message: string) => void;
  isActive: boolean;
}

const suggestions = [
  "I bet my friend I can do 50 pushups in 2 min",
  "Who can run 5K faster this weekend?",
  "I want to challenge someone to a cooking battle",
  "Let's bet on who finishes the book first",
];

const quickActions = [
  { label: "Fitness", icon: "💪", color: "from-violet-500/10 to-purple-500/10 text-violet-700 border-violet-200" },
  { label: "Video Proof", icon: "🎥", color: "from-blue-500/10 to-cyan-500/10 text-blue-700 border-blue-200" },
  { label: "Nearby", icon: "📍", color: "from-teal-500/10 to-emerald-500/10 text-teal-700 border-teal-200" },
  { label: "Money Stake", icon: "💰", color: "from-amber-500/10 to-yellow-500/10 text-amber-700 border-amber-200" },
  { label: "Free Mode", icon: "🎯", color: "from-rose-500/10 to-pink-500/10 text-rose-700 border-rose-200" },
];

export default function CenteredComposer({ onSubmit, isActive }: CenteredComposerProps) {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Rotate placeholder text
  useEffect(() => {
    if (isActive) return;
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % suggestions.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [isActive]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    onSubmit(text);
  };

  const handleQuickAction = (label: string) => {
    const prompts: Record<string, string> = {
      "Fitness": "I want to create a fitness challenge",
      "Video Proof": "I want to create a challenge with video proof",
      "Nearby": "Show me challenges from people nearby",
      "Money Stake": "I want to create a challenge with a money stake",
      "Free Mode": "I want to create a free challenge, no money involved",
    };
    onSubmit(prompts[label] || label);
  };

  return (
    <div
      className={`w-full transition-all duration-700 ease-out ${
        isActive
          ? "max-w-2xl"
          : "max-w-2xl"
      }`}
    >
      {/* Logo & Title */}
      {!isActive && (
        <div className="text-center mb-8 animate-float-up">
          {/* Logo */}
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-teal mb-5 shadow-lg shadow-accent/20">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-text-primary tracking-tight mb-3">
            Challenge Anyone
          </h1>
          <p className="text-base text-text-secondary max-w-md mx-auto leading-relaxed">
            Describe your challenge in natural language. <br className="hidden sm:block" />
            AI will structure it, match opponents, and judge the result.
          </p>
        </div>
      )}

      {/* Input Container */}
      <div
        className={`relative transition-all duration-500 ${
          isFocused || isActive
            ? "animate-glow-focus"
            : "animate-glow-breathe"
        } rounded-2xl`}
      >
        <div className="relative glass-strong rounded-2xl border border-border-subtle overflow-hidden">
          {/* AI badge */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-1">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
              <span className="text-xs font-medium text-text-tertiary uppercase tracking-wider">
                AI Challenge Creator
              </span>
            </div>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder={suggestions[placeholderIndex]}
            rows={isActive ? 2 : 3}
            className="w-full bg-transparent px-5 py-3 text-base text-text-primary placeholder:text-text-tertiary/60 resize-none focus:outline-none leading-relaxed"
          />

          {/* Bottom bar */}
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <div className="flex items-center gap-2 text-xs text-text-tertiary">
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input text-[10px] font-medium">Enter</kbd>
              <span>to send</span>
              <span className="mx-1">·</span>
              <kbd className="px-1.5 py-0.5 rounded bg-bg-input text-[10px] font-medium">Shift+Enter</kbd>
              <span>for new line</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                input.trim()
                  ? "bg-accent text-white shadow-md shadow-accent/25 hover:bg-accent-dark hover:shadow-lg hover:shadow-accent/30 active:scale-95"
                  : "bg-bg-input text-text-tertiary cursor-not-allowed"
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {!isActive && (
        <div className="mt-6 animate-float-up-delayed">
          <div className="flex flex-wrap justify-center gap-2">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => handleQuickAction(action.label)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium bg-gradient-to-r ${action.color} border backdrop-blur-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300`}
              >
                <span>{action.icon}</span>
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Typing Suggestions */}
      {!isActive && (
        <div className="mt-8 animate-float-up-delayed">
          <p className="text-xs text-text-tertiary text-center mb-3 font-medium uppercase tracking-wider">
            Try saying
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                className="group text-left px-4 py-3 rounded-xl border border-border-subtle bg-white/60 hover:bg-white hover:border-accent/30 hover:shadow-sm transition-all duration-300"
              >
                <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">
                  &ldquo;{suggestion}&rdquo;
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
