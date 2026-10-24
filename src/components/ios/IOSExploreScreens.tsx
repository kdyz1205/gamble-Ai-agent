"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,IosQuestCard,visuals} from "./IOSAppUI";
import {useOpenQuests,useOwnQuests,usePublicActivity} from "./IOSAppData";
import {deriveQuestMilestoneRank} from "@/lib/ios-quest-rank";
import IOSLoadingCards from "./IOSLoadingCards";

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
    <section className="ios-discover-hero">
      <div><span className="ios-overline">FIND A NEW ADVENTURE</span><h1>Your next<br/>little big step.</h1>
        <p>Open Quests from real people, ready to explore.</p></div>
      <IosArt src={visuals.mascotHappy} alt="" className="ios-discover-hero__art"/>
    </section>
    <label className="ios-search"><IosIcon name="discover" size={18}/>
      <span className="sr-only">Search Quests</span>
      <input aria-label="Search Quests" placeholder="Search Quests…" value={search} onChange={e=>setSearch(e.target.value)}/>
    </label>
    <div className="ios-filters" role="group" aria-label="Quest categories">{categories.map(item=><button key={item.id} type="button" className={"ios-chip"+(filter===item.id?" is-selected":"")} aria-pressed={filter===item.id} onClick={()=>setFilter(item.id)}>{item.label}</button>)}</div>
    <div className="ios-section__heading"><div><small>REAL OPEN CHALLENGES</small><h2>Explore together</h2></div><button className="ios-text-action" type="button" onClick={refresh}>Refresh</button></div>
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
    <div className="ios-feed">{events.map(ev=><article className="ios-feed-card" key={ev.id}>
      <div className="ios-feed-card__author"><span className="ios-feed-card__avatar"><IosIcon name="pico"/></span>
        <span><strong>{ev.user?.username||"SUM community"}</strong>
          <small>{new Date(ev.createdAt).toLocaleString()}</small></span></div>
      <p>{ev.message}</p>
      {ev.challenge&&<Link className="ios-feed-card__quest" href={"/app/quest?id="+encodeURIComponent(ev.challenge.id)}>
        <IosArt src={visuals.grow} alt=""/>
        <span><strong>{ev.challenge.title}</strong><small>{ev.challenge.status} · {ev.challenge.type}</small></span>
        <IosIcon name="arrow" size={18}/>
      </Link>}
      <small>Public activity · {ev.type}</small>
    </article>)}</div>}
    <IosAction href="/app/create">Start a Quest with others</IosAction>
    <p className="ios-footer-note">Likes, comments and custom posts are not supported by the current service. This feed only shows recorded public activity.</p>
  </IosFrame>;
}

const picoStates=[
  {id:"guide",label:"Guide",image:visuals.mascot,copy:"Tell Pico the idea you want to bring to life."},
  {id:"clarify",label:"Clarify",image:visuals.mascotHappy,copy:"Pico can help make a Quest clear enough for everyone to agree."},
  {id:"review",label:"Review",image:visuals.mascotHappy,copy:"Proof must follow the actual accepted rules."}
] as const;

// New species are world previews, not owned Familiars or trained AI referees.
// Preset artwork and existing Quest destinations keep this lightweight and real.
const familiarWorlds=[
  {id:"pico",name:"Pico",path:"All Quests",art:visuals.mascot,available:true,
    copy:"Your first guide. Turn a small idea into a Quest with clear rules and real proof.",
    href:"/app/create",cta:"Create with Pico"},
  {id:"kiko",name:"Kiko",path:"Move",art:visuals.adventure,available:false,
    copy:"A forest adventurer for moving, trying something new, and getting stronger.",
    href:"/app/create?seed=move",cta:"Try a Move Quest"},
  {id:"nova",name:"Nova",path:"Create",art:visuals.grow,available:false,
    copy:"A little dreamer for art, music, making things and sharing what you create.",
    href:"/app/create?seed=craft",cta:"Try a Create Quest"},
  {id:"moss",name:"Moss",path:"Grow",art:visuals.portal,available:false,
    copy:"A garden companion for learning, reflection and consistent small steps.",
    href:"/app/create?seed=grow",cta:"Try a Grow Quest"},
] as const;

export function PicosScreen() {
  const [role,setRole]=useState<(typeof picoStates)[number]["id"]>("guide");
  const [familiar,setFamiliar]=useState<(typeof familiarWorlds)[number]["id"]>("pico");
  const active=picoStates.find(s=>s.id===role)||picoStates[0];
  const selected=familiarWorlds.find(s=>s.id===familiar)||familiarWorlds[0];
  const {quests,loading,error,signedIn}=useOwnQuests();
  const rank=signedIn&&!loading&&!error?deriveQuestMilestoneRank(quests):null;
  return <IosFrame title="Familiars" eyebrow="COMPANIONS FOR REAL QUESTS">
    <section className="ios-pico-hero">
      <div className="ios-pico-hero__glow"><IosArt src={visuals.mascot} alt="Pico, your first Quest guide"/></div>
      <span className="ios-overline">YOUR STARTING GUIDE</span>
      <h1>Pico & friends</h1><p>A little magic for the real steps you take.</p>
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

    <section className="ios-section" aria-label="Familiar world previews">
      <div className="ios-section__heading"><div><small>MEET THE WORLD</small><h2>More than Pico</h2></div></div>
      <div className="ios-familiar-roster" role="group" aria-label="Explore Familiar concepts">
        {familiarWorlds.map(friend=><button key={friend.id} type="button"
          aria-pressed={familiar===friend.id} onClick={()=>setFamiliar(friend.id)}
          className={"ios-familiar-card"+(familiar===friend.id?" is-selected":"")}>
          <span className="ios-familiar-card__art"><IosArt src={friend.art} alt={friend.name+" character artwork"}/></span>
          <span className="ios-familiar-card__copy"><strong>{friend.name}</strong>
            <small>{friend.path}</small><small>{friend.available?"Pico guide":"Concept preview"}</small></span>
        </button>)}
      </div>
      <div className="ios-familiar-detail" aria-live="polite">
        <div><span className="ios-overline">{selected.path.toUpperCase()} · {selected.available?"GUIDE":"FUTURE COMPANION"}</span>
        <h3>{selected.name}</h3><p>{selected.copy}</p></div>
        {!selected.available&&<p className="ios-familiar-availability">Preview only. Not collectible or owned yet. No game advantage.</p>}
        <IosAction href={selected.href}>{selected.cta}</IosAction>
      </div>
    </section>

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
