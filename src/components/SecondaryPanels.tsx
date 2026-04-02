"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";
import type { ActivityEventData, ChallengeData } from "@/lib/api-client";

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

/* ── Live Activity (real /api/feed) ── */
const DOT_COLOR: Record<string, string> = {
  challenge_created: "#7c5cfc",
  challenge_accepted: "#00d4c8",
  user_joined: "#00e87a",
  live: "#ff4757",
  default: "#7c5cfc",
};

function formatAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function LiveContent() {
  const [events, setEvents] = useState<ActivityEventData[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.getFeed(25)
      .then((r) => { if (!cancelled) setEvents(r.events); })
      .catch(() => { if (!cancelled) setErr("Could not load feed"); });
    return () => { cancelled = true; };
  }, []);

  if (err) return <p className="text-sm text-text-muted">{err}</p>;
  if (events.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet — publish a public challenge to see it here.</p>;
  }

  return (
    <div className="space-y-1">
      {events.map((e, i) => {
        const dot = DOT_COLOR[e.type] ?? DOT_COLOR.default;
        return (
          <motion.div
            key={e.id}
            className="flex items-start gap-3 px-3 py-3 rounded-xl cursor-default"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ background: "rgba(255,255,255,0.04)" }}
          >
            <div className="relative mt-1.5 flex-shrink-0">
              <div className="w-2 h-2 rounded-full" style={{ background: dot }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-text-secondary leading-snug">{e.message}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-text-muted">{formatAgo(e.createdAt)}</span>
                {e.challenge && e.challenge.stake > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "rgba(245,166,35,0.1)", color: "#f5a623" }}
                  >
                    {e.challenge.stake} cr
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Nearby People (real /api/users/nearby + geolocation) ── */
const STATUS_COLOR: Record<string, string> = { online: "#00e87a", idle: "#f5a623", offline: "#ffffff20" };

function NearbyContent() {
  const { status } = useSession();
  const [users, setUsers] = useState<Array<{
    id: string; username: string; image: string | null; distance: number; isOnline: boolean; challengeCount: number;
  }>>([]);
  const [hint, setHint] = useState<string | null>("Locating…");

  useEffect(() => {
    if (status !== "authenticated") {
      setHint("Sign in and allow location to see nearby challengers.");
      return;
    }
    if (!navigator.geolocation) {
      setHint("Location not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await api.getNearbyUsers(pos.coords.latitude, pos.coords.longitude, 25);
          setUsers(r.users);
          setHint(r.users.length ? null : "No one with saved location nearby yet.");
        } catch {
          setHint("Could not load nearby users.");
        }
      },
      () => setHint("Location denied — enable it in the browser to use Nearby."),
      { enableHighAccuracy: false, timeout: 12_000 },
    );
  }, [status]);

  if (status !== "authenticated") {
    return <p className="text-sm text-text-muted">Sign in to find people near you (we save rough location when you open this panel).</p>;
  }
  if (hint && users.length === 0) {
    return <p className="text-sm text-text-muted">{hint}</p>;
  }

  return (
    <div className="space-y-1">
      {hint && <p className="text-[11px] text-text-muted mb-2">{hint}</p>}
      {users.map((u, i) => (
        <motion.div
          key={u.id}
          className="group flex items-center gap-3 px-3 py-3 rounded-xl"
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ background: "rgba(255,255,255,0.04)" }}
        >
          <div className="relative flex-shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white overflow-hidden"
              style={{ background: "linear-gradient(135deg, rgba(124,92,252,0.3), rgba(0,212,200,0.2))" }}
            >
              {u.image ? <img src={u.image} alt="" className="w-full h-full object-cover" /> : u.username.slice(0, 2).toUpperCase()}
            </div>
            <div
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
              style={{ background: STATUS_COLOR[u.isOnline ? "online" : "offline"], borderColor: "rgba(8,8,20,0.97)" }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary">{u.username}</p>
            <p className="text-[11px] text-text-muted">{u.distance} mi · {u.challengeCount} challenges</p>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

/* ── Discover open challenges ── */
function DiscoverContent({
  onRequireAuth,
  onOpenChallenge,
}: {
  onRequireAuth: () => void;
  onOpenChallenge: (challengeId: string) => void;
}) {
  const { data: session, status } = useSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;
  const [rows, setRows] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setMsg(null);
    api
      .listChallenges({ status: "open", limit: 40 })
      .then((r) => {
        const joinable = r.challenges.filter(
          (c) => c.status === "open" && c.participants.length < (c.maxParticipants ?? 2),
        );
        setRows(joinable);
      })
      .catch(() => setMsg("Could not load challenges."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const join = async (c: ChallengeData) => {
    if (status !== "authenticated" || !uid) {
      onRequireAuth();
      return;
    }
    if (c.creatorId === uid) {
      setMsg("This is your challenge — share the link for a friend to join.");
      return;
    }
    if (c.participants.some((p) => p.user.id === uid)) {
      onOpenChallenge(c.id);
      return;
    }
    try {
      await api.acceptChallenge(c.id);
      onOpenChallenge(c.id);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not join");
    }
  };

  if (loading) return <p className="text-sm text-text-muted">Loading open challenges…</p>;
  if (rows.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-text-muted">No open slots right now. Ask a friend to publish a public challenge, or create one from the chat.</p>
        <motion.button
          type="button"
          onClick={load}
          className="text-xs font-bold text-accent"
          whileTap={{ scale: 0.97 }}
        >
          Refresh
        </motion.button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {msg && <p className="text-xs font-bold text-[#ff4757]">{msg}</p>}
      {rows.map((c, i) => {
        const mine = Boolean(uid && c.creatorId === uid);
        const joined = Boolean(uid && c.participants.some((p) => p.user.id === uid));
        return (
          <motion.div
            key={c.id}
            className="rounded-xl px-3 py-3 space-y-2"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
          >
            <p className="text-sm font-bold text-text-primary leading-snug">{c.title}</p>
            <p className="text-[11px] text-text-muted">
              by @{c.creator.username}
              {c.stake > 0 ? ` · ${c.stake} credits stake` : ""} · {c.participants.length}/{c.maxParticipants ?? 2} players
            </p>
            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => join(c)}
                disabled={mine}
                className="px-3 py-1.5 rounded-lg text-xs font-extrabold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}
              >
                {mine ? "Yours" : joined ? "Open room" : "Join as opponent"}
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  void navigator.clipboard.writeText(`${window.location.origin}/?challenge=${c.id}`);
                  setMsg("Link copied — send it to your opponent.");
                  setTimeout(() => setMsg(null), 2500);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border-subtle text-text-muted"
              >
                Copy invite link
              </motion.button>
            </div>
          </motion.div>
        );
      })}
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
  { key: "discover", icon: "◎", label: "Discover", badge: null as string | null, dotColor: "#7c5cfc" },
  { key: "live", icon: "⚡", label: "Live", badge: null as string | null, dotColor: "#ff4757" },
  { key: "nearby", icon: "📍", label: "Nearby", badge: null as string | null, dotColor: "#00e87a" },
  { key: "wallet", icon: "◈", label: "Wallet", badge: null as string | null, dotColor: null as string | null },
];

export function FloatingActionBar({
  visible,
  onRequireAuth,
  onOpenChallenge,
}: {
  visible: boolean;
  onRequireAuth?: () => void;
  onOpenChallenge?: (challengeId: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);

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
                  {a.badge ? (
                    <span
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black text-white flex items-center justify-center"
                      style={{ background: a.dotColor ?? "#7c5cfc" }}
                    >
                      {a.badge}
                    </span>
                  ) : null}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Drawer open={active === "discover"} onClose={() => setActive(null)} title="Open challenges">
        <DiscoverContent
          onRequireAuth={() => onRequireAuth?.()}
          onOpenChallenge={(id) => {
            onOpenChallenge?.(id);
            setActive(null);
          }}
        />
      </Drawer>
      <Drawer open={active === "live"} onClose={() => setActive(null)} title="Live Activity">
        <LiveContent />
      </Drawer>
      <Drawer open={active === "nearby"} onClose={() => setActive(null)} title="Nearby People">
        <NearbyContent />
      </Drawer>
      <Drawer open={active === "wallet"} onClose={() => setActive(null)} title="Wallet & Escrow">
        <WalletContent />
      </Drawer>
    </>
  );
}

export default FloatingActionBar;
