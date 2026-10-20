"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import SceneShell from "@/components/scene/SceneShell";
import { listChallenges, type ChallengeData } from "@/lib/api-client";
import { matchesQuestView, questNextStep, questView } from "./quest-list-model";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-800";

export default function QuestList() {
  const { data: session, status } = useSession();
  const view = questView(useSearchParams().get("view"));
  const activePath = view === "all" ? "/quests" : `/quests?view=${view}`;
  const userId = session?.user?.id;
  const [quests, setQuests] = useState<ChallengeData[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (offset = 0) => {
    if (!userId || inFlight.current) return;
    const requestGeneration = generation.current;
    inFlight.current = true;
    setBusy(true); setError("");
    try {
      const response = await listChallenges({ mine: true, limit: 50, offset });
      if (requestGeneration !== generation.current) return;
      setQuests(current => offset === 0 ? response.challenges : [...new Map([...current, ...response.challenges].map(quest => [quest.id, quest])).values()]);
      setTotal(response.total); setLoaded(true);
    } catch (failure) {
      if (requestGeneration === generation.current) setError(failure instanceof Error ? failure.message : "Could not load your quests.");
    } finally {
      if (requestGeneration === generation.current) { inFlight.current = false; setBusy(false); }
    }
  }, [userId]);

  useEffect(() => {
    const currentGeneration = generation.current + 1;
    generation.current = currentGeneration;
    inFlight.current = false;
    setQuests([]); setTotal(0); setLoaded(false); setError(""); setBusy(false);
    if (status === "authenticated") void load();
    return () => { generation.current = currentGeneration + 1; };
  }, [status, load]);

  const visible = quests.filter(quest => matchesQuestView(quest, view));
  const title = view === "proof" ? "Proof to review" : view === "results" ? "Your results" : "Your quests";
  const description = view === "proof" ? "Live quests and Familiar reviews. Open a quest to submit proof or check the next step."
    : view === "results" ? "Completed quests and results awaiting agreement, settlement or review."
      : "Your created quests and invitations, with their current status.";

  return <SceneShell activePath={activePath} particleCount={12} tone="contract">
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-black text-slate-800">{title}</h1><p className="mt-2 max-w-xl text-sm text-slate-600">{description}</p></div>
        <Link className={actionClass} href="/summons">New quest</Link>
      </header>
      <nav aria-label="Filter your quests" className="flex flex-wrap gap-2">
        {[["/quests", "All"], ["/quests?view=proof", "Proof"], ["/quests?view=results", "Results"]].map(([href, label]) =>
          <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined} className={actionClass} style={activePath === href ? { background: "#FED7AA" } : undefined}>{label}</Link>)}
      </nav>
      {status === "loading" && <p role="status">Checking your session…</p>}
      {status === "unauthenticated" && <section className="rounded-3xl border border-white bg-white/90 p-6">
        <h2 className="text-lg font-bold">Sign in to see your quests</h2>
        <p className="my-3 text-sm text-slate-600">Your invitations, proof and results belong to your Summoner account.</p>
        <button className={actionClass} onClick={() => setAuthOpen(true)}>Sign in</button>
      </section>}
      {status === "authenticated" && <>
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <p>{loaded ? `${quests.length} of ${total} quests loaded · ${visible.length} in this view` : "Loading your quests…"}</p>
          <button className={actionClass} disabled={busy} onClick={() => void load()}>Refresh</button>
        </div>
        {error && <div role="alert" className="rounded-2xl border border-red-200 bg-white p-4"><p>{error}</p><button className={`${actionClass} mt-3`} disabled={busy} onClick={() => void load()}>Try again</button></div>}
        {busy && <p role="status">Loading quests…</p>}
        {!busy && !error && loaded && visible.length === 0 && <section className="rounded-3xl border border-white bg-white/90 p-6">
          <h2 className="text-lg font-bold">{view === "all" ? "No quests yet" : `No ${view === "proof" ? "proof quests" : "results"} in the loaded quests`}</h2>
          <p className="my-3 text-sm text-slate-600">{quests.length < total ? "Load more quests to check older activity." : "Summon a new quest or open an invitation shared by a friend."}</p>
          <Link className={actionClass} href="/summons">Summon a quest</Link>
        </section>}
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map(quest => {
            const players = (quest.participants ?? []).filter(player => ["creator", "opponent"].includes(player.role));
            const canReadProof = quest.creatorId === userId || players.some(player => player.user.id === userId && player.status === "accepted");
            const date = quest.deadline ? new Date(quest.deadline) : null;
            return <article key={quest.id} data-testid={`quest-card-${quest.id}`} className="rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 break-words text-lg font-extrabold text-slate-800">{quest.title}</h2><span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-bold">{quest.status.replaceAll("_", " ")}</span></div>
              <p className="my-3 text-sm text-slate-600">{questNextStep(quest)}</p>
              <dl className="space-y-2 text-sm text-slate-600">
                <div><dt className="inline font-bold">Players: </dt><dd className="inline">{players.map(player => `${player.user.username} (${player.status})`).join(" · ") || quest.creator?.username || "Pending"}</dd></div>
                <div><dt className="inline font-bold">Entry: </dt><dd className="inline">{quest.stake ?? 0} credits</dd></div>
                <div><dt className="inline font-bold">Proof: </dt><dd className="inline">{canReadProof && typeof quest._count?.evidence === "number" ? `${quest._count.evidence} submitted` : "Open quest for access details"}</dd></div>
                <div><dt className="inline font-bold">Deadline: </dt><dd className="inline">{date && Number.isFinite(date.getTime()) ? <time dateTime={date.toISOString()}>{date.toLocaleString()}</time> : "Not specified"}</dd></div>
              </dl>
              <Link className={`${actionClass} mt-4 w-full`} href={`/challenge/${encodeURIComponent(quest.id)}`}>Open quest</Link>
            </article>;
          })}
        </div>
        {quests.length < total && <button className={actionClass} disabled={busy} onClick={() => void load(quests.length)}>Load more quests</button>}
      </>}
    </div>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
  </SceneShell>;
}
