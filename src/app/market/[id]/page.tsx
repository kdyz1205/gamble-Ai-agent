"use client";

import { useState, useEffect, use, useCallback } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:   { label: "Draft",   color: "#8b8b83" },
  open:    { label: "Open",    color: "#D4AF37" },
  live:    { label: "Live",    color: "#639A67" },
  judging: { label: "Judging", color: "#005F6F" },
  settled: { label: "Settled", color: "#639A67" },
  cancelled: { label: "Cancelled", color: "#A31F34" },
  disputed: { label: "Disputed", color: "#A31F34" },
};

export default function MarketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string } | undefined;

  const [market, setMarket] = useState<ChallengeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getChallenge(id)
      .then(res => { setMarket(res.challenge); setLoading(false); })
      .catch(() => { setError("Market not found"); setLoading(false); });
  }, [id]);

  const copyLink = useCallback(() => {
    const link = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0A0A0B" }}>
        <motion.div className="w-6 h-6 rounded-full border border-t-transparent"
          style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0A0A0B" }}>
        <p className="text-sm font-mono" style={{ color: "#A31F34" }}>{error || "Market not found"}</p>
        <Link href="/" className="text-xs font-mono underline" style={{ color: "#D4AF37" }}>Create a new market</Link>
      </div>
    );
  }

  const isCreator = user?.id === market.creator?.id;
  const status = STATUS_LABELS[market.status] || STATUS_LABELS.draft;
  const stakeLabel = market.stake > 0 ? `${market.stake} credits` : "Free";
  const joinLink = `${typeof window !== "undefined" ? window.location.origin : ""}/join/${id}`;
  const participantCount = market.participants?.length || 0;

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0B" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
        <Link href="/" className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>Lex Divina</Link>
        <Link href="/markets" className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>My Markets</Link>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        {/* Status badge */}
        <div className="flex items-center gap-3 mb-6">
          <span className="px-2.5 py-1 text-[9px] font-mono font-bold uppercase tracking-[0.2em]"
            style={{ background: `${status.color}15`, color: status.color, border: `1px solid ${status.color}30`, borderRadius: "2px" }}>
            {status.label}
          </span>
          {isCreator && (
            <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>Your market</span>
          )}
          <span className="ml-auto text-[9px] font-mono" style={{ color: "#8b8b83" }}>
            {new Date(market.createdAt).toLocaleDateString()}
          </span>
        </div>

        {/* Title / Proposition */}
        <h1 className="text-2xl font-serif font-bold mb-2" style={{ color: "#E5E0D8" }}>{market.title}</h1>

        {/* Type */}
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] mb-6" style={{ color: "#8b8b83" }}>{market.type}</p>

        {/* Key metrics */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <MetricCard label="Stake" value={stakeLabel} color={market.stake > 0 ? "#D4AF37" : "#8b8b83"} />
          <MetricCard label="Evidence" value={market.evidenceType?.replace(/_/g, " ") || "Self report"} />
          <MetricCard label="Participants" value={`${participantCount} / ${market.maxParticipants}`} />
        </div>

        {/* Deadline */}
        {market.deadline && (
          <div className="mb-6 px-3 py-2.5" style={{ background: "rgba(212,175,55,0.03)", border: "1px solid rgba(212,175,55,0.08)", borderRadius: "2px" }}>
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>Deadline</p>
            <p className="text-xs font-mono" style={{ color: "#E5E0D8" }}>{new Date(market.deadline).toLocaleString()}</p>
          </div>
        )}

        {/* Rules */}
        {market.rules && (
          <div className="mb-6 px-3 py-2.5" style={{ borderLeft: "2px solid rgba(212,175,55,0.15)", background: "rgba(212,175,55,0.02)" }}>
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>Rules</p>
            <p className="text-xs font-mono" style={{ color: "#E5E0D8" }}>{market.rules}</p>
          </div>
        )}

        {/* Participants */}
        <div className="mb-6">
          <p className="text-[8px] font-mono uppercase tracking-[0.2em] mb-2" style={{ color: "#8b8b83" }}>Participants</p>
          {market.participants?.map(p => (
            <div key={p.id} className="flex items-center gap-2 py-2 border-b" style={{ borderColor: "rgba(212,175,55,0.06)" }}>
              <span className="w-6 h-6 flex items-center justify-center text-[9px] font-serif font-bold"
                style={{ background: "rgba(212,175,55,0.1)", color: "#D4AF37", borderRadius: "2px" }}>
                {p.user?.username?.charAt(0)?.toUpperCase() || "?"}
              </span>
              <span className="text-xs font-mono" style={{ color: "#E5E0D8" }}>{p.user?.username || "Unknown"}</span>
              <span className="ml-auto text-[9px] font-mono uppercase" style={{ color: "#8b8b83" }}>{p.role}</span>
            </div>
          ))}
          {participantCount === 0 && (
            <p className="text-xs font-mono py-2" style={{ color: "#8b8b83" }}>No participants yet</p>
          )}
        </div>

        {/* Invite link */}
        <div className="mb-6">
          <p className="text-[8px] font-mono uppercase tracking-[0.2em] mb-2" style={{ color: "#8b8b83" }}>Invite Link</p>
          <div className="flex items-center" style={{ border: "1px solid rgba(212,175,55,0.12)", borderRadius: "2px" }}>
            <input type="text" readOnly value={joinLink}
              className="flex-1 bg-transparent px-3 py-2.5 text-xs font-mono focus:outline-none truncate"
              style={{ color: "#E5E0D8" }} />
            <button onClick={copyLink}
              className="flex-shrink-0 px-3 py-2.5 text-[10px] font-mono font-bold uppercase tracking-wider"
              style={{ color: copied ? "#639A67" : "#D4AF37", borderLeft: "1px solid rgba(212,175,55,0.12)" }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {/* Actions based on status */}
        {market.status === "open" && !isCreator && (
          <Link href={`/join/${id}`}
            className="block w-full py-3 text-center text-sm font-mono font-bold uppercase tracking-[0.15em]"
            style={{ background: "linear-gradient(135deg, #D4AF37, #A38829)", color: "#0A0A0B", borderRadius: "2px" }}>
            Accept This Market
          </Link>
        )}

        {market.status === "open" && isCreator && (
          <p className="text-center text-xs font-mono py-3" style={{ color: "#8b8b83" }}>
            Waiting for opponent to join...
          </p>
        )}

        {/* Evidence count */}
        {market._count && market._count.evidence > 0 && (
          <div className="mt-6 px-3 py-2.5" style={{ background: "rgba(0,95,111,0.04)", border: "1px solid rgba(0,95,111,0.1)", borderRadius: "2px" }}>
            <p className="text-xs font-mono" style={{ color: "#005F6F" }}>
              {market._count.evidence} evidence submission{market._count.evidence > 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>
            &larr; Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="px-3 py-2.5" style={{ background: "rgba(212,175,55,0.03)", border: "1px solid rgba(212,175,55,0.06)", borderRadius: "2px" }}>
      <p className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] mb-1" style={{ color: "#8b8b83" }}>{label}</p>
      <p className="text-sm font-mono font-bold" style={{ color: color || "#E5E0D8" }}>{value}</p>
    </div>
  );
}
