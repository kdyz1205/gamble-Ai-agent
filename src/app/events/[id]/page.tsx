import Link from "next/link";
import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { eventPublicInclude } from "@/lib/challenge-events";
import type { ProtocolSpecV2 } from "@/lib/protocol-spec-v2";
import EventJoinButton from "./EventJoinButton";
import EventScorePanel from "./EventScorePanel";

export const dynamic = "force-dynamic";

function parseProtocol(value: string): ProtocolSpecV2 | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as { version?: unknown }).version === "2.0") {
      return parsed as ProtocolSpecV2;
    }
  } catch {
    return null;
  }
  return null;
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.challengeEvent.findUnique({
    where: { id },
    include: eventPublicInclude,
  }).catch(() => null);
  if (!event) notFound();
  const leaderboard = await prisma.leaderboardEntry.findMany({
    where: { eventId: id },
    include: { user: { select: { id: true, username: true, image: true } } },
    orderBy: [
      { rank: "asc" },
      { score: "desc" },
      { createdAt: "asc" },
    ],
    take: 10,
  }).catch(() => []);

  const protocol = parseProtocol(event.protocolJson);
  const joinedCount = event._count.entries;
  const capacityPct = Math.min(100, Math.round((joinedCount / Math.max(1, event.maxParticipants)) * 100));
  const rules = [
    protocol?.settlementProtocol.winCondition,
    ...(protocol?.evidenceProtocol.requiredEvidence ?? []),
    ...(protocol?.settlementProtocol.manualReviewTriggers ?? []),
  ].filter(Boolean).slice(0, 5);

  return (
    <main className="min-h-screen px-5 py-8" style={{ background: "linear-gradient(135deg, #D7FFF2 0%, #EEF2FF 50%, #FFF1F2 100%)" }}>
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-base font-black tracking-tight" style={{ color: "#172033" }}>
            GambleAI
          </Link>
          <div className="flex flex-wrap gap-2">
            <Link href="/markets" className="inline-flex rounded-full bg-white/80 px-4 py-2 text-sm font-bold shadow-sm" style={{ color: "#172033" }}>
              My challenges
            </Link>
            <Link href="/radar" className="inline-flex rounded-full bg-white/80 px-4 py-2 text-sm font-bold shadow-sm" style={{ color: "#047857" }}>
              Radar
            </Link>
            <Link href="/" className="inline-flex rounded-full px-4 py-2 text-sm font-bold shadow-sm" style={{ background: "#FED7AA", color: "#7C2D12" }}>
              Create
            </Link>
          </div>
        </header>

        <section className="rounded-[28px] border bg-white/90 p-6 shadow-sm" style={{ borderColor: "#DDE7F0" }}>
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: "#DCFCE7", color: "#047857" }}>
                  {event.status}
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: "#E0E7FF", color: "#3730A3" }}>
                  {protocol?.participantMode ?? "event"}
                </span>
                <span className="rounded-full px-3 py-1 text-xs font-extrabold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                  {protocol?.settlementProtocol.mode ?? "leaderboard"}
                </span>
              </div>
              <h1 className="text-4xl font-black leading-tight" style={{ color: "#172033" }}>{event.title}</h1>
              <p className="max-w-2xl text-base font-semibold leading-7" style={{ color: "#526078" }}>
                {protocol?.userFacingSummary ?? "Mass challenge event"}
              </p>
            </div>
            <div className="w-full shrink-0 md:w-64">
              <EventJoinButton eventId={event.id} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
            <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#64748B" }}>Participants</p>
            <p className="mt-2 text-3xl font-black" style={{ color: "#172033" }}>{joinedCount}/{event.maxParticipants}</p>
            <div className="mt-4 h-2 overflow-hidden rounded-full" style={{ background: "#E2E8F0" }}>
              <div className="h-full rounded-full" style={{ width: `${capacityPct}%`, background: "#10B981" }} />
            </div>
          </div>
          <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
            <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#64748B" }}>Outcome</p>
            <p className="mt-2 text-lg font-black" style={{ color: "#172033" }}>{protocol?.outcomeType ?? "ranking"}</p>
          </div>
          <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
            <p className="text-xs font-extrabold uppercase tracking-wide" style={{ color: "#64748B" }}>Evidence</p>
            <p className="mt-2 text-lg font-black" style={{ color: "#172033" }}>{protocol?.evidenceProtocol.mode ?? "manual_review"}</p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
            <h2 className="text-lg font-black" style={{ color: "#172033" }}>Protocol</h2>
            <div className="mt-4 space-y-3">
              {rules.length > 0 ? rules.map((rule, index) => (
                <p key={`${index}-${rule}`} className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "#F8FAFC", color: "#334155" }}>
                  {rule}
                </p>
              )) : (
                <p className="text-sm font-semibold" style={{ color: "#64748B" }}>No protocol rules available.</p>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <EventScorePanel eventId={event.id} disabled={!["open", "submissions_open"].includes(event.status)} />
            <div className="rounded-2xl border bg-white/85 p-5" style={{ borderColor: "#DDE7F0" }}>
              <h2 className="text-lg font-black" style={{ color: "#172033" }}>Leaderboard</h2>
              <div className="mt-4 space-y-3">
                {leaderboard.length > 0 ? leaderboard.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "#F8FAFC" }}>
                    <span className="truncate text-sm font-bold" style={{ color: "#172033" }}>
                      #{entry.rank ?? "-"} {entry.user.username}
                    </span>
                    <span className="text-xs font-extrabold" style={{ color: "#047857" }}>{entry.score ?? "-"}</span>
                  </div>
                )) : (
                  <p className="text-sm font-semibold" style={{ color: "#64748B" }}>No scores yet.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
