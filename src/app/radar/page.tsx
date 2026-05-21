"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";

type RadarStatus = "idle" | "locating" | "ready" | "global" | "blocked" | "error";
type RadarChallenge = Awaited<ReturnType<typeof api.getMapChallenges>>["challenges"][number];
type PresenceUser = Awaited<ReturnType<typeof api.getMapPresence>>["users"][number];

function askLocation(): Promise<{ snapshot: api.LocationSnapshot | null; accuracy?: number; status: RadarStatus }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ snapshot: null, status: "error" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          snapshot: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          },
          accuracy: pos.coords.accuracy,
          status: "ready",
        });
      },
      (err) => {
        resolve({
          snapshot: null,
          status: err.code === err.PERMISSION_DENIED ? "blocked" : "error",
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

function distanceLabel(meters: number | null | undefined) {
  if (meters == null) return "global";
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)}km`;
}

function pointFor(challenge: RadarChallenge, index: number) {
  const meters = challenge.radar?.approximateDistanceMeters;
  const ringScale = meters == null ? 0.88 : Math.min(0.9, Math.max(0.22, meters / 5000));
  const angle = challenge.radar?.angle ?? (index * 1.84 + 0.45);
  const radius = 42 * ringScale;
  return {
    left: `${50 + Math.sin(angle) * radius}%`,
    top: `${50 - Math.cos(angle) * radius}%`,
  };
}

export default function RadarPage() {
  const { data: session } = useSession();
  const [status, setStatus] = useState<RadarStatus>("idle");
  const [message, setMessage] = useState("Location off. Showing public challenges.");
  const [snapshot, setSnapshot] = useState<api.LocationSnapshot | null>(null);
  const [challenges, setChallenges] = useState<RadarChallenge[]>([]);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRadar = useCallback(async (nextSnapshot: api.LocationSnapshot | null) => {
    setLoading(true);
    try {
      const [challengeResult, presenceResult] = await Promise.allSettled([
        api.getMapChallenges({ ...(nextSnapshot ?? {}), radiusMiles: 10, limit: 30 }),
        nextSnapshot ? api.getMapPresence({ ...nextSnapshot, radiusMiles: 5 }).catch(() => ({ users: [], privacy: "approximate" as const, radiusMiles: 5 })) : Promise.resolve({ users: [], privacy: "approximate" as const, radiusMiles: 5 }),
      ]);
      if (challengeResult.status !== "fulfilled") {
        console.warn("[radar] challenge load failed", challengeResult.reason);
        setChallenges([]);
        setPresence([]);
        setMessage("Challenge radar is temporarily unavailable. You can still create or manage challenges.");
        setStatus("error");
        return;
      }
      const challengeRes = challengeResult.value;
      const presenceRes = presenceResult.status === "fulfilled"
        ? presenceResult.value
        : { users: [], privacy: "approximate" as const, radiusMiles: 5 };
      setChallenges(challengeRes.challenges);
      setPresence(presenceRes.users);
      setMessage(challengeRes.levelMessage);
      setStatus(nextSnapshot ? "ready" : "global");
    } catch (err) {
      console.warn("[radar] load failed", err);
      setMessage("Challenge radar is temporarily unavailable. You can still create or manage challenges.");
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRadar(null);
  }, [loadRadar]);

  const enableLocation = async () => {
    setStatus("locating");
    setMessage("Locating...");
    const result = await askLocation();
    if (!result.snapshot) {
      setStatus(result.status);
      setMessage(result.status === "blocked" ? "Location blocked. Browser settings can re-enable it." : "Location unavailable.");
      await loadRadar(null);
      return;
    }
    setSnapshot(result.snapshot);
    if (session?.user) {
      await api.pingMapLocation({
        ...result.snapshot,
        accuracy: result.accuracy,
        mode: "browsing",
      }).catch(() => null);
    }
    await loadRadar(result.snapshot);
  };

  const nearest = useMemo(() => challenges.slice(0, 5), [challenges]);

  return (
    <main className="min-h-screen bg-[#F8FAFC] text-[#172033]">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#047857]">GambleAI</p>
            <h1 className="text-2xl font-black md:text-3xl">Challenge Radar</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { void loadRadar(snapshot); }}
              disabled={loading}
              className="rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              Refresh
            </button>
            <Link className="rounded-full border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-bold" href="/markets">My challenges</Link>
            <Link className="rounded-full bg-[#111827] px-4 py-2 text-sm font-bold text-white" href="/">Create</Link>
          </div>
        </header>

        <section className="grid flex-1 gap-5 py-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
          <div className="relative min-h-[560px] overflow-hidden rounded-[8px] border border-[#D1FAE5] bg-[#ECFDF5]">
            <div className="absolute inset-6 rounded-full border border-[#A7F3D0]" />
            <div className="absolute inset-20 rounded-full border border-[#6EE7B7]" />
            <div className="absolute inset-36 rounded-full border border-[#34D399]" />
            <div className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#047857] shadow-[0_0_0_10px_rgba(16,185,129,0.16)]" />
            <div className="absolute left-1/2 top-1/2 h-px w-[92%] -translate-x-1/2 bg-[#A7F3D0]" />
            <div className="absolute left-1/2 top-1/2 h-[92%] w-px -translate-y-1/2 bg-[#A7F3D0]" />

            {loading ? (
              <div className="absolute inset-0 grid place-items-center text-sm font-bold text-[#047857]">Loading radar...</div>
            ) : challenges.length === 0 ? (
              <div className="absolute inset-0 grid place-items-center text-center text-sm font-bold text-[#047857]">
                No open challenges nearby.
              </div>
            ) : (
              challenges.slice(0, 18).map((challenge, index) => {
                const point = pointFor(challenge, index);
                const ring = challenge.radar?.ring ?? "global";
                const size = ring === "walk" ? 76 : ring === "near" ? 64 : 54;
                return (
                  <Link
                    key={challenge.id}
                    href={`/join/${challenge.id}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-white p-2 text-center shadow-lg transition hover:scale-105"
                    style={{ ...point, width: size, minHeight: size }}
                    title={challenge.title}
                  >
                    <span className="block truncate text-[10px] font-black text-[#065F46]">{challenge.type}</span>
                    <span className="mt-1 block text-[10px] font-bold leading-tight text-[#172033]">{distanceLabel(challenge.radar?.approximateDistanceMeters)}</span>
                    <span className="mt-1 block truncate text-[9px] text-[#64748B]">{challenge.stake} cr</span>
                  </Link>
                );
              })
            )}
          </div>

          <aside className="flex min-h-[560px] flex-col gap-4">
            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[#64748B]">Status</p>
                  <p className="mt-1 text-sm font-bold text-[#172033]">{message}</p>
                </div>
                <button
                  type="button"
                  onClick={enableLocation}
                  disabled={status === "locating"}
                  className="rounded-full bg-[#10B981] px-4 py-2 text-sm font-black text-white disabled:opacity-60"
                >
                  {status === "locating" ? "..." : snapshot ? "Refresh" : "Enable"}
                </button>
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[#64748B]">Nearby Challenges</h2>
              <div className="mt-3 space-y-3">
                {nearest.length === 0 ? (
                  <p className="text-sm font-semibold text-[#64748B]">No joinable challenges.</p>
                ) : nearest.map((challenge) => (
                  <Link key={challenge.id} href={`/join/${challenge.id}`} className="block rounded-[8px] border border-[#E2E8F0] p-3 hover:border-[#10B981]">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-sm font-black text-[#172033]">{challenge.title}</p>
                      <span className="shrink-0 rounded-full bg-[#D1FAE5] px-2 py-1 text-[11px] font-black text-[#047857]">{distanceLabel(challenge.radar?.approximateDistanceMeters)}</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#64748B]">{challenge.participants.length}/{challenge.maxParticipants} joined - {challenge.evidenceType}</p>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-[#64748B]">Nearby Players</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {presence.length === 0 ? (
                  <p className="col-span-2 text-sm font-semibold text-[#64748B]">No active players nearby.</p>
                ) : presence.slice(0, 8).map((user) => (
                  <div key={user.id} className="rounded-[8px] border border-[#E2E8F0] p-3">
                    <p className="truncate text-sm font-black text-[#172033]">{user.username}</p>
                    <p className="text-xs font-semibold text-[#64748B]">{user.distanceLabel}</p>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
