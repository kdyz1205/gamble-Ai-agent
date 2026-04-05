"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import * as api from "@/lib/api-client";
import type { ActivityEventData, ChallengeData } from "@/lib/api-client";
import { LiveChallengeCard } from "@/components/ChallengeCard";

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
            transition={{ type: "spring", damping: 24, stiffness: 260, mass: 0.8 }}
          >
            {/* Plasma line at top */}
            <div className="plasma-line" />

            {/* Left accent strip */}
            <div
              className="absolute left-0 top-0 bottom-0 w-[2px]"
              style={{
                background: "linear-gradient(180deg, #7c5cfc 0%, #00d4c8 40%, #00e87a 70%, transparent 100%)",
                opacity: 0.5,
              }}
            />

            {/* Top accent */}
            <div className="h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="text-base font-extrabold text-text-primary">{title}</h2>
              <motion.button
                onClick={onClose}
                whileHover={{ scale: 1.15, rotate: 90 }}
                whileTap={{ scale: 0.85 }}
                className="w-8 h-8 rounded-xl flex items-center justify-center border border-border-subtle text-text-muted hover:text-text-primary hover:border-accent/40 transition-all duration-300"
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
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    return `${m}m ago`;
  }
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
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
              <motion.div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: dot, boxShadow: `0 0 6px ${dot}80` }}
                animate={{
                  boxShadow: [
                    `0 0 4px ${dot}60`,
                    `0 0 10px ${dot}90`,
                    `0 0 4px ${dot}60`,
                  ],
                }}
                transition={{ duration: e.type === "live" ? 1 : 2.5, repeat: Infinity, ease: "easeInOut" }}
              />
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

/* ── Nearby + plaza (GET /api/users/nearby — challenges always when DB has open slots) ── */
const STATUS_COLOR: Record<string, string> = { online: "#00e87a", idle: "#f5a623", offline: "#ffffff20" };

function NearbyContent({ onRequireAuth }: { onRequireAuth?: () => void }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const uid = (session?.user as { id?: string } | undefined)?.id;

  const [users, setUsers] = useState<Array<{
    id: string; username: string; image: string | null; distance: number; isOnline: boolean; challengeCount: number;
  }>>([]);
  const [challenges, setChallenges] = useState<ChallengeData[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const loadBundle = useCallback(async (lat?: number, lng?: number) => {
    setLoadErr(null);
    try {
      const r = await api.getDiscoverNearby(
        lat != null && lng != null ? { lat, lng, radius: 25 } : undefined,
      );
      setUsers(r.users);
      setChallenges(r.challenges);
      if (r.reason === "anonymous") {
        setBanner("Browsing the plaza — sign in to accept a challenge.");
      } else if (r.reason === "no_coordinates") {
        setBanner("No GPS fix — showing latest open challenges everywhere.");
      } else if (r.mode === "nearby_challenges") {
        setBanner("Nearby creators first, then global open challenges.");
      } else if (r.users.length === 0) {
        setBanner(null);
      } else {
        setBanner(null);
      }
    } catch {
      setLoadErr("Could not load nearby / plaza.");
    }
  }, []);

  useEffect(() => {
    void loadBundle();
  }, [loadBundle]);

  useEffect(() => {
    if (status !== "authenticated") return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void loadBundle(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        void loadBundle();
      },
      { enableHighAccuracy: false, timeout: 12_000 },
    );
  }, [status, loadBundle]);

  const goVersus = async (challengeId: string) => {
    if (!uid) {
      onRequireAuth?.();
      return;
    }
    setAcceptingId(challengeId);
    try {
      await api.acceptChallenge(challengeId);
      router.push(`/challenge/${challengeId}/versus`);
    } catch (e) {
      setBanner(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setAcceptingId(null);
    }
  };

  if (loadErr) return <p className="text-sm text-text-muted">{loadErr}</p>;

  return (
    <LayoutGroup>
      <div className="space-y-4">
        {banner && <p className="text-[11px] text-text-muted leading-relaxed">{banner}</p>}

        <div>
          <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Open challenges</p>
          {challenges.length === 0 ? (
            <p className="text-sm text-text-muted">No waiting challenges yet — be the first to publish one from chat.</p>
          ) : (
            challenges.map((c) => (
              <LiveChallengeCard
                key={c.id}
                apiChallenge={c}
                currentUserId={uid}
                accepting={acceptingId === c.id}
                onAcceptVersus={goVersus}
              />
            ))
          )}
        </div>

        {status === "authenticated" && (
          <div>
            <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">People near you</p>
            {users.length === 0 ? (
              <p className="text-sm text-text-muted">No one with a saved location in range yet.</p>
            ) : (
              <div className="space-y-1">
                {users.map((u, i) => {
                  const onlineColor = STATUS_COLOR[u.isOnline ? "online" : "offline"];
                  return (
                    <motion.div
                      key={u.id}
                      className="group flex items-center gap-3 px-3 py-3 rounded-xl"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      whileHover={{ background: "rgba(255,255,255,0.04)" }}
                    >
                      <div className="relative flex-shrink-0">
                        {/* Glow ring for online users */}
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white overflow-hidden"
                          style={{
                            background: "linear-gradient(135deg, rgba(124,92,252,0.3), rgba(0,212,200,0.2))",
                            boxShadow: u.isOnline ? `0 0 12px ${onlineColor}40, 0 0 4px ${onlineColor}30` : "none",
                            border: u.isOnline ? `1.5px solid ${onlineColor}50` : "1.5px solid transparent",
                            transition: "box-shadow 0.3s, border 0.3s",
                          }}
                        >
                          {u.image ? <img src={u.image} alt="" className="w-full h-full object-cover" /> : u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <motion.div
                          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                          style={{ background: onlineColor, borderColor: "rgba(8,8,20,0.97)" }}
                          animate={u.isOnline ? {
                            boxShadow: [
                              `0 0 3px ${onlineColor}80`,
                              `0 0 8px ${onlineColor}cc`,
                              `0 0 3px ${onlineColor}80`,
                            ],
                          } : {}}
                          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-text-primary">{u.username}</p>
                        <p className="text-[11px] text-text-muted">{u.distance} mi · {u.challengeCount} challenges</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}

/* ── Discover open challenges ── */
function DiscoverContent({
  onRequireAuth,
  onOpenChallenge: _onOpenChallenge,
  onCloseDrawer,
}: {
  onRequireAuth: () => void;
  /** Parent may sync home state; join flow uses router to /challenge/[id]/versus */
  onOpenChallenge: (challengeId: string) => void;
  onCloseDrawer?: () => void;
}) {
  const router = useRouter();
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
      onCloseDrawer?.();
      router.push(`/challenge/${c.id}/versus`);
      return;
    }
    try {
      await api.acceptChallenge(c.id);
      onCloseDrawer?.();
      router.push(`/challenge/${c.id}/versus`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not join");
    }
  };

  if (loading) return <p className="text-sm text-text-muted">Loading open challenges…</p>;
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        {/* Empty state icon */}
        <motion.div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{
            background: "rgba(124,92,252,0.08)",
            border: "1px solid rgba(124,92,252,0.15)",
          }}
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c5cfc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </motion.div>
        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-text-secondary">No open slots right now</p>
          <p className="text-xs text-text-muted max-w-[220px]">Ask a friend to publish a public challenge, or create one from the chat.</p>
        </div>
        <motion.button
          type="button"
          onClick={load}
          className="shimmer-btn px-4 py-2 rounded-xl text-xs font-bold text-accent border border-accent/20"
          style={{ background: "rgba(124,92,252,0.08)" }}
          whileHover={{ scale: 1.02 }}
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
            className="shine-card rounded-xl px-3 py-3 space-y-2"
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
        {/* Animated gradient flow overlay */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)",
            backgroundSize: "200% 100%",
          }}
          animate={{
            backgroundPosition: ["200% 0", "-200% 0"],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
        <div className="relative z-10">
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
            className="flex items-center justify-between px-3 py-2.5 rounded-xl hover-lift"
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
  { key: "wallet", icon: "◈", label: "Wallet", badge: null as string | null, dotColor: "#f5a623" },
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
            {/* Gradient border glow wrapper */}
            <motion.div
              className="rounded-2xl p-[1px] relative"
              style={{
                background: "linear-gradient(135deg, rgba(124,92,252,0.5), rgba(0,212,200,0.3), rgba(124,92,252,0.5))",
              }}
              animate={{
                boxShadow: [
                  "0 0 20px rgba(124,92,252,0.15), 0 0 40px rgba(0,212,200,0.08)",
                  "0 0 28px rgba(124,92,252,0.25), 0 0 50px rgba(0,212,200,0.15)",
                  "0 0 20px rgba(124,92,252,0.15), 0 0 40px rgba(0,212,200,0.08)",
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Plasma line on top */}
              <div className="plasma-line absolute top-0 left-0 right-0 z-10 rounded-t-2xl overflow-hidden" />

              <div
                className="glass-panel flex items-center gap-1 px-2 py-2 rounded-2xl relative"
                style={{
                  background: "rgba(10,10,24,0.92)",
                  backdropFilter: "blur(24px)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 32px rgba(0,0,0,0.6)",
                }}
              >
                {ACTIONS.map(a => {
                  const isActive = active === a.key;
                  return (
                    <motion.button
                      key={a.key}
                      onClick={() => setActive(a.key)}
                      className="relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl text-sm font-bold text-text-secondary transition-colors"
                      whileHover={{
                        background: `${a.dotColor}18`,
                        color: "#e0e0e0",
                      }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {/* Colored dot indicator */}
                      <motion.div
                        className="absolute -top-0.5 left-1/2 w-1.5 h-1.5 rounded-full"
                        style={{
                          translateX: "-50%",
                          background: a.dotColor ?? "#7c5cfc",
                        }}
                        animate={isActive ? {
                          boxShadow: [
                            `0 0 4px ${a.dotColor}90`,
                            `0 0 10px ${a.dotColor}ff`,
                            `0 0 4px ${a.dotColor}90`,
                          ],
                          scale: [1, 1.3, 1],
                        } : {
                          opacity: [0.4, 0.8, 0.4],
                        }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      />

                      <div className="flex items-center gap-2">
                        <span className="text-base">{a.icon}</span>
                        <span>{a.label}</span>
                      </div>

                      {/* Active glowing underline */}
                      {isActive && (
                        <motion.div
                          className="absolute -bottom-0.5 left-2 right-2 h-[2px] rounded-full"
                          style={{
                            background: a.dotColor ?? "#7c5cfc",
                            boxShadow: `0 0 8px ${a.dotColor}aa, 0 2px 12px ${a.dotColor}60`,
                          }}
                          layoutId="fab-underline"
                          transition={{ type: "spring", damping: 25, stiffness: 300 }}
                        />
                      )}

                      {a.badge ? (
                        <span
                          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black text-white flex items-center justify-center"
                          style={{ background: a.dotColor ?? "#7c5cfc" }}
                        >
                          {a.badge}
                        </span>
                      ) : null}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
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
          onCloseDrawer={() => setActive(null)}
        />
      </Drawer>
      <Drawer open={active === "live"} onClose={() => setActive(null)} title="Live Activity">
        <LiveContent />
      </Drawer>
      <Drawer open={active === "nearby"} onClose={() => setActive(null)} title="Nearby & plaza">
        <NearbyContent onRequireAuth={() => onRequireAuth?.()} />
      </Drawer>
      <Drawer open={active === "wallet"} onClose={() => setActive(null)} title="Wallet & Escrow">
        <WalletContent />
      </Drawer>
    </>
  );
}

export default FloatingActionBar;
