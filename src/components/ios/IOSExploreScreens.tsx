"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,IosQuestCard,visuals} from "./IOSAppUI";
import {useOpenQuests,usePublicActivity} from "./IOSAppData";
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

export function PicosScreen() {
  const [role,setRole]=useState<(typeof picoStates)[number]["id"]>("guide");
  const active=picoStates.find(s=>s.id===role)||picoStates[0];
  return <IosFrame title="My Picos" eyebrow="YOUR LITTLE FAMILIAR">
    <section className="ios-pico-hero">
      <div className="ios-pico-hero__glow"><IosArt src={active.image} alt="Pico, your fantasy Quest companion"/></div>
      <span className="ios-overline">FAMILIAR / 001</span>
      <h1>Pico</h1><p>One little friend for each big idea.</p>
    </section>
    <section className="ios-section">
      <div className="ios-section__heading"><div><small>PICO AT YOUR SIDE</small><h2>How Pico helps</h2></div></div>
      <div className="ios-pico-moods" role="group" aria-label="Pico role">
        {picoStates.map(s=><button type="button" key={s.id} aria-pressed={role===s.id} className={"ios-pico-mood"+(role===s.id?" is-selected":"")} onClick={()=>setRole(s.id)}>
          <IosArt src={s.image}/><span>{s.label}</span>
        </button>)}
      </div>
      <p className="ios-pico-explanation" aria-live="polite">{active.copy}</p>
      <IosAction href="/app/create">Create a Quest with Pico</IosAction>
    </section>
    <section className="ios-pico-note"><IosArt src={visuals.mascotHappy}/><p><strong>A real companion</strong> Pico never confirms a result or changes an agreed rule without the required evidence and consent.</p></section>
  </IosFrame>;
}
