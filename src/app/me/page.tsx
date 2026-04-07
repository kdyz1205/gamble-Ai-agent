"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

const STATUS_COLOR: Record<string, string> = {
  open: "#D4AF37", live: "#639A67", judging: "#005F6F",
  settled: "#639A67", cancelled: "#A31F34", disputed: "#A31F34", draft: "#8b8b83",
};

type Tab = "all" | "open" | "live" | "settled";

export default function MePage() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;

  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!user) return;
    api.listChallenges({ mine: true, limit: 50 })
      .then(res => { setMarkets(res.challenges); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0A0A0B" }}>
        <p className="text-sm font-mono" style={{ color: "#8b8b83" }}>Sign in to view your profile.</p>
        <Link href="/" className="text-xs font-mono underline" style={{ color: "#D4AF37" }}>Go home</Link>
      </div>
    );
  }

  const username = user.username || user.name || user.email?.split("@")[0] || "User";
  const credits = user.credits ?? 0;

  // Stats
  const openCount = markets.filter(m => m.status === "open" || m.status === "live").length;
  const settledCount = markets.filter(m => m.status === "settled").length;
  const totalStaked = markets.reduce((sum, m) => sum + (m.stake || 0), 0);

  // Filtered markets
  const filtered = tab === "all" ? markets
    : tab === "open" ? markets.filter(m => m.status === "open")
    : tab === "live" ? markets.filter(m => m.status === "live" || m.status === "judging")
    : markets.filter(m => m.status === "settled" || m.status === "cancelled");

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0B" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
        <Link href="/" className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>Lex Divina</Link>
        <Link href="/" className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>+ New Market</Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Profile card */}
        <div className="mb-8 p-5" style={{ background: "rgba(212,175,55,0.03)", border: "1px solid rgba(212,175,55,0.1)", borderRadius: "2px" }}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 flex items-center justify-center text-lg font-serif font-bold"
              style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "2px" }}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-lg font-serif font-bold" style={{ color: "#E5E0D8" }}>{username}</h1>
              <p className="text-[10px] font-mono" style={{ color: "#8b8b83" }}>{user.email || ""}</p>
            </div>
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between py-3 border-t border-b mb-4" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
            <span className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: "#8b8b83" }}>Balance</span>
            <span className="text-xl font-serif font-bold" style={{ color: "#D4AF37" }}>{credits}</span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Active" value={openCount} />
            <StatCard label="Settled" value={settledCount} />
            <StatCard label="Staked" value={totalStaked} suffix="cr" />
          </div>
        </div>

        {/* Markets section */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-serif font-bold" style={{ color: "#E5E0D8" }}>Markets</h2>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-5">
          {(["all", "open", "live", "settled"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-[0.15em] transition-colors"
              style={{
                color: tab === t ? "#D4AF37" : "#8b8b83",
                background: tab === t ? "rgba(212,175,55,0.08)" : "transparent",
                border: tab === t ? "1px solid rgba(212,175,55,0.15)" : "1px solid transparent",
                borderRadius: "2px",
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Market list */}
        {loading ? (
          <div className="text-center py-12">
            <motion.div className="w-6 h-6 mx-auto rounded-full border border-t-transparent"
              style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xs font-mono mb-4" style={{ color: "#8b8b83" }}>
              {tab === "all" ? "No markets yet." : `No ${tab} markets.`}
            </p>
            {tab === "all" && (
              <Link href="/" className="inline-block px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider"
                style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "2px" }}>
                Create your first market
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((m, i) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}>
                <Link href={`/market/${m.id}`} className="block p-3.5 transition-colors"
                  style={{ background: "rgba(212,175,55,0.02)", border: "1px solid rgba(212,175,55,0.06)", borderRadius: "2px" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-serif font-bold truncate" style={{ color: "#E5E0D8" }}>{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono" style={{ color: "#8b8b83" }}>
                        <span>{m.type}</span>
                        <span>·</span>
                        <span>{m.stake > 0 ? `${m.stake} cr` : "Free"}</span>
                        <span>·</span>
                        <span>{m.participants?.length || 0} joined</span>
                      </div>
                    </div>
                    <span className="flex-shrink-0 px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-[0.15em]"
                      style={{ color: STATUS_COLOR[m.status] || "#8b8b83", background: `${STATUS_COLOR[m.status] || "#8b8b83"}10`, borderRadius: "2px" }}>
                      {m.status}
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="text-center py-2 px-1" style={{ background: "rgba(212,175,55,0.02)", borderRadius: "2px" }}>
      <p className="text-lg font-serif font-bold" style={{ color: "#E5E0D8" }}>
        {value}{suffix && <span className="text-[9px] font-mono ml-0.5" style={{ color: "#8b8b83" }}>{suffix}</span>}
      </p>
      <p className="text-[8px] font-mono uppercase tracking-[0.15em]" style={{ color: "#8b8b83" }}>{label}</p>
    </div>
  );
}
