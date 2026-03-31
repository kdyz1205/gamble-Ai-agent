"use client";

import { useState } from "react";

const suggestions = [
  "I bet I can do 50 pushups in 2 minutes",
  "Who can run 5K faster this weekend?",
  "I challenge my friend to a coding contest",
  "Bet $20 on who finishes the book first",
];

const quickActions = [
  { label: "Fitness", icon: "💪", color: "bg-teal-light text-teal" },
  { label: "Video Proof", icon: "🎥", color: "bg-accent-light text-accent" },
  { label: "Nearby", icon: "📍", color: "bg-gold-light text-gold" },
  { label: "Money Stake", icon: "💰", color: "bg-success-light text-success" },
  { label: "Free Mode", icon: "🎯", color: "bg-bg-input text-text-secondary" },
];

export default function ChallengeInput() {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Headline */}
      <div className="text-center mb-8">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-text-primary mb-3">
          Challenge <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-teal">Anyone</span>
        </h1>
        <p className="text-base sm:text-lg text-text-secondary max-w-md mx-auto">
          Describe your challenge in plain English. AI will structure, match, and arbitrate it.
        </p>
      </div>

      {/* Input area */}
      <div
        className={`relative bg-white rounded-2xl border-2 transition-all duration-300 ${
          focused
            ? "border-accent shadow-lg animate-glow"
            : "border-border-subtle shadow-sm hover:border-border-focus/30 hover:shadow-md"
        }`}
      >
        <div className="flex items-start p-2">
          {/* AI icon */}
          <div className="flex-shrink-0 mt-2 ml-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z" />
                <circle cx="9" cy="15" r="1" />
                <circle cx="15" cy="15" r="1" />
              </svg>
            </div>
          </div>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Describe your challenge... e.g. &quot;I bet I can run 5K under 25 minutes this Saturday&quot;"
            rows={2}
            className="flex-1 px-3 py-3 text-base text-text-primary placeholder-text-tertiary bg-transparent resize-none outline-none"
          />

          {/* Send button */}
          <div className="flex-shrink-0 mt-2 mr-2">
            <button
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                input.trim()
                  ? "bg-accent text-white shadow-md hover:bg-accent-dark hover:shadow-lg scale-100"
                  : "bg-bg-input text-text-tertiary scale-95"
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Typing suggestions */}
        {focused && !input && (
          <div className="px-4 pb-3 border-t border-border-subtle/50">
            <div className="pt-3 space-y-1.5 stagger-children">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setInput(s);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors animate-float-up"
                >
                  <span className="text-accent mr-2">→</span> {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Quick action pills */}
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        {quickActions.map((action) => (
          <button
            key={action.label}
            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium ${action.color} hover:opacity-80 transition-all duration-200 hover:scale-105`}
          >
            <span>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
