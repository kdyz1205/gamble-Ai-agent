"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { IosArt, IosFrame, IosIcon, IosQuestCard, visuals } from "./IOSAppUI";
import { useOwnQuests } from "./IOSAppData";
import IOSDailyRituals from "./IOSDailyRituals";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";

const terminalStatuses = new Set(["settled", "cancelled", "refunded"]);
const proofStatuses = new Set(["evidence_window_open", "creator_submitted", "opponent_submitted"]);

/** A player's command deck, not a promotional gateway. Every statistic comes from their real account. */
export function TodayScreen() {
  const language=useSumLanguage();
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
        <span><SumText en="SUM / QUEST HQ" zh="SUM / QUEST 大厅"/></span>
        <span className="ios-command-hud__status">
          <span className="ios-command-hud__status-dot" aria-hidden="true"/>
          {loading ? translated(language,"Syncing","同步中") : signedIn ? active.length + translated(language," active"," 个进行中") : translated(language,"Guest mode","访客模式")}
        </span>
      </div>
      <div className="ios-command-hud__content">
        <div>
          <p className="ios-command-hud__welcome">{translated(language,"WELCOME, ","欢迎，")}{language==="zh"?name:name.toUpperCase()}</p>
          <h1><SumText en={<>Your world.<br/>Your move.</>} zh={<>你的世界。<br/>由你开启。</>}/></h1>
          <p className="ios-command-hud__hint"><SumText en="Create a challenge, join a duel, or continue your real Quest." zh="创建挑战、加入对决，或继续你正在进行的 Quest。"/></p>
        </div>
        <div className="ios-command-hud__familiar">
          <span className="ios-command-hud__halo" aria-hidden="true"/>
          <IosArt src={visuals.mascot} alt="Pico, your Quest companion" className="ios-command-hud__pico"/>
          <span className="ios-command-hud__pico-label">PICO / 001</span>
        </div>
      </div>
      <Link href="/app/create" className="ios-command-hud__primary" data-testid="ios-start-quest">
        <IosIcon name="spark" size={20}/><SumText en="Start a Quest" zh="创建 Quest"/><IosIcon name="arrow" size={18}/>
      </Link>
    </section>

    <section className="ios-pico-story-entry" aria-label="Play the first Pico chapter"
      data-testid="pico-story-home-entry">
      <div className="ios-pico-story-entry__chapter">
        <span><SumText en="PLAYABLE CHAPTER / PICO 001" zh="可玩序章 / PICO 001"/></span>
        <small>01 · FIRST STAR</small>
      </div>
      <div className="ios-pico-story-entry__body">
        <div>
          <h2><SumText en="Before the first star" zh="第一颗星升起之前"/></h2>
          <p><SumText en="Meet Pico. Perform one spell. See where your story begins." zh="认识 Pico，释放第一道星辉，开启你的冒险。"/></p>
        </div>
        <Link href="/app/story" data-testid="pico-story-open">
          <SumText en="Play chapter" zh="进入序章"/> <IosIcon name="arrow" size={15}/>
        </Link>
      </div>
      <small className="ios-pico-story-entry__note">
        <SumText en="A local story preview · No XP, credits, tickets or inventory changes" zh="本地序章试玩 · 不变更 XP、积分、召唤券或背包"/>
      </small>
    </section>

    <nav className="ios-command-modes" aria-label="Choose a game mode">
      <Link href="/app/quiz" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="trophy"/></span>
        <strong>1v1 Quiz</strong><small><SumText en="Challenge a friend" zh="邀请朋友对决"/></small>
      </Link>
      <Link href="/app/discover" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="discover"/></span>
        <strong><SumText en="Find a Duel" zh="寻找对决"/></strong><small><SumText en="Open challenges" zh="探索公开挑战"/></small>
      </Link>
      <Link href="/app/evidence" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="camera"/></span>
        <strong><SumText en="Proof Vault" zh="证据库"/></strong><small><SumText en="Your evidence" zh="你的证据记录"/></small>
      </Link>
      <Link href="/app/picos" className="ios-command-mode">
        <span className="ios-command-mode__icon"><IosIcon name="pico"/></span>
        <strong><SumText en="Familiars" zh="召唤兽"/></strong><small><SumText en="Your companions" zh="你的冒险伙伴"/></small>
      </Link>
    </nav>

    <section className="ios-command-quests" aria-label="Your real Quests">
      <div className="ios-command-section-header">
        <div><span className="ios-overline">LIVE STATUS / SERVER RECORDS</span><h2><SumText en="Your Quests" zh="我的 Quest"/></h2></div>
        {signedIn && <button className="ios-text-action" type="button" onClick={refresh}><SumText en="Refresh" zh="刷新"/></button>}
      </div>
      {signedIn && !loading && !error && <div className="ios-command-counters" aria-label="Real Quest counts">
        <div><strong>{active.length}</strong><span><SumText en="Active" zh="进行中"/></span></div>
        <div><strong>{complete.length}</strong><span><SumText en="Settled" zh="已结算"/></span></div>
        <div><strong>{quests.length}</strong><span><SumText en="Total" zh="总计"/></span></div>
      </div>}
      {!signedIn
        ? <div className="ios-command-empty">
            <IosIcon name="shield" size={24}/>
            <div><strong><SumText en="Sign in to see your Quest record" zh="登录后查看你的 Quest 记录"/></strong><p><SumText en="Saved challenges, evidence and results live in your account." zh="已保存的挑战、证据和结果均属于你的账号。"/></p></div>
            <button className="ios-command-signin" type="button" onClick={() => setAuthOpen(true)}><SumText en="Sign in" zh="登录"/></button>
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
                    {proofReady ? translated(language,"Open Quest / Check Proof","打开 Quest / 查看证据") : translated(language,"Continue Quest","继续 Quest")} <IosIcon name="arrow" size={16}/>
                  </Link>
                  {active.slice(1, 4).filter(q => q.id !== nextQuest.id).map(q =>
                    <IosQuestCard challenge={q} compact key={q.id}/>)}
                </div>
              : <div className="ios-command-empty">
                  <IosIcon name="spark" size={24}/>
                  <div><strong>No active Quests</strong><p><SumText en="New challenges and invitations appear here." zh="新的挑战与邀请会显示在这里。"/></p></div>
                  <Link className="ios-command-signin" href="/app/create"><SumText en="Create" zh="创建"/></Link>
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
(false)} onSuccess={() => { setAuthOpen(false); refresh(); }}/>
  </IosFrame>;
}
