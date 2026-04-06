"use client";

import { useState } from "react";

export default function Header() {
  const [walletOpen, setWalletOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-border-subtle">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-text-primary">
            Challenge<span className="text-accent">AI</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {["Explore", "My Challenges", "Leaderboard"].map((item) => (
            <button
              key={item}
              className="px-3.5 py-2 text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover rounded-lg transition-colors"
            >
              {item}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Wallet pill */}
          <div className="relative">
            <button
              onClick={() => setWalletOpen(!walletOpen)}
              className="flex items-center gap-2 px-3.5 py-2 bg-bg-input rounded-xl hover:bg-bg-hover transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-success animate-pulse-soft" />
              <span className="text-sm font-semibold text-text-primary">
                $1,240.00
              </span>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-text-tertiary"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Wallet dropdown */}
            {walletOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-lg border border-border-subtle p-4 animate-float-up">
                <div className="text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3">
                  Wallet Overview
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-secondary">
                      Available
                    </span>
                    <span className="text-sm font-semibold text-success">
                      $1,240.00
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-secondary">
                      In Escrow
                    </span>
                    <span className="text-sm font-semibold text-gold">
                      $360.00
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-text-secondary">
                      Total Won
                    </span>
                    <span className="text-sm font-semibold text-accent">
                      $2,890.00
                    </span>
                  </div>
                  <div className="h-px bg-border-subtle" />
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors">
                      Deposit
                    </button>
                    <button className="flex-1 py-2 text-xs font-semibold text-accent bg-accent-light rounded-lg hover:bg-accent/20 transition-colors">
                      Withdraw
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <button className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-bg-hover transition-colors">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-text-secondary"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-danger rounded-full" />
          </button>

          {/* Avatar */}
          <button className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-teal/20 flex items-center justify-center text-sm font-bold text-accent">
            A
          </button>
        </div>
      </div>
    </header>
  );
}
