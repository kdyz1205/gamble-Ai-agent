"use client";

import { useState } from "react";

/* ────────────────────────────────────────────
   Slide-out drawer shell
   ──────────────────────────────────────────── */
function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/10 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-full w-full max-w-md bg-white shadow-2xl transition-transform duration-500 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <h2 className="text-base font-bold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-bg-hover transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto h-[calc(100%-60px)]">{children}</div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────
   Live Activity Panel
   ──────────────────────────────────────────── */
const liveEvents = [
  { id: "1", text: "Alex just challenged Sam to 50 pushups", time: "2m ago", type: "new" },
  { id: "2", text: "Morgan completed a 5K run in 23:12", time: "5m ago", type: "complete" },
  { id: "3", text: "Priya vs Taylor — cooking battle is LIVE", time: "8m ago", type: "live" },
  { id: "4", text: "David won the chess speed match!", time: "12m ago", type: "result" },
  { id: "5", text: "Ravi started a coding challenge", time: "15m ago", type: "new" },
  { id: "6", text: "$50 staked on 5K run challenge", time: "20m ago", type: "stake" },
  { id: "7", text: "AI judged pasta challenge — Priya wins!", time: "25m ago", type: "result" },
];

function LiveActivityContent() {
  return (
    <div className="space-y-3">
      {liveEvents.map((event) => (
        <div
          key={event.id}
          className="flex items-start gap-3 px-3 py-3 rounded-xl hover:bg-bg-hover transition-colors"
        >
          <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full mt-1.5 ${
            event.type === "live" ? "bg-danger animate-pulse-dot" :
            event.type === "complete" || event.type === "result" ? "bg-success" :
            event.type === "stake" ? "bg-gold" :
            "bg-accent"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-primary leading-snug">{event.text}</p>
            <p className="text-xs text-text-tertiary mt-0.5">{event.time}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   Nearby Friends Panel
   ──────────────────────────────────────────── */
const nearbyUsers = [
  { id: "1", name: "Alex Chen", distance: "0.2 mi", status: "online", challenges: 3 },
  { id: "2", name: "Sam Kim", distance: "0.5 mi", status: "online", challenges: 7 },
  { id: "3", name: "Jamie Lee", distance: "1.2 mi", status: "idle", challenges: 2 },
  { id: "4", name: "Morgan R.", distance: "2.1 mi", status: "online", challenges: 12 },
  { id: "5", name: "Casey W.", distance: "3.4 mi", status: "offline", challenges: 5 },
];

function NearbyContent() {
  return (
    <div className="space-y-2">
      {nearbyUsers.map((user) => (
        <div
          key={user.id}
          className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-bg-hover transition-colors group"
        >
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent/20 to-teal/20 flex items-center justify-center">
              <span className="text-sm font-bold text-accent">
                {user.name.split(" ").map(n => n[0]).join("")}
              </span>
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
              user.status === "online" ? "bg-success" :
              user.status === "idle" ? "bg-gold" :
              "bg-gray-300"
            }`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">{user.name}</p>
            <p className="text-xs text-text-tertiary">{user.distance} · {user.challenges} challenges</p>
          </div>
          <button className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-dark transition-all duration-300">
            Challenge
          </button>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────────────────
   Wallet Panel
   ──────────────────────────────────────────── */
function WalletContent() {
  return (
    <div className="space-y-5">
      {/* Balance Card */}
      <div className="rounded-2xl bg-gradient-to-br from-accent to-teal p-5 text-white">
        <p className="text-xs font-medium text-white/70 mb-1">Available Balance</p>
        <p className="text-3xl font-bold">$284.50</p>
        <div className="flex items-center gap-4 mt-4">
          <button className="flex-1 py-2 rounded-xl bg-white/20 text-sm font-semibold hover:bg-white/30 transition-colors">
            Deposit
          </button>
          <button className="flex-1 py-2 rounded-xl bg-white/20 text-sm font-semibold hover:bg-white/30 transition-colors">
            Withdraw
          </button>
        </div>
      </div>

      {/* Escrow */}
      <div className="px-4 py-3 rounded-xl bg-gold-light/50 border border-gold/20">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-text-tertiary">In Escrow</p>
            <p className="text-lg font-bold text-amber-700">$85.00</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-text-tertiary">Active Bets</p>
            <p className="text-lg font-bold text-amber-700">3</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 py-3 rounded-xl bg-success-light/50 border border-success/10">
          <p className="text-xs text-text-tertiary mb-0.5">Total Won</p>
          <p className="text-base font-bold text-green-700">$1,240</p>
        </div>
        <div className="px-3 py-3 rounded-xl bg-danger-light/50 border border-danger/10">
          <p className="text-xs text-text-tertiary mb-0.5">Total Lost</p>
          <p className="text-base font-bold text-red-700">$420</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3">Recent Transactions</h3>
        <div className="space-y-2">
          {[
            { label: "Won: 50 Pushups Challenge", amount: "+$20", color: "text-green-600" },
            { label: "Staked: 5K Run", amount: "-$50", color: "text-red-500" },
            { label: "Deposit", amount: "+$100", color: "text-green-600" },
            { label: "Won: Chess Blitz", amount: "+$10", color: "text-green-600" },
          ].map((tx, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors">
              <span className="text-sm text-text-secondary">{tx.label}</span>
              <span className={`text-sm font-bold ${tx.color}`}>{tx.amount}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────
   Floating Action Bar (appears after conversation starts)
   ──────────────────────────────────────────── */
export function FloatingActionBar({ visible }: { visible: boolean }) {
  const [activeDrawer, setActiveDrawer] = useState<string | null>(null);

  if (!visible) return null;

  const actions = [
    { key: "live", icon: "⚡", label: "Live", badge: "3" },
    { key: "nearby", icon: "📍", label: "Nearby", badge: "5" },
    { key: "wallet", icon: "💳", label: "Wallet", badge: null },
  ];

  return (
    <>
      {/* Floating bar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-slide-up">
        <div className="flex items-center gap-1 px-2 py-2 rounded-2xl glass-strong border border-border-subtle shadow-xl">
          {actions.map((action) => (
            <button
              key={action.key}
              onClick={() => setActiveDrawer(action.key)}
              className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-all duration-300"
            >
              <span>{action.icon}</span>
              <span>{action.label}</span>
              {action.badge && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-[9px] font-bold text-white flex items-center justify-center">
                  {action.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Drawers */}
      <Drawer
        open={activeDrawer === "live"}
        onClose={() => setActiveDrawer(null)}
        title="Live Activity"
      >
        <LiveActivityContent />
      </Drawer>

      <Drawer
        open={activeDrawer === "nearby"}
        onClose={() => setActiveDrawer(null)}
        title="Nearby People"
      >
        <NearbyContent />
      </Drawer>

      <Drawer
        open={activeDrawer === "wallet"}
        onClose={() => setActiveDrawer(null)}
        title="Wallet & Escrow"
      >
        <WalletContent />
      </Drawer>
    </>
  );
}

export default FloatingActionBar;
