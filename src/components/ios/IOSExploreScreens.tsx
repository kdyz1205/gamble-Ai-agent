"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,IosQuestCard,visuals} from "./IOSAppUI";
import {useOpenQuests,useOwnQuests,usePublicActivity,useStarterPico} from "./IOSAppData";
import {deriveQuestMilestoneRank} from "@/lib/ios-quest-rank";
import IOSLoadingCards from "./IOSLoadingCards";
import ProfessionSummonStudio from "./ProfessionSummonStudio";
import FreeSummonDrawPanel from "./FreeSummonDrawPanel";
import OwnedFamiliarCollection from "./OwnedFamiliarCollection";
import {PROFESSIONS} from "@/lib/summons/profession-system";
import {publicActivityPresentation} from "@/lib/public-activity-presentation";

const categories=[
  { id:"all", label:"All" },{id:"move",label:"Move"},{id:"create",label:"Create"},{id:"grow",label:"Grow"},
] as const;

function classify(title:string,type:string) {
  const value=(title+" "+type).toLowerCase();
  if(/fitness|sport|run|walk|workout|badminton|hike|ride|plank|pushup/.test(value))return "move";
  if(/create|art|draw|paint|music|write|design|photo|creative/.test(value))return "create";
  return "grow";
}

export function DiscoverScreen() {
  const {quests,loading,error,refresh}=useOpenQuests();
  const [filter,setFilter]=useState<(typeof categories)[number]["id"]>("all");
  const [search,setSearch]=useState("");
  const visible=useMemo(()=>quests.filter(q=>
    (filter==="all"||classify(q.title,q.type)===filter)&&
    (q.title+" "+q.description+" "+q.type).toLowerCase().includes(search.toLowerCase().trim())
  ),[quests,filter,search]);
  return <IosFrame title="Discover" eyebrow="SHARED POSSIBILITIES">
    <section className="ios-discover-console" aria-label="Matchmaking">
      <div><span className="ios-overline">MATCHMAKING / PUBLIC QUESTS</span><h1>Find a Duel</h1>
        <p>Join an open Quest or host a challenge of your own.</p></div>
      <Link href="/app/create" className="ios-discover-console__new"><IosIcon name="spark" size={16}/> Host</Link>
    </section>
    <label className="ios-search"><IosIcon name="discover" size={18}/>
      <span className="sr-only">Search Quests</span>
      <input aria-label="Search Quests" placeholder="Search Quests…" value={search} onChange={e=>setSearch(e.target.value)}/>
    </label>
    <div className="ios-filters" role="group" aria-label="Quest categories">{categories.map(item=><button key={item.id} type="button" className={"ios-chip"+(filter===item.id?" is-selected":"")} aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div>
    <div className="ios-section__heading"><div><small>REAL OPEN CHALLENGES</small><h2>Open matches</h2></div><button className="ios-text-action" type="button" onClick={refresh}>Refresh</button></div>
    {loading ? <IOSLoadingCards label="Finding public Quests…" /> :
      error ? <p className="ios-message ios-message--error" role="alert">{error}</p> :
      visible.length===0 ? <IosEmpty image={visuals.move} heading="A new Quest could start with you."
        description={search?"No matching public Quests. Try another search.":"No public open Quests right now. Be the one who starts something."}
        action="Create a Quest" href="/app/create"/> :
      <div className="ios-list">{visible.map(q=><IosQuestCard key={q.id} challenge={q}/>)}</div>}
    <IosAction href="/app/community" secondary>See community activity</IosAction>
  </IosFrame>;
}

export function CommunityScreen() {
  const {events,loading,error,refresh}=usePublicActivity();
  return <IosFrame title="Community" eyebrow="REAL PEOPLE · REAL PROGRESS" back="/app/discover">
    <section className="ios-community-cover">
      <IosArt src={visuals.landscape} alt="Dreamy floating land filled with small adventures"/>
      <div><h1>Little things,<br/>together.</h1><p>A public record of moments from the SUM community.</p></div>
    </section>
    <div className="ios-section__heading"><div><small>PUBLIC ACTIVITY</small><h2>For you</h2></div><button type="button" className="ios-text-action" onClick={refresh}>Refresh</button></div>
    {loading?<IOSLoadingCards label="Loading public community activity…" rows={2}/>:
    error?<p className="ios-message ios-message--error" role="alert">{error}</p>:
    events.length===0?<IosEmpty image={visuals.create} heading="Your community starts small." description="No public activity has been recorded yet. Completed Quests and public updates will appear here when available." action="Explore Quests" href="/app/discover"/>:
    <div className="ios-feed">{events.map(ev=>{const presentation=publicActivityPresentation(ev);return <article className="ios-feed-card" key={ev.id}>
      <div className="ios-feed-card__author"><span className="ios-feed-card__avatar"><IosIcon name="pico"/></span>
        <span><strong>{ev.user?.username||"SUM community"}</strong>
          <small>{new Date(ev.createdAt).toLocaleString()}</small></span></div>
      <p>{presentation.message}</p>
      {ev.challenge&&<Link className="ios-feed-card__quest" href={"/app/quest?id="+encodeURIComponent(ev.challenge.id)}>
        <IosArt src={visuals.grow} alt=""/>
        <span><strong>{ev.challenge.title}</strong><small>{ev.challenge.status} · {ev.challenge.type}</small></span>
        <IosIcon name="arrow" size={18}/>
      </Link>}
      <small>{presentation.label}</small>
    </article>;})}</div>}
    <IosAction href="/app/create">Start a Quest with others</IosAction>
    <p className="ios-footer-note">Likes, comments and custom posts are not supported by the current service. This feed only shows recorded public activity.</p>
  </IosFrame>;
}

const picoStates=[
  {id:"guide",label:"Guide",image:visuals.mascot,copy:"Tell Pico the idea you want to bring to life."},
  {id:"clarify",label:"Clarify",image:visuals.mascotHappy,copy:"Pico can help make a Quest clear enough for everyone to agree."},
  {id:"review",label:"Review",image:visuals.mascotHappy,copy:"Proof must follow the actual accepted rules."}
] as const;

export function PicosScreen() {
  const [role,setRole]=useState<(typeof picoStates)[number]["id"]>("guide");
  const active=picoStates.find(s=>s.id===role)||picoStates[0];
  const {quests,loading,error,signedIn}=useOwnQuests();
  const pico=useStarterPico();
  const rank=signedIn&&!loading&&!error?deriveQuestMilestoneRank(quests):null;
  const recordedXp=pico.progression?.verifiedProfessionXp;
  const tickets=pico.progression?.summonTickets;
  return <IosFrame title="Familiars" eyebrow="COMPANIONS FOR REAL QUESTS">
    <section className="ios-pico-hero">
      <div className="ios-pico-hero__glow"><IosArt src={visuals.mascot} alt="Pico, your first Quest guide"/></div>
      <span className="ios-overline">YOUR STARTING GUIDE</span>
      <h1>Pico, your first Summon</h1><p>Every player begins with Pico. Your own profession paths grow from real adventures.</p>
      <p className="ios-pico-entitlement" role="status">
        {!pico.signedIn?"Sign in to activate your included starter Pico.":
        pico.loading?"Checking your Pico starter rule…":
        pico.error?"Starter status unavailable. Try again after reconnecting.":
        pico.starter?.persistedInventory?
          "Pico is in your permanent Summon collection.":
        pico.starter?"Pico is included for your account · persistent collection activates after the server rollout.":
        "Pico starter status is not yet confirmed."}
      </p>
    </section>

    <section className="ios-milestone" aria-label="Your Quest Milestone Level">
      <span className="ios-overline">YOUR QUEST JOURNEY</span>
      {!signedIn?<><h2>Summoner Level</h2><p>Sign in to see milestones from your own real Quests. No pretend XP.</p></>:
      loading?<p role="status">Checking your real Quest records…</p>:
      error?<p role="alert">Your Quest history could not be loaded. Level is unavailable.</p>:
      rank?.status==="unknown"?<><h2>Level unavailable</h2><p>We need your complete Quest history before calculating a rank. Current results are limited to 50 records.</p></>:
      rank?.status==="ready"?<>
        <div className="ios-milestone__heading"><div><h2>Level {rank.level} · {rank.title}</h2>
          <p>{rank.settled} distinct settled Quest{rank.settled===1?"":"s"} in the loaded record.</p></div>
          <span className="ios-milestone__seal">Lv {rank.level}</span></div>
        <div className="ios-milestone__track" role="progressbar"
          aria-label="Verified Quest progress toward the next milestone"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={rank.percent}
          aria-valuetext={rank.nextThreshold===null?"Top Quest milestone achieved":rank.settled+" settled Quests; next level at "+rank.nextThreshold}>
          <span style={{width:rank.percent+"%"}}/>
        </div>
        <p>{rank.nextThreshold===null?"Current top milestone reached.":(rank.nextThreshold-rank.settled)+" settled Quests until the next level."}</p>
      </>:<p role="status">Checking your Quest Level…</p>}
      <small>This is a read-only settled-Quest milestone, not an XP wallet, credit reward or Familiar Bond level.</small>
    </section>

    <section className="ios-milestone" aria-label="Recorded Profession XP">
      <span className="ios-overline">SERVER RECEIPTS · NOT A SIMULATION</span>
      <h2>Your recorded profession XP</h2>
      {!pico.signedIn?<p>Sign in to check server-verified Quest XP for your account.</p>:
        pico.loading?<p role="status">Checking verified XP receipts…</p>:
        pico.error?<p role="alert">Recorded XP is unavailable while the account service is offline.</p>:
        !pico.progression?.available?<p>Profession XP records are not active on this server yet; your total is unknown.</p>:
        recordedXp?<div>
          <p><strong>{recordedXp.totalRecordedXp} recorded XP</strong> across {recordedXp.receiptCount} verified Quest receipt{recordedXp.receiptCount===1?"":"s"}.</p>
          {recordedXp.byProfession.map(entry=><p key={entry.professionId}>
            <strong>{PROFESSIONS.find(prof=>prof.id===entry.professionId)?.name??entry.professionId}</strong>
            {" · "+entry.recordedXp+" XP · "+entry.receiptCount+" receipt"+(entry.receiptCount===1?"":"s")}
          </p>)}
        </div>:
        <p>No XP receipts have been recorded for this account under the current rule. Historical progress is unknown.</p>}
      <small>These are server-recorded Quest XP receipts since the ledger rule began, not lifetime XP. Older Quests are not backfilled. No free ticket, random creature or fusion is awarded here.</small>
    </section>

    <section className="ios-milestone" aria-label="Audited Free Summon Tickets">
      <span className="ios-overline">FREE CAREER SUMMONS - VERIFIED RECEIPTS</span>
      <h2>Your free Summon tickets</h2>
      {!pico.signedIn?<p>Sign in to check your server-recorded free tickets.</p>:
        pico.loading?<p role="status">Checking ticket receipts...</p>:
        pico.error?<p role="alert">Your ticket receipts are temporarily unavailable.</p>:
        !pico.progression?.available?<p>Ticket records are not active. No balance can be verified.</p>:
        tickets?<div>
          <p><strong>{tickets.available} available</strong> - {tickets.spent} spent - {tickets.issued} issued.</p>
          {tickets.byProfession.map(entry=><p key={entry.professionId}>
            <strong>{PROFESSIONS.find(prof=>prof.id===entry.professionId)?.name??entry.professionId}</strong>
            {" - "+entry.available+" available - "+entry.spent+" spent - "+entry.verifiedXp+" verified XP"}
          </p>)}
          {tickets.awaitingIssuance>0?<p role="status">
            {tickets.awaitingIssuance} audited milestone{tickets.awaitingIssuance===1?"":"s"} awaiting internal issuance. Not spendable yet.
          </p>:null}
          {tickets.byProfession.length===0?<p>No backed ticket history exists under the current rule.</p>:null}
        </div>:
        <p>Free ticket balances are not enabled on this server. No ticket ownership is implied.</p>}
      <small>Read-only current rule receipts, not lifetime rewards. No payment, random draw or item claim occurs here.</small>
    </section>

    <FreeSummonDrawPanel tickets={tickets??null}
      enabled={pico.progression?.freeDrawsAvailable===true}
      onDrawComplete={pico.refresh}/>
    <OwnedFamiliarCollection inventory={pico.inventory}
      signedIn={pico.signedIn} loading={pico.loading} error={pico.error}
      evolutionAvailable={pico.progression?.evolutionAvailable===true}
      verifiedProfessionXp={pico.progression?.verifiedProfessionXp?.byProfession??[]}
      onEvolutionComplete={pico.refresh}/>
    <ProfessionSummonStudio/>

    <section className="ios-section">
      <div className="ios-section__heading"><div><small>PICO IS HERE NOW</small><h2>How Pico helps</h2></div></div>
      <div className="ios-pico-moods" role="group" aria-label="Pico role">
        {picoStates.map(s=><button type="button" key={s.id} aria-pressed={role===s.id}
          className={"ios-pico-mood"+(role===s.id?" is-selected":"")} onClick={()=>setRole(s.id)}>
          <IosArt src={s.image} alt=""/><span>{s.label}</span>
        </button>)}
      </div>
      <p className="ios-pico-explanation" aria-live="polite">{active.copy}</p>
    </section>
    <section className="ios-pico-note"><IosArt src={visuals.mascotHappy} alt=""/>
      <p><strong>Progress comes from real action</strong> Future Familiars may get new expressions and stories, but their level cannot change AI judgment, evidence requirements or credit outcomes.</p>
    </section>
  </IosFrame>;
}
