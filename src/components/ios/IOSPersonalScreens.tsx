"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { IosAction, IosArt, IosFrame, IosIcon, IosQuestCard, visuals } from "./IOSAppUI";
import {useOwnQuests,useCreditBalance,useEvidenceGallery} from "./IOSAppData";
import IOSDailyRituals, {useDeviceRituals} from "./IOSDailyRituals";

export function AuthInvitation({ title = "Your story begins here.", detail = "Sign in to save your Quests, evidence and actual progress." }: {
  title?:string;detail?:string;
}) {
  const [open,setOpen]=useState(false);
  return <div className="ios-auth-invitation">
    <IosArt src={visuals.mascotHappy} alt="Pico waiting to help" className="ios-auth-invitation__pico"/>
    <h2>{title}</h2><p>{detail}</p>
    <button type="button" className="ios-primary" onClick={()=>setOpen(true)}>Sign in or create account</button>
    <AuthModal open={open} onClose={()=>setOpen(false)} onSuccess={()=>setOpen(false)}/>
  </div>;
}

function EmptyOrError({loading,error,message}: {loading:boolean;error:string;message:string}) {
  if(loading) return <p className="ios-message" role="status">Pico is gathering your real Quests…</p>;
  if(error) return <p className="ios-message ios-message--error" role="alert">{error}</p>;
  return <p className="ios-message">{message}</p>;
}

export function TodayScreen() {
  const {data:session}=useSession();
  const {quests,loading,error,signedIn}=useOwnQuests();
  const active=quests.filter(q=>["open","live","judging","pending_settlement","disputed"].includes(q.status));
  const complete=quests.filter(q=>q.status==="settled");
  const [date,setDate]=useState("");
  useEffect(()=>{setDate(new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}));},[]);
  const name=session?.user?.name||session?.user?.username||"Summoner";
  return <IosFrame title="Today" eyebrow={date||"Your Quest day"}>
    <section className="ios-welcome">
      <div><p className="ios-overline">A LITTLE MAGIC EVERY DAY</p>
        <h1>Hi, {name}! <span>✦</span></h1><p>What little step could you take today?</p>
      </div>
      <IosArt src={visuals.mascot} alt="" className="ios-welcome__pico"/>
    </section>
    <div className="ios-habits">
      <Link href="/app/create" className="ios-habit ios-habit--move">
        <span className="ios-habit__image"><IosArt src={visuals.move}/></span><strong>Move</strong><small>Feel a little stronger</small><IosIcon name="arrow" size={18}/>
      </Link>
      <Link href="/app/create?seed=craft" className="ios-habit ios-habit--create">
        <span className="ios-habit__image"><IosArt src={visuals.create}/></span><strong>Create</strong><small>Bring an idea to life</small><IosIcon name="arrow" size={18}/>
      </Link>
      <Link href="/app/create?seed=grow" className="ios-habit ios-habit--grow">
        <span className="ios-habit__image"><IosArt src={visuals.grow}/></span><strong>Grow</strong><small>Small steps, big change</small><IosIcon name="arrow" size={18}/>
      </Link>
    </div>
    <IOSDailyRituals/>
    <section className="ios-section">
      <div className="ios-section__heading"><div><small>YOUR ACTUAL PROGRESS</small><h2>Today&apos;s Quests</h2></div><Link href="/app/stats">View stats <IosIcon name="arrow" size={15}/></Link></div>
      {!signedIn ? <AuthInvitation title="A world of your own." detail="Log in to see Quests and save real outcomes."/>
        : <><div className="ios-metrics"><div><strong>{loading?"–":active.length}</strong><span>In progress</span></div><div><strong>{loading?"–":complete.length}</strong><span>Settled</span></div><div><strong>{loading?"–":quests.length}</strong><span>Total Quests</span></div></div>
          <EmptyOrError loading={loading} error={error} message={active.length?"":"No active Quests yet. Begin with a small goal."}/>
          <div className="ios-list">{active.slice(0,5).map(q=><IosQuestCard challenge={q} key={q.id}/>)}</div>
        </>}
      <IosAction href="/app/create">Create a new Quest</IosAction>
    </section>
    <section className="ios-pico-note"><IosArt src={visuals.mascotHappy}/><p><strong>Pico says</strong> The smallest real step matters more than a perfect plan.</p></section>
  </IosFrame>;
}

export function ProfileScreen() {
  const {data:session,status}=useSession();
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {credits,loading:creditsLoading,error:creditError}=useCreditBalance();
  const count=quests.filter(q=>q.status==="settled").length;
  return <IosFrame title="Profile" eyebrow="YOUR OWN LITTLE WORLD">
    <section className="ios-profile-head">
      <span className="ios-profile-head__portrait"><IosArt src={visuals.mascot}/></span>
      <h1>{session?.user?.name||session?.user?.username||"Summoner"}</h1>
      <p>{status==="authenticated"?"Your personal Quest record":"Sign in for your own Quest history"}</p>
      {signedIn && <div className="ios-metrics ios-metrics--profile">
        <div><strong>{loading?"–":count}</strong><span>Settled</span></div>
        <div><strong>{loading?"–":quests.length}</strong><span>Quests</span></div>
        <div><strong>{creditsLoading?"–":credits??"–"}</strong><span>Credits</span></div>
      </div>}
    </section>
    {!signedIn ? <AuthInvitation/> : <>
      {error && <p role="alert" className="ios-message ios-message--error">{error}</p>}
      {creditError && <p role="alert" className="ios-message ios-message--error">{creditError}</p>}
    </>}
    <section className="ios-menu" aria-label="Your account">
      {([
        ["Your Quests","today","/app/today"],
        ["Your Evidence","gallery","/app/evidence"],
        ["Achievements","trophy","/app/achievements"],
        ["Your Journey","chart","/app/stats"],
        ["Community","people","/app/community"],
        ["Settings","settings","/app/settings"],
        ["Help & Support","heart","/support"]
      ] as const).map(([label,icon,href])=><Link key={href} href={href} className="ios-menu__row">
        <span className="ios-menu__icon"><IosIcon name={icon==="today"?"calendar":icon}/></span>
        <strong>{label}</strong><IosIcon name="arrow" size={17}/>
      </Link>)}
    </section>
    <p className="ios-footer-note">Progress is based on your real Quest history, not simulated achievements.</p>
  </IosFrame>;
}

const badges=[
  {name:"First Step",icon:"star" as const,art:visuals.move,check:(n:number,_s:number,_e:number)=>n>0,detail:"Create your first Quest"},
  {name:"Quest Keeper",icon:"trophy" as const,art:visuals.adventure,check:(_n:number,s:number,_e:number)=>s>=1,detail:"Finish a real Quest"},
  {name:"Proof Collector",icon:"camera" as const,art:visuals.create,check:(_n:number,_s:number,e:number)=>e>0,detail:"Submit evidence"},
  {name:"Explorer",icon:"discover" as const,art:visuals.grow,check:(n:number,_s:number,_e:number)=>n>=5,detail:"Participate in five Quests"},
  {name:"Bright Future",icon:"spark" as const,art:visuals.sky,check:(_n:number,s:number,_e:number)=>s>=5,detail:"Settle five Quests"},
  {name:"Seven-Day Streak",icon:"calendar" as const,art:visuals.mascot,check:()=>false,detail:"Seven consecutive on-device check-in days"},
] as const;

export function AchievementsScreen() {
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {streak}=useDeviceRituals();
  const countSettled=quests.filter(q=>q.status==="settled").length;
  const evidence=quests.reduce((sum,q)=>sum+(q._count?.evidence||0),0);
  return <IosFrame title="Achievements" eyebrow="MILESTONES" back="/app/profile">
    <div className="ios-filters ios-filters--static"><span className="ios-chip is-selected">All</span><span className="ios-chip">Quest history</span></div>
    {!signedIn && <AuthInvitation detail="Preview the milestones below; they only unlock from your own real Quest data."/>}
    {signedIn && <EmptyOrError loading={loading} error={error} message="Milestones are calculated from your Quests."/>}
    <div className="ios-badge-grid">{badges.map(b=>{
        const achieved=b.name==="Seven-Day Streak" ? streak>=7 : signedIn && !loading && b.check(quests.length,countSettled,evidence);
        return <article key={b.name} className={"ios-badge" + (achieved?" is-earned":"")}>
          <div className="ios-badge__art"><IosArt src={b.art}/><span><IosIcon name={b.icon}/></span></div>
          <h2>{b.name}</h2><p>{b.detail}</p>
          <small>{achieved?"Earned from your record":signedIn?"Not earned":"Locked · sign in"}</small>
        </article>;
      })}</div>
  </IosFrame>;
}

export function EvidenceScreen() {
  const {evidence,loading,error,signedIn}=useEvidenceGallery();
  const [filter,setFilter]=useState<"all"|"photo"|"video"|"text">("all");
  const selected=evidence.filter(x=>filter==="all"||x.type===filter||(filter==="photo"&&x.type==="image"));
  return <IosFrame title="My Evidence" eyebrow="YOUR PRIVATE PROOF GALLERY" back="/app/profile">
    <div className="ios-filters">{(["all","photo","video","text"] as const).map(kind=><button key={kind} type="button" className={"ios-chip"+(filter===kind?" is-selected":"")} onClick={()=>setFilter(kind)}>{kind==="all"?"All":kind[0].toUpperCase()+kind.slice(1)}</button>)}</div>
    {!signedIn?<><AuthInvitation title="Every proof has a story." detail="Sign in to see your own authorized proof. These pictures below are examples, not submitted evidence."/><div className="ios-gallery ios-gallery--examples">{[{image:visuals.move,label:"Move"},{image:visuals.create,label:"Create"},{image:visuals.grow,label:"Grow"},{image:visuals.adventure,label:"Adventure"}].map(entry=><div className="ios-proof" key={entry.label}><div className="ios-proof__visual"><IosArt src={entry.image}/></div><h2>{entry.label}</h2><p>Illustration · no user proof</p></div>)}</div></>:
    <><EmptyOrError loading={loading} error={error} message={evidence.length===0?"No evidence yet. Open a live Quest to add your first proof.":""}/>
      <div className="ios-gallery">{selected.map(item=><article className="ios-proof" key={item.id}>
        <div className="ios-proof__visual">
          {item.url && /^https:\/\//i.test(item.url) && ["image","photo"].includes(item.type)
            ? <Image src={item.url} alt={item.description||"Submitted Quest proof"} unoptimized fill sizes="(max-width:600px) 47vw, 220px"/>
            : <IosArt src={item.type==="video"?visuals.move:visuals.create}/>}
          <span><IosIcon name={item.type==="video"?"camera":item.type==="photo"?"gallery":"star"} size={15}/></span>
        </div>
        <h2>{item.questTitle}</h2><p>{item.description||item.type+" proof"} · {new Date(item.createdAt).toLocaleDateString()}</p>
        <Link href={"/app/quest?id="+encodeURIComponent(item.questId)}>Open record</Link>
      </article>)}</div>
    </>}
    <IosAction href="/app/today" secondary>See your Quests</IosAction>
  </IosFrame>;
}

export function StatsScreen() {
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {rituals,done,streak}=useDeviceRituals();
  const labels=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const week=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-i));
    const next=new Date(d);next.setDate(next.getDate()+1);
    const count=quests.filter(q=>{const n=Date.parse(q.createdAt);return n>=+d&&n<+next;}).length;
    return { label: labels[d.getDay()],count };
  });
  const max=Math.max(1,...week.map(x=>x.count));
  const settled=quests.filter(q=>q.status==="settled").length;
  const open=quests.filter(q=>["open","live","judging","pending_settlement"].includes(q.status)).length;
  return <IosFrame title="Your Journey" eyebrow="REAL QUEST ACTIVITY" back="/app/profile">
    {!signedIn?<AuthInvitation title="See how far you've come." detail="Your statistics are calculated from your real Quest records."/>:
    <>
      <div className="ios-metrics ios-metrics--large">
        <div><strong>{loading?"–":quests.length}</strong><span>Quests</span></div><div><strong>{loading?"–":settled}</strong><span>Settled</span></div>
        <div><strong>{loading?"–":open}</strong><span>Active</span></div>
      </div>
      <EmptyOrError loading={loading} error={error} message="Your activity chart shows actual Quest creation dates."/>
      <section className="ios-ritual-progress"><div><strong>{done}/{rituals.length}</strong><span>Daily check-ins today · on device</span></div><small>{streak} consecutive active day{streak===1?"":"s"} · local only</small></section>
      <section className="ios-chart-card">
        <h2>Your week</h2><p>Quests created per day · last 7 days</p>
        <div className="ios-chart" role="img" aria-label={"Quest creation this week: "+week.map(d=>d.label+" "+d.count).join(", ")}>
          {week.map((day,i)=><div key={i} className="ios-chart__day"><span className="ios-chart__bar" style={{height:8+(day.count/max)*125+"px"}}/><small>{day.label}</small></div>)}
        </div>
      </section>
      <section className="ios-pico-note"><IosArt src={visuals.mascotHappy}/><p>Small progress is still progress. Keep creating experiences you can actually complete.</p></section>
    </>}
    <IosAction href="/app/create">Create a Quest</IosAction>
  </IosFrame>;
}

export function SettingsScreen() {
  const {status}=useSession();
  const [appearance,setAppearance]=useState<"light"|"night">("light");
  const [reduced,setReduced]=useState(false);
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    try {
      const mode=localStorage.getItem("sum-ios-appearance");
      setAppearance(mode==="night"?"night":"light");
      setReduced(localStorage.getItem("sum-ios-reduced-motion")==="true");
    } catch {} setReady(true);
  },[]);
  const saveAppearance=(value:"light"|"night")=>{setAppearance(value);try{localStorage.setItem("sum-ios-appearance",value);window.dispatchEvent(new Event("sum-ios-preferences-changed"));}catch{}};
  const saveReduced=(value:boolean)=>{setReduced(value);try{localStorage.setItem("sum-ios-reduced-motion",String(value));window.dispatchEvent(new Event("sum-ios-preferences-changed"));}catch{}};
  return <IosFrame title="Settings" eyebrow="MAKE IT YOUR OWN" back="/app/profile" tone={ready&&appearance==="night"?"ios-app--night":""}>
    <section className="ios-settings-group"><h2>Appearance</h2>
      <div className="ios-setting"><span><IosIcon name="moon"/> Theme</span><select aria-label="App theme" value={appearance} onChange={e=>saveAppearance(e.target.value as "light"|"night")}><option value="light">Light</option><option value="night">Night</option></select></div>
      <label className="ios-setting"><span><IosIcon name="spark"/> Reduce motion</span><input type="checkbox" checked={reduced} onChange={e=>saveReduced(e.target.checked)}/></label>
      <p className="ios-helper">These display preferences are saved on this device only.</p>
    </section>
    <section className="ios-settings-group"><h2>Account & Privacy</h2>
      {([["Your profile","/app/profile","user"],["Privacy policy","/privacy","shield"],["Terms of service","/terms","shield"],["Help & Support","/support","heart"]] as const).map(([text,href,icon])=><Link className="ios-setting ios-setting--link" key={href} href={href}><span><IosIcon name={icon}/> {text}</span><IosIcon name="arrow" size={16}/></Link>)}
    </section>
    <section className="ios-settings-group"><h2>Notifications</h2>
      <div className="ios-setting"><span><IosIcon name="bell"/> Push notifications</span><small>Not configured</small></div>
      <p className="ios-helper">Native push delivery is not yet connected. No alerts are promised.</p>
    </section>
    {status==="authenticated"&&<button type="button" className="ios-signout" onClick={()=>void signOut({callbackUrl:"/app/today"})}>Sign out</button>}
  </IosFrame>;
}
