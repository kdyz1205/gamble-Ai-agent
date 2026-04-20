"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

// LuckyPlay status palette — friendly, never alarming
const STATUS_COLOR: Record<string, string> = {
  open:      "#FF9966", // peach — accepting joiners
  live:      "#5FC9B4", // mint — in progress
  judging:   "#B8A6E0", // lavender — AI thinking
  settled:   "#6BCF8E", // soft green — done
  cancelled: "#FF6B82", // rosy red — voided
  disputed:  "#FF6B82",
  draft:     "#1F3A5F66",
};

const NAVY = "#1F3A5F";
const NAVY_DIM = "rgba(31,58,95,0.55)";
const NAVY_FAINT = "rgba(31,58,95,0.10)";
const PEACH = "#FF9966";
const PEACH_DARK = "#F07A4F";
const CREAM = "#FFF8E7";

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm" style={{ color: NAVY_DIM }}>Sign in to view your profile.</p>
        <Link href="/" className="text-xs font-semibold underline" style={{ color: PEACH_DARK }}>Go home</Link>
      </div>
    );
  }

  const username = user.username || user.name || user.email?.split("@")[0] || "User";
  const credits = user.credits ?? 0;

  const openCount = markets.filter(m => m.status === "open" || m.status === "live").length;
  const settledCount = markets.filter(m => m.status === "settled").length;
  const totalStaked = markets.reduce((sum, m) => sum + (m.stake || 0), 0);

  const filtered = tab === "all" ? markets
    : tab === "open" ? markets.filter(m => m.status === "open")
    : tab === "live" ? markets.filter(m => m.status === "live" || m.status === "judging")
    : markets.filter(m => m.status === "settled" || m.status === "cancelled");

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>LuckyPlay</Link>
        <Link href="/" className="text-xs font-semibold px-3 py-1.5 shadow-sm"
          style={{ background: PEACH, color: "#FFFFFF", borderRadius: "999px" }}>
          + New Market
        </Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Profile card */}
        <div className="mb-6 p-5 shadow-sm"
          style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "20px" }}>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 flex items-center justify-center text-xl font-bold shadow-sm"
              style={{ background: PEACH, color: "#FFFFFF", borderRadius: "999px" }}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ color: NAVY }}>{username}</h1>
              <p className="text-xs truncate" style={{ color: NAVY_DIM }}>{user.email || ""}</p>
            </div>
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between py-3 px-4 mb-4"
            style={{ background: CREAM, borderRadius: "14px" }}>
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: NAVY_DIM }}>Balance</span>
            <span className="text-2xl font-bold" style={{ color: PEACH_DARK }}>
              {credits}
              <span className="text-xs font-semibold ml-1" style={{ color: NAVY_DIM }}>cr</span>
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Active" value={openCount} tint="#5FC9B4" />
            <StatCard label="Settled" value={settledCount} tint="#6BCF8E" />
            <StatCard label="Staked" value={totalStaked} suffix="cr" tint="#B8A6E0" />
          </div>
        </div>

        {/* Markets section */}
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-bold" style={{ color: NAVY }}>Your Markets</h2>
          <span className="text-xs font-semibold" style={{ color: NAVY_DIM }}>{markets.length} total</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {(["all", "open", "live", "settled"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all flex-shrink-0"
              style={{
                color: tab === t ? "#FFFFFF" : NAVY_DIM,
                background: tab === t ? PEACH : "#FFFFFF",
                border: `1px solid ${tab === t ? PEACH : NAVY_FAINT}`,
                borderRadius: "999px",
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Market list */}
        {loading ? (
          <div className="text-center py-12">
            <motion.div className="w-7 h-7 mx-auto rounded-full border-[3px] border-t-transparent"
              style={{ borderColor: PEACH, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-6 shadow-sm"
            style={{ background: "#FFFFFF", border: `1px dashed ${NAVY_FAINT}`, borderRadius: "20px" }}>
            <p className="text-sm mb-4" style={{ color: NAVY_DIM }}>
              {tab === "all" ? "No markets yet — make a friendly call!" : `No ${tab} markets right now.`}
            </p>
            {tab === "all" && (
              <Link href="/" className="inline-block px-5 py-2.5 text-sm font-bold shadow-sm"
                style={{ background: PEACH, color: "#FFFFFF", borderRadius: "999px" }}>
                Create your first market
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((m, i) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}>
                <Link href={`/market/${m.id}`} className="block p-4 shadow-sm transition-all hover:shadow-md"
                  style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "16px" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold truncate" style={{ color: NAVY }}>{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5 text-xs font-medium" style={{ color: NAVY_DIM }}>
                        <span>{m.type}</span>
                        <span>·</span>
                        <span>{m.stake > 0 ? `${m.stake} cr` : "Free"}</span>
                        <span>·</span>
                        <span>{m.participants?.length || 0} joined</span>
                      </div>
                    </div>
                    <span className="flex-shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: "#FFFFFF",
                        background: STATUS_COLOR[m.status] || NAVY_DIM,
                        borderRadius: "999px",
                      }}>
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

function StatCard({ label, value, suffix, tint }: { label: string; value: number; suffix?: string; tint: string }) {
  return (
    <div className="text-center py-3 px-2" style={{ background: `${tint}1A`, borderRadius: "14px" }}>
      <p className="text-xl font-bold" style={{ color: NAVY }}>
        {value}{suffix && <span className="text-xs font-semibold ml-0.5" style={{ color: NAVY_DIM }}>{suffix}</span>}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: NAVY_DIM }}>{label}</p>
    </div>
  );
}
