"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { IosArt, IosFrame, IosIcon, IosQuestCard, visuals } from "./IOSAppUI";
import { useOwnQuests } from "./IOSAppData";
import IOSDailyRituals from "./IOSDailyRituals";

const terminalStatuses = new Set(["settled", "cancelled", "refunded"]);
const proofStatuses = new Set(["evidence_window_open", "creator_submitted", "opponent_submitted"]);

/** A player's command deck, not a promotional gateway. Every statistic comes from their real account. */
export function TodayScreen() {
  const { data: session } = useSession();
  const { quests, loading, error, signedIn, refresh } = useOwnQuests();
  const [authOpen, setAuthOpen] = useState(false);
  const active = quests.filter(q => !terminalStatuses.has(q.status));
  const complete = quests.filter(q => q.status === "settled");
  const proofReady = active.find(q => proofStatuses.has(q.status));
  const nextQuest = proofReady ?? active[0];
  const name = session?.user?.name || session?.user?.username || "Summoner";

  return <IosFrame title="Quest HQ" eyebrow="YOUR LIVE GAME">
    <section className="ios-command-hud" aria-label="Quest command deck">
      <div className="ios-command-hud__eyebrow">
        <span>SUM / QUEST HQ</span>
        <span className="ios-command-hud__status">
          <span className="ios-command-hud__status-dot" aria-hidden="true"/>
          {loading ? "Syncing" : signedIn ? active.length + " active" : "Guest mode"}
        </span>
      </div>
      <div className="ios-command-hud__content">
        <div>
          <p className="ios-command-hud__welcome">WELCOME, {name.toUpperCase()}</p>
          <h1>Your world.<br/>Your move.</h1>
          <p className="ios-command-hud__hint">Create a challenge, join a duel, or continue your real Quest.</p>
        </div>
        <div className="ios-command-hud__familiar">
          <span className="ios-command-hud__halo" aria-hidden="true"/>
          <IosArt src={visuals.mascot} alt="Pico, your Quest companion" className="ios-command-hud__pico"/>
          <span className="ios-command-hud__pico-label">PICO / 001</span>
        </div>
      </div>
      <Link href="/app/create" className="ios-command-hud__primary" data-testid="ios-start-quest">
        <IosIcon name="spark" size={20}/> Start a Quest <IosIcon name="arrow" size={18}/>
      </Link>
    </section>

    <nav className="ios-command-modes" aria-label="Choose a game mode">
      <Link href="/app/quiz" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="trophy"/></span>
        <strong>1v1 Quiz</strong><small>Challenge a friend</small>
      </Link>
      <Link href="/app/discover" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="discover"/></span>
        <strong>Find a Duel</strong><small>Open challenges</small>
      </Link>
      <Link href="/app/evidence" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="camera"/></span>
        <strong>Proof Vault</strong><small>Your evidence</small>
      </Link>
      <Link href="/app/picos" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="pico"/></span>
        <strong>Familiars</strong><small>Your companions</small>
      </Link>
    </nav>

    <section className="ios-command-quests" aria-label="Your real Quests">
      <div className="ios-command-section-header">
        <div><span className="ios-overline">LIVE STATUS / SERVER RECORDS</span><h2>Your Quests</h2></div>
        {signedIn && <button className="ios-text-action" type="button" onClick={refresh}>Refresh</button>}
      </div>
      {signedIn && !loading && !error && <div className="ios-command-counters" aria-label="Real Quest counts">
        <div><strong>{active.length}</strong><span>Active</span></div>
        <div><strong>{complete.length}</strong><span>Settled</span></div>
        <div><strong>{quests.length}</strong><span>Total</span></div>
      </div>}
      {!signedIn
        ? <div className="ios-command-empty">
            <IosIcon name="shield" size={24}/>
            <div><strong>Sign in to see your Quest record</strong><p>Saved challenges, evidence and results live in your account.</p></div>
            <button className="ios-command-signin" type="button" onClick={() => setAuthOpen(true)}>Sign in</button>
          </div>
        : loading
          ? <p role="status" className="ios-message">Syncing your Quests…</p>
          : error
            ? <p role="alert" className="ios-message ios-message--error">{error}</p>
            : nextQuest
              ? <div className="ios-command-next">
                  <span className="ios-command-next__status">{nextQuest.status.replace(/_/g, " ")}</span>
                  <IosQuestCard challenge={nextQuest}/>
                  <Link href={"/app/quest?id=" + encodeURIComponent(nextQuest.id)} className="ios-command-next__open">
                    {proofReady ? "Open Quest / Check Proof" : "Continue Quest"} <IosIcon name="arrow" size={16}/>
                  </Link>
                  {active.slice(1, 4).filter(q => q.id !== nextQuest.id).map(q =>
                    <IosQuestCard challenge={q} compact key={q.id}/>)}
                </div>
              : <div className="ios-command-empty">
                  <IosIcon name="spark" size={24}/>
                  <div><strong>No active Quests</strong><p>New challenges and invitations appear here.</p></div>
                  <Link className="ios-command-signin" href="/app/create">Create</Link>
                </div>}
    </section>

    {complete.length > 0 && <section className="ios-command-quests" aria-label="Recent settled Quest receipts">
      <div className="ios-command-section-header">
        <div><span className="ios-overline">RECORDED OUTCOMES / NO FABRICATED REWARDS</span><h2>Recent results</h2></div>
      </div>
      <div className="ios-list">
        {complete.slice(0, 3).map(q => <IosQuestCard challenge={q} compact key={q.id}/>)}
      </div>
      <p className="ios-footer-note">Results shown here come from the server. Rewards appear only after their own verified grant.</p>
    </section>}

    <details className="ios-command-daily">
      <summary><IosIcon name="calendar" size={18}/><span>Daily rituals</span><small>Optional on-device check-ins</small><IosIcon name="arrow" size={16}/></summary>
      <IOSDailyRituals/>
    </details>
    <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={() => { setAuthOpen(false); refresh(); }}/>
  </IosFrame>;
}
