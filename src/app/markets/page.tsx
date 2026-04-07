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

export default function MarketsPage() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string } | undefined;
  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.listChallenges({ mine: true, limit: 50 })
      .then(res => { setMarkets(res.challenges); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0A0A0B" }}>
        <p className="text-sm font-mono" style={{ color: "#8b8b83" }}>Sign in to see your markets.</p>
        <Link href="/" className="text-xs font-mono underline" style={{ color: "#D4AF37" }}>Go home</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0B" }}>
      <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
        <Link href="/" className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>Lex Divina</Link>
        <Link href="/" className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>+ New Market</Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <h1 className="text-xl font-serif font-bold mb-6" style={{ color: "#E5E0D8" }}>My Markets</h1>

        {loading ? (
          <div className="text-center py-12">
            <motion.div className="w-6 h-6 mx-auto rounded-full border border-t-transparent"
              style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : markets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-xs font-mono mb-4" style={{ color: "#8b8b83" }}>No markets yet.</p>
            <Link href="/"
              className="inline-block px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider"
              style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "2px" }}>
              Create your first market
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {markets.map((m, i) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}>
                <Link href={`/market/${m.id}`}
                  className="block p-4 transition-colors"
                  style={{ background: "rgba(212,175,55,0.02)", border: "1px solid rgba(212,175,55,0.08)", borderRadius: "2px" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-serif font-bold truncate" style={{ color: "#E5E0D8" }}>{m.title}</h3>
                      <p className="text-[10px] font-mono mt-1" style={{ color: "#8b8b83" }}>
                        {m.type} · {m.stake > 0 ? `${m.stake} credits` : "Free"}
                      </p>
                    </div>
                    <span className="flex-shrink-0 px-2 py-0.5 text-[8px] font-mono font-bold uppercase tracking-[0.15em]"
                      style={{ color: STATUS_COLOR[m.status] || "#8b8b83", background: `${STATUS_COLOR[m.status] || "#8b8b83"}10`, borderRadius: "2px" }}>
                      {m.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-[9px] font-mono" style={{ color: "#8b8b83" }}>
                    <span>{m.participants?.length || 0} participant{(m.participants?.length || 0) !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>{new Date(m.createdAt).toLocaleDateString()}</span>
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
