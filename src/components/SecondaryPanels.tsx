"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

/* ── Drawer shell ── */
function Drawer({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed top-0 right-0 z-50 h-full w-full max-w-sm overflow-hidden"
            style={{
              background: "rgba(8,8,20,0.97)",
              boxShadow: "-1px 0 0 rgba(255,255,255,0.06), -20px 0 60px rgba(0,0,0,0.6)",
              backdropFilter: "blur(24px)",
            }}
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Top accent */}
            <div className="h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-base font-extrabold text-text-primary">{title}</h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                className="w-8 h-8 rounded-xl flex items-center justify-center border border-border-subtle text-text-muted hover:text-text-primary transition-colors"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </motion.button>
            </div>

            {/* Content */}
            <div className="px-6 pb-6 overflow-y-auto h-[calc(100%-64px)]">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Live Activity ── */
const LIVE_EVENTS = [
  { id:"1", text:"Alex just challenged Sam — 50 pushups in 2 min", time:"just now", type:"new",      stake:"$20" },
  { id:"2", text:"Morgan completed a 5K run in 23:12",              time:"4m ago",  type:"complete",  stake:null  },
  { id:"3", text:"Priya vs Taylor — cooking battle is LIVE",         time:"8m ago",  type:"live",      stake:"500 pts" },
  { id:"4", text:"David won the chess blitz speed match!",           time:"13m ago", type:"result",    stake:"$10" },
  { id:"5", text:"Ravi opened a 100-line coding challenge",          time:"16m ago", type:"new",       stake:"$25" },
  { id:"6", text:"$50 staked on the Saturday 5K run",               time:"21m ago", type:"stake",     stake:"$50" },
  { id:"7", text:"AI judged pasta challenge — Priya wins!",          time:"26m ago", type:"result",    stake:null  },
];

const DOT_COLOR: Record<string, string> = {
  live:     "#ff4757",
  complete: "#00e87a",
  result:   "#00e87a",
  stake:    "#f5a623",
  new:      "#7c5cfc",
};

function LiveContent() {
  return (
    <div className="space-y-1">
      {LIVE_EVENTS.map((e, i) => (
        <motion.div
          key={e.id}
          className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-default"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.06, duration: 0.4, ease: [0.22,1,0.36,1] }}
          whileHover={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div className="relative mt-1.5 flex-shrink-0">
            <div className="w-2 h-2 rounded-full" style={{ background: DOT_COLOR[e.type] }} />
            {e.type === "live" && (
              <div className="absolute inset-0 rounded-full animate-ping" style={{ background: DOT_COLOR[e.type], opacity: 0.4 }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-text-secondary leading-snug">{e.text}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] text-text-muted">{e.time}</span>
              {e.stake && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(245,166,35,0.1)", color: "#f5a623" }}>
                  {e.stake}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Nearby People ── */
const NEARBY = [
  { id:"1", name:"Alex Chen",  dist:"0.2 mi", status:"online",  n:3  },
  { id:"2", name:"Sam Kim",    dist:"0.5 mi", status:"online",  n:7  },
  { id:"3", name:"Jamie Lee",  dist:"1.2 mi", status:"idle",    n:2  },
  { id:"4", name:"Morgan R.",  dist:"2.1 mi", status:"online",  n:12 },
  { id:"5", name:"Casey W.",   dist:"3.4 mi", status:"offline", n:5  },
];
const STATUS_COLOR: Record<string, string> = { online:"#00e87a", idle:"#f5a623", offline:"#ffffff20" };

function NearbyContent() {
  return (
    <div className="space-y-1">
      {NEARBY.map((u, i) => (
        <motion.div
          key={u.id}
          className="group flex items-center gap-3 px-3 py-3 rounded-xl"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22,1,0.36,1] }}
          whileHover={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: "linear-gradient(135deg, rgba(124,92,252,0.3), rgba(0,212,200,0.2))" }}>
              {u.name.split(" ").map(n=>n[0]).join("")}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                 style={{ background: STATUS_COLOR[u.status], borderColor: "rgba(8,8,20,0.97)" }} />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{u.name}</p>
            <p className="text-[11px] text-text-muted">{u.dist} · {u.n} challenges</p>
          </div>

          <motion.button
            className="opacity-0 group-hover:opacity-100 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{ background: "rgba(124,92,252,0.15)", color: "#a78bfa", border: "1px solid rgba(124,92,252,0.25)" }}
            whileHover={{ background: "rgba(124,92,252,0.3)" }}
            whileTap={{ scale: 0.95 }}
          >
            Challenge
          </motion.button>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Wallet ── */
function WalletContent() {
  return (
    <div className="space-y-4">
      {/* Balance card */}
      <motion.div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
          boxShadow: "0 8px 32px rgba(124,92,252,0.3)",
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22,1,0.36,1] }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <p className="text-xs font-semibold text-white/70 mb-1">Available Balance</p>
        <p className="text-3xl font-black text-white">$284.50</p>
        <div className="flex gap-2 mt-4">
          {["Deposit","Withdraw"].map(label => (
            <motion.button
              key={label}
              className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
              style={{ background: "rgba(255,255,255,0.15)" }}
              whileHover={{ background: "rgba(255,255,255,0.25)" }}
              whileTap={{ scale: 0.97 }}
            >
              {label}
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Escrow */}
      <motion.div
        className="flex justify-between px-4 py-3.5 rounded-xl"
        style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.15)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.4 }}
      >
        <div>
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">In Escrow</p>
          <p className="text-xl font-black" style={{ color: "#f5a623" }}>$85.00</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Active Bets</p>
          <p className="text-xl font-black" style={{ color: "#f5a623" }}>3</p>
        </div>
      </motion.div>

      {/* Win/Loss */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label:"Total Won",  val:"$1,240", color:"#00e87a", bg:"rgba(0,232,122,0.08)", border:"rgba(0,232,122,0.15)" },
          { label:"Total Lost", val:"$420",   color:"#ff4757", bg:"rgba(255,71,87,0.08)", border:"rgba(255,71,87,0.15)" },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="px-3.5 py-3.5 rounded-xl"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06, duration: 0.4 }}
          >
            <p className="text-[10px] font-semibold text-text-muted mb-0.5">{s.label}</p>
            <p className="text-lg font-black" style={{ color: s.color }}>{s.val}</p>
          </motion.div>
        ))}
      </div>

      {/* Recent transactions */}
      <div>
        <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-3">Recent</p>
        {[
          { label:"Won: 50 Pushups Challenge", amount:"+$20",  color:"#00e87a" },
          { label:"Staked: 5K Run",            amount:"-$50",  color:"#ff4757" },
          { label:"Deposit",                   amount:"+$100", color:"#00e87a" },
          { label:"Won: Chess Blitz",          amount:"+$10",  color:"#00e87a" },
        ].map((tx, i) => (
          <motion.div
            key={i}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + i * 0.06, duration: 0.35 }}
            whileHover={{ background: "rgba(255,255,255,0.04)" }}
          >
            <span className="text-sm text-text-secondary">{tx.label}</span>
            <span className="text-sm font-extrabold" style={{ color: tx.color }}>{tx.amount}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/* ── Floating Action Bar ── */
const ACTIONS = [
  { key:"live",   icon:"⚡", label:"Live",   badge:"3",  dotColor:"#ff4757" },
  { key:"nearby", icon:"◎",  label:"Nearby", badge:"5",  dotColor:"#00e87a" },
  { key:"wallet", icon:"◈",  label:"Wallet", badge:null, dotColor:null       },
];

export function FloatingActionBar({ visible }: { visible: boolean }) {
  const [active, setActive] = useState<string|null>(null);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            className="fixed bottom-6 left-1/2 z-30"
            style={{ translateX: "-50%" }}
            initial={{ opacity: 0, y: 24, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.93 }}
            transition={{ type: "spring", damping: 22, stiffness: 280, delay: 0.2 }}
          >
            <div
              className="flex items-center gap-1 px-2 py-2 rounded-2xl"
              style={{
                background: "rgba(10,10,24,0.85)",
                backdropFilter: "blur(24px)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.6), 0 0 40px rgba(124,92,252,0.1)",
              }}
            >
              {ACTIONS.map(a => (
                <motion.button
                  key={a.key}
                  onClick={() => setActive(a.key)}
                  className="relative flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-text-secondary transition-colors"
                  whileHover={{
                    background: "rgba(124,92,252,0.12)",
                    color: "#a78bfa",
                  }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="text-base">{a.icon}</span>
                  <span>{a.label}</span>
                  {a.badge && (
                    <span
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black text-white flex items-center justify-center"
                      style={{ background: a.dotColor ?? "#7c5cfc" }}
                    >
                      {a.badge}
                    </span>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={active==="live"}   onClose={()=>setActive(null)} title="Live Activity">
        <LiveContent />
      </Drawer>
      <Drawer open={active==="nearby"} onClose={()=>setActive(null)} title="Nearby People">
        <NearbyContent />
      </Drawer>
      <Drawer open={active==="wallet"} onClose={()=>setActive(null)} title="Wallet & Escrow">
        <WalletContent />
      </Drawer>
    </>
  );
}

export default FloatingActionBar;
