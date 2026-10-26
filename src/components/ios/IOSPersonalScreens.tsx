"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import AuthModal from "@/components/AuthModal";
import { IosAction, IosArt, IosFrame, IosIcon, IosQuestCard, visuals } from "./IOSAppUI";
import {useOwnQuests,useCreditBalance,useEvidenceGallery} from "./IOSAppData";
import IOSDailyRituals, {useDeviceRituals} from "./IOSDailyRituals";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";

export function AuthInvitation({title,detail,titleZh,detailZh}: {
  title?:string;detail?:string;titleZh?:string;detailZh?:string;
}) {
  const language=useSumLanguage();
  const [open,setOpen]=useState(false);
  return <div className="ios-auth-invitation">
    <IosArt src={visuals.mascotHappy} alt="Pico waiting to help" className="ios-auth-invitation__pico"/>
    <h2>{translated(language,title??"Your story begins here.",titleZh??title??"你的故事从这里开始。")}</h2>
    <p>{translated(language,detail??"Sign in to save your Quests, evidence and actual progress.",
      detailZh??detail??"登录以保存你的 Quest、证据与真实进度。")}</p>
    <button type="button" className="ios-primary" onClick={()=>setOpen(true)}>
      <SumText en="Sign in or create account" zh="登录或创建账号"/>
    </button>
    <AuthModal open={open} onClose={()=>setOpen(false)} onSuccess={()=>setOpen(false)}/>
  </div>;
}

function EmptyOrError({loading,error,message,messageZh}: {
  loading:boolean;error:string;message:string;messageZh?:string;
}) {
  if(loading) return <p className="ios-message" role="status"><SumText
    en="Pico is gathering your real Quests…" zh="Pico 正在读取你的真实 Quest…"/></p>;
  // Server-provided errors are intentionally not rewritten.
  if(error) return <p className="ios-message ios-message--error" role="alert">{error}</p>;
  return <p className="ios-message"><SumText en={message} zh={messageZh??message}/></p>;
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
    <section className="ios-quiz-home-entry">
      <div><p className="ios-overline">FRIEND VS FRIEND · ZERO-STAKE</p>
        <h2>Speak a Quiz into existence</h2>
        <p>Challenge a friend, answer the same questions and verify the score.</p>
      </div>
      <IosAction href="/app/quiz">Start a voice Quiz</IosAction>
    </section>
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
  const language=useSumLanguage();
  const {data:session,status}=useSession();
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {credits,loading:creditsLoading,error:creditError}=useCreditBalance();
  const count=quests.filter(q=>q.status==="settled").length;
  const menu=[
    ["Your Quests","我的 Quest","today","/app/today"],
    ["Your Evidence","我的证据","gallery","/app/evidence"],
    ["Achievements","成就","trophy","/app/achievements"],
    ["Your Journey","我的历程","chart","/app/stats"],
    ["Community","社区","people","/app/community"],
    ["Settings","设置","settings","/app/settings"],
    ["Help & Support","帮助与支持","heart","/support"],
  ] as const;
  return <IosFrame title="Profile" eyebrow="YOUR OWN LITTLE WORLD">
    <section className="ios-profile-head">
      <span className="ios-profile-head__portrait"><IosArt src={visuals.mascot}/></span>
      <h1>{session?.user?.name||session?.user?.username||translated(language,"Summoner","召唤师")}</h1>
      <p>{status==="authenticated"?
        <SumText en="Your personal Quest record" zh="你的个人 Quest 记录"/>:
        <SumText en="Sign in for your own Quest history" zh="登录后查看你的 Quest 历史"/>}</p>
      {signedIn && <div className="ios-metrics ios-metrics--profile">
        <div><strong>{loading?"–":count}</strong><span><SumText en="Settled" zh="已结算"/></span></div>
        <div><strong>{loading?"–":quests.length}</strong><span><SumText en="Quests" zh="Quest"/></span></div>
        <div><strong>{creditsLoading?"–":credits??"–"}</strong><span><SumText en="Credits" zh="积分"/></span></div>
      </div>}
    </section>
    {!signedIn ? <AuthInvitation/> : <>
      {error && <p role="alert" className="ios-message ios-message--error">{error}</p>}
      {creditError && <p role="alert" className="ios-message ios-message--error">{creditError}</p>}
    </>}
    <section className="ios-menu" aria-label={translated(language,"Your account","你的账号")}>
      {menu.map(([label,zh,icon,href])=><Link key={href} href={href} className="ios-menu__row">
        <span className="ios-menu__icon"><IosIcon name={icon==="today"?"calendar":icon}/></span>
        <strong>{translated(language,label,zh)}</strong><IosIcon name="arrow" size={17}/>
      </Link>)}
    </section>
    <p className="ios-footer-note"><SumText
      en="Progress is based on your real Quest history, not simulated achievements."
      zh="进度仅根据真实的 Quest 历史记录计算，不使用模拟成就。"/></p>
  </IosFrame>;
}

const badges=[
  {name:"First Step",zhName:"首次启程",icon:"star" as const,art:visuals.move,
    check:(n:number,_s:number,_e:number)=>n>0,detail:"Create your first Quest",zhDetail:"创建你的第一个 Quest"},
  {name:"Quest Keeper",zhName:"Quest 完成者",icon:"trophy" as const,art:visuals.adventure,
    check:(_n:number,s:number,_e:number)=>s>=1,detail:"Finish a real Quest",zhDetail:"完成一个真实 Quest"},
  {name:"Proof Collector",zhName:"证据收集者",icon:"camera" as const,art:visuals.create,
    check:(_n:number,_s:number,e:number)=>e>0,detail:"Submit evidence",zhDetail:"提交一份证据"},
  {name:"Explorer",zhName:"探索者",icon:"discover" as const,art:visuals.grow,
    check:(n:number,_s:number,_e:number)=>n>=5,detail:"Participate in five Quests",zhDetail:"参与五个 Quest"},
  {name:"Bright Future",zhName:"光明未来",icon:"spark" as const,art:visuals.sky,
    check:(_n:number,s:number,_e:number)=>s>=5,detail:"Settle five Quests",zhDetail:"结算五个 Quest"},
  {name:"Seven-Day Streak",zhName:"七日连续打卡",icon:"calendar" as const,art:visuals.mascot,
    check:()=>false,detail:"Seven consecutive on-device check-in days",zhDetail:"设备内连续打卡七天"},
] as const;

export function AchievementsScreen() {
  const language=useSumLanguage();
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {streak}=useDeviceRituals();
  const countSettled=quests.filter(q=>q.status==="settled").length;
  const evidence=quests.reduce((sum,q)=>sum+(q._count?.evidence||0),0);
  return <IosFrame title="Achievements" eyebrow="MILESTONES" back="/app/profile">
    <div className="ios-filters ios-filters--static">
      <span className="ios-chip is-selected"><SumText en="All" zh="全部"/></span>
      <span className="ios-chip"><SumText en="Quest history" zh="Quest 历史"/></span>
    </div>
    {!signedIn && <AuthInvitation
      detail="Preview the milestones below; they only unlock from your own real Quest data."
      detailZh="以下仅为成就目标。只有真实的个人 Quest 记录才能解锁。"/>}
    {signedIn && <EmptyOrError loading={loading} error={error}
      message="Milestones are calculated from your Quests."
      messageZh="成就进度根据你的真实 Quest 记录计算。"/>}
    <div className="ios-badge-grid">{badges.map(b=>{
        const achieved=b.name==="Seven-Day Streak" ? streak>=7 :
          signedIn && !loading && b.check(quests.length,countSettled,evidence);
        return <article key={b.name} className={"ios-badge" + (achieved?" is-earned":"")}>
          <div className="ios-badge__art"><IosArt src={b.art}/><span><IosIcon name={b.icon}/></span></div>
          <h2>{translated(language,b.name,b.zhName)}</h2>
          <p>{translated(language,b.detail,b.zhDetail)}</p>
          <small>{achieved?translated(language,"Earned from your record","按真实记录解锁"):
            signedIn?translated(language,"Not earned","尚未解锁"):
              translated(language,"Locked · sign in","未解锁 · 请先登录")}</small>
        </article>;
      })}</div>
  </IosFrame>;
}

export function EvidenceScreen() {
  const language=useSumLanguage();
  const {evidence,loading,error,signedIn}=useEvidenceGallery();
  const [filter,setFilter]=useState<"all"|"photo"|"video"|"text">("all");
  const selected=evidence.filter(x=>filter==="all"||x.type===filter||(filter==="photo"&&x.type==="image"));
  const filterLabels=[
    {kind:"all",en:"All",zh:"全部"},
    {kind:"photo",en:"Photo",zh:"照片"},
    {kind:"video",en:"Video",zh:"视频"},
    {kind:"text",en:"Text",zh:"文字"},
  ] as const;
  const examples=[
    {image:visuals.move,label:"Move",zh:"行动"},
    {image:visuals.create,label:"Create",zh:"创造"},
    {image:visuals.grow,label:"Grow",zh:"成长"},
    {image:visuals.adventure,label:"Adventure",zh:"冒险"},
  ];
  return <IosFrame title="My Evidence" eyebrow="YOUR PRIVATE PROOF GALLERY" back="/app/profile">
    <div className="ios-filters">{filterLabels.map(({kind,en,zh})=><button key={kind}
      type="button" data-testid={"ios-evidence-filter-"+kind}
      className={"ios-chip"+(filter===kind?" is-selected":"")}
      aria-pressed={filter===kind} onClick={()=>setFilter(kind)}>
        {translated(language,en,zh)}
      </button>)}</div>
    {!signedIn?<><AuthInvitation title="Every proof has a story." titleZh="每份证据都有自己的故事。"
      detail="Sign in to see your own authorized proof. These pictures below are examples, not submitted evidence."
      detailZh="登录后查看属于你的真实证据。以下图片仅为示意，并非用户提交的证据。"/>
      <div className="ios-gallery ios-gallery--examples">{examples.map(entry=><div
        className="ios-proof" key={entry.label}>
        <div className="ios-proof__visual"><IosArt src={entry.image}/></div>
        <h2>{translated(language,entry.label,entry.zh)}</h2>
        <p><SumText en="Illustration · no user proof" zh="示意插画 · 非用户证据"/></p>
      </div>)}</div></>:
    <><EmptyOrError loading={loading} error={error}
      message={evidence.length===0?"No evidence yet. Open a live Quest to add your first proof.":""}
      messageZh={evidence.length===0?"尚无证据。打开进行中的 Quest，提交第一份真实证据。":""}/>
      <div className="ios-gallery">{selected.map(item=><article className="ios-proof" key={item.id}>
        <div className="ios-proof__visual">
          {item.url && /^https:\/\//i.test(item.url) && ["image","photo"].includes(item.type)
            ? <Image src={item.url} alt={item.description||translated(language,"Submitted Quest proof","已提交的 Quest 证据")} unoptimized fill sizes="(max-width:600px) 47vw, 220px"/>
            : <IosArt src={item.type==="video"?visuals.move:visuals.create}/>}
          <span><IosIcon name={item.type==="video"?"camera":item.type==="photo"?"gallery":"star"} size={15}/></span>
        </div>
        <h2>{item.questTitle}</h2>
        <p>{item.description||translated(language,item.type+" proof",item.type+" 证据")} · {new Date(item.createdAt).toLocaleDateString(language==="zh"?"zh-CN":"en-US")}</p>
        <Link href={"/app/quest?id="+encodeURIComponent(item.questId)}>
          <SumText en="Open record" zh="查看记录"/>
        </Link>
      </article>)}</div>
    </>}
    <IosAction href="/app/today" secondary><SumText en="See your Quests" zh="查看我的 Quest"/></IosAction>
  </IosFrame>;
}

export function StatsScreen() {
  const language=useSumLanguage();
  const {quests,loading,error,signedIn}=useOwnQuests();
  const {rituals,done,streak}=useDeviceRituals();
  const labels=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const zhLabels=["日","一","二","三","四","五","六"];
  const week=Array.from({length:7},(_,i)=>{
    const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-(6-i));
    const next=new Date(d);next.setDate(next.getDate()+1);
    const count=quests.filter(q=>{const n=Date.parse(q.createdAt);return n>=+d&&n<+next;}).length;
    return { label: translated(language,labels[d.getDay()],"周"+zhLabels[d.getDay()]),count };
  });
  const max=Math.max(1,...week.map(x=>x.count));
  const settled=quests.filter(q=>q.status==="settled").length;
  const open=quests.filter(q=>["open","live","judging","pending_settlement"].includes(q.status)).length;
  return <IosFrame title="Your Journey" eyebrow="REAL QUEST ACTIVITY" back="/app/profile">
    {!signedIn?<AuthInvitation title="See how far you've come." titleZh="看看你走过的路。"
      detail="Your statistics are calculated from your real Quest records."
      detailZh="所有统计均来自你的真实 Quest 记录。"/>:
    <>
      <div className="ios-metrics ios-metrics--large">
        <div><strong>{loading?"–":quests.length}</strong><span><SumText en="Quests" zh="Quest"/></span></div>
        <div><strong>{loading?"–":settled}</strong><span><SumText en="Settled" zh="已结算"/></span></div>
        <div><strong>{loading?"–":open}</strong><span><SumText en="Active" zh="进行中"/></span></div>
      </div>
      <EmptyOrError loading={loading} error={error}
        message="Your activity chart shows actual Quest creation dates."
        messageZh="活动图表仅显示真实 Quest 的创建日期。"/>
      <section className="ios-ritual-progress">
        <div><strong>{done}/{rituals.length}</strong><span>
          <SumText en="Daily check-ins today · on device" zh="今天的打卡 · 仅此设备"/></span></div>
        <small>{language==="zh"?`连续活跃 ${streak} 天 · 仅本地`:
          `${streak} consecutive active day${streak===1?"":"s"} · local only`}</small>
      </section>
      <section className="ios-chart-card">
        <h2><SumText en="Your week" zh="最近一周"/></h2>
        <p><SumText en="Quests created per day · last 7 days" zh="过去七天每天创建的 Quest"/></p>
        <div className="ios-chart" role="img"
          aria-label={translated(language,"Quest creation this week: ","本周 Quest 创建：")+
            week.map(d=>d.label+" "+d.count).join(", ")}>
          {week.map((day,i)=><div key={i} className="ios-chart__day">
            <span className="ios-chart__bar" style={{height:8+(day.count/max)*125+"px"}}/>
            <small>{day.label}</small>
          </div>)}
        </div>
      </section>
      <section className="ios-pico-note"><IosArt src={visuals.mascotHappy}/>
        <p><SumText
          en="Small progress is still progress. Keep creating experiences you can actually complete."
          zh="再小的进步也值得记录。继续创造你能够真正完成的体验。"/></p>
      </section>
    </>}
    <IosAction href="/app/create"><SumText en="Create a Quest" zh="创建 Quest"/></IosAction>
  </IosFrame>;
}

export function SettingsScreen() {
  const language=useSumLanguage();
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
  const saveAppearance=(value:"light"|"night")=>{
    setAppearance(value);
    try{localStorage.setItem("sum-ios-appearance",value);window.dispatchEvent(new Event("sum-ios-preferences-changed"));}catch{}
  };
  const saveReduced=(value:boolean)=>{
    setReduced(value);
    try{localStorage.setItem("sum-ios-reduced-motion",String(value));window.dispatchEvent(new Event("sum-ios-preferences-changed"));}catch{}
  };
  const accountLinks=[
    ["Your profile","个人主页","/app/profile","user"],
    ["Privacy policy","隐私政策","/privacy","shield"],
    ["Terms of service","服务条款","/terms","shield"],
    ["Help & Support","帮助与支持","/support","heart"],
  ] as const;
  return <IosFrame title="Settings" eyebrow="MAKE IT YOUR OWN" back="/app/profile"
    tone={ready&&appearance==="night"?"ios-app--night":""}>
    <section className="ios-settings-group"><h2><SumText en="Appearance" zh="外观设置"/></h2>
      <div className="ios-setting"><span><IosIcon name="moon"/> <SumText en="Theme" zh="主题"/></span>
        <select aria-label={translated(language,"App theme","应用主题")} value={appearance}
          onChange={e=>saveAppearance(e.target.value as "light"|"night")}>
          <option value="light">{translated(language,"Light","浅色")}</option>
          <option value="night">{translated(language,"Night","深色")}</option>
        </select>
      </div>
      <label className="ios-setting"><span><IosIcon name="spark"/> <SumText
        en="Reduce motion" zh="减少动画"/></span>
        <input type="checkbox" checked={reduced} onChange={e=>saveReduced(e.target.checked)}/>
      </label>
      <p className="ios-helper"><SumText
        en="These display preferences are saved on this device only."
        zh="这些显示设置仅保存在当前设备上。"/></p>
    </section>
    <section className="ios-settings-group"><h2><SumText en="Account & Privacy" zh="账号与隐私"/></h2>
      {accountLinks.map(([en,zh,href,icon])=><Link className="ios-setting ios-setting--link"
        key={href} href={href}>
        <span><IosIcon name={icon}/> {translated(language,en,zh)}</span>
        <IosIcon name="arrow" size={16}/>
      </Link>)}
    </section>
    <section className="ios-settings-group"><h2><SumText en="Notifications" zh="通知"/></h2>
      <div className="ios-setting"><span><IosIcon name="bell"/>
        <SumText en="Push notifications" zh="推送通知"/></span>
        <small><SumText en="Not configured" zh="尚未配置"/></small>
      </div>
      <p className="ios-helper"><SumText
        en="Native push delivery is not yet connected. No alerts are promised."
        zh="尚未连接原生推送服务，目前不保证收到提醒。"/></p>
    </section>
    {status==="authenticated"&&<button type="button" className="ios-signout"
      onClick={()=>void signOut({callbackUrl:"/app/today"})}>
      <SumText en="Sign out" zh="退出登录"/>
    </button>}
  </IosFrame>;
}
