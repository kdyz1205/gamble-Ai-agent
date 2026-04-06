"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";


interface DiscoverChallenge {
  id: string;
  title: string;
  type: string;
  stake: number;
  deadline: string | null;
  rules: string | null;
  creator: { id: string; username: string; image: string | null };
}

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse"
         style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex justify-between mb-3">
        <div className="h-4 w-32 rounded bg-white/5" />
        <div className="h-6 w-16 rounded bg-white/5" />
      </div>
      <div className="h-3 w-full rounded bg-white/5 mb-2" />
      <div className="h-3 w-2/3 rounded bg-white/5" />
    </div>
  );
}

interface Props {
  onAccept: (challengeId: string) => void;
  onRequireAuth: () => void;
}

export default function PlazaSection({ onAccept }: Props) {
  const [challenges, setChallenges] = useState<DiscoverChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelMessage, setLevelMessage] = useState("");
  const [discoveryLevel, setDiscoveryLevel] = useState<string>("global");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let lat: number | undefined;
        let lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* no geo — waterfall handles it */ }

        const params = new URLSearchParams();
        if (lat !== undefined) params.set("lat", String(lat));
        if (lng !== undefined) params.set("lng", String(lng));
        params.set("limit", "20");

        const res = await fetch(`/api/challenges/discover?${params}`);
        const data = await res.json();
        if (!cancelled) {
          setChallenges(data.challenges ?? []);
          setDiscoveryLevel(data.discoveryLevel ?? "global");
          setLevelMessage(data.levelMessage ?? "");
        }
      } catch {
        if (!cancelled) setChallenges([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {!loading && discoveryLevel !== "precise" && levelMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: "rgba(212,175,55,0.08)",
              border: "1px solid rgba(212,175,55,0.15)",
              color: "#D4AF37",
            }}
          >
            {levelMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          No open challenges right now. Be the first to create one!
        </div>
      ) : (
        <div className="space-y-2">
          {challenges.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
              onClick={() => onAccept(c.id)}
              className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              whileHover={{ borderColor: "rgba(212,175,55,0.3)" }}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-sm font-bold text-text-primary">{c.title}</span>
                <motion.span
                  className="text-lg font-black flex-shrink-0 ml-3"
                  style={{ color: c.stake > 0 ? "#D4AF37" : "#005F6F" }}
                  animate={c.stake > 0 ? {
                    textShadow: ["0 0 8px rgba(212,175,55,0.3)", "0 0 16px rgba(212,175,55,0.6)", "0 0 8px rgba(212,175,55,0.3)"],
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {c.stake > 0 ? `${c.stake}` : "Free"}
                </motion.span>
              </div>
              {c.rules && (
                <p className="text-xs text-text-muted line-clamp-2 mb-2">{c.rules}</p>
              )}
              <div className="flex items-center gap-2 text-[10px] text-text-muted">
                <span className="px-1.5 py-0.5 rounded bg-white/5">{c.type}</span>
                <span>by {c.creator?.username || "Anonymous Gambler"}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
