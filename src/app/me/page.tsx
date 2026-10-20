"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import AuthModal from "@/components/AuthModal";
import SceneShell from "@/components/scene/SceneShell";
import { getTokenStatus, type TokenData } from "@/lib/api-client";

const actionClass = "inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-800 disabled:opacity-50";
const transactionLabels: Record<string, string> = {
  stake: "Quest entry held",
  ai_parse: "Quest drafting fee",
  ai_judge: "AI referee fee",
  win: "Quest settlement received",
  loss: "Quest settlement loss",
  refund: "Credits refunded",
  bonus: "Bonus credits",
  topup: "Credits added",
};
type AccountSnapshot = { userId: string; request: number; data?: TokenData; error?: string };

export default function MePage() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [authOpen, setAuthOpen] = useState(false);
  const [request, setRequest] = useState(0);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let active = true;
    void getTokenStatus().then(data => {
      if (active) setSnapshot({ userId, request, data });
    }).catch(() => {
      if (active) setSnapshot({ userId, request, error: "Your credits could not be loaded. Please try again." });
    });
    return () => { active = false; };
  }, [status, userId, request]);

  // Never show a previous account's balance while a different session loads.
  const current = snapshot && snapshot.userId === userId && snapshot.request === request ? snapshot : null;
  const account = current?.data;
  const busy = status === "authenticated" && !current;
  const username = session?.user?.username || session?.user?.name || "Summoner";
  const refresh = () => { setVisibleCount(10); setRequest(value => value + 1); };

  return <SceneShell activePath="/me" particleCount={12} tone="contract">
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-7 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="text-2xl font-black text-slate-800">Your profile</h1><p className="mt-2 text-sm text-slate-600">Your identity, internal credits and recent credit activity.</p></div>
        <Link className={actionClass} href="/quests">Your quests</Link>
      </header>
      {status === "loading" && <p role="status">Checking your session…</p>}
      {status === "unauthenticated" && <section className="rounded-3xl border border-white bg-white/95 p-6">
        <h2 className="text-lg font-bold">Keep your quest history together</h2>
        <p className="my-3 text-sm text-slate-600">Sign in to see your credits and the activity behind each balance change.</p>
        <button className={actionClass} onClick={() => setAuthOpen(true)}>Sign in</button>
      </section>}
      {status === "authenticated" && <>
        <section className="rounded-3xl border border-white bg-white/95 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0"><h2 className="break-words text-xl font-extrabold text-slate-800">{username}</h2><p className="mt-1 break-all text-sm text-slate-600">{session?.user?.email}</p></div>
            <button className={actionClass} onClick={() => void signOut({ callbackUrl: "/summons" })}>Sign out</button>
          </div>
          <div className="mt-5 rounded-2xl bg-orange-50 p-5">
            <h3 className="text-sm font-bold text-slate-600">Available credits</h3>
            <p data-testid="profile-credit-balance" className="mt-1 text-3xl font-black text-slate-800">{account ? account.offChain.credits.toLocaleString() : "—"}<span className="ml-2 text-sm font-bold">credits</span></p>
            <p className="mt-2 text-sm text-slate-600">Internal quest credits only. They are not cash and cannot be withdrawn.</p>
          </div>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-5 sm:p-6" aria-labelledby="credit-activity-heading">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="credit-activity-heading" className="text-lg font-extrabold text-slate-800">Credit activity</h2><button className={actionClass} disabled={busy} onClick={refresh}>Refresh credits</button></div>
          <p className="mt-2 text-sm text-slate-600">The latest 30 transactions returned by your account. Older history is not available in this view. Each balance is recorded immediately after that transaction.</p>
          {busy && <p role="status" className="mt-5">Loading your credits and transactions…</p>}
          {current?.error && <div role="alert" className="mt-5 rounded-2xl border border-red-200 p-4"><p>{current.error}</p><button className={`${actionClass} mt-3`} onClick={refresh}>Try again</button></div>}
          {account && <>
            {account.transactions.length === 0 ? <p className="mt-5 text-sm text-slate-600">No credit transactions yet.</p> : <ol className="mt-4 divide-y divide-slate-200" data-testid="profile-credit-transactions">
              {account.transactions.slice(0, visibleCount).map(transaction => <li key={transaction.id} data-transaction-id={transaction.id} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h3 className="font-bold text-slate-800">{transactionLabels[transaction.type] ?? transaction.type.replaceAll("_", " ")}</h3><time className="mt-1 block text-xs text-slate-600" dateTime={transaction.createdAt}>{new Date(transaction.createdAt).toLocaleString()}</time></div>
                  <p className={`shrink-0 font-extrabold ${transaction.amount > 0 ? "text-emerald-700" : "text-slate-800"}`}>{transaction.amount > 0 ? "+" : ""}{transaction.amount.toLocaleString()}<span className="ml-1 text-xs font-medium">cr</span></p>
                </div>
                {transaction.description && <p className="mt-2 break-words text-sm text-slate-600">{transaction.description}</p>}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"><span className="text-slate-600">Balance after: {transaction.balanceAfter.toLocaleString()} cr</span>{transaction.challengeId && <Link className="inline-flex min-h-11 items-center font-bold text-sky-800 underline" href={`/challenge/${encodeURIComponent(transaction.challengeId)}`}>View quest</Link>}</div>
              </li>)}
            </ol>}
            <p className="mt-3 text-xs text-slate-600">Showing {Math.min(visibleCount, account.transactions.length)} of {account.transactions.length} recent transactions.</p>
            {visibleCount < account.transactions.length && <button className={`${actionClass} mt-3`} onClick={() => setVisibleCount(value => value + 10)}>Show more transactions</button>}
          </>}
        </section>
      </>}
    </div>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => setAuthOpen(false)} />
  </SceneShell>;
}
