"use client";

import { useEffect,useMemo,useRef,useState } from "react";
import {useSearchParams} from "next/navigation";
import {discoverySelection,discoveryHref,questRoute} from "@/lib/quest-navigation-context";
import Link from "next/link";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,IosQuestCard,visuals} from "./IOSAppUI";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";
import {useOpenQuests,useOwnQuests,usePublicActivity,useStarterPico} from "./IOSAppData";
import {deriveQuestMilestoneRank} from "@/lib/ios-quest-rank";
import IOSLoadingCards from "./IOSLoadingCards";
import ProfessionSummonStudio from "./ProfessionSummonStudio";
import FreeSummonDrawPanel from "./FreeSummonDrawPanel";
import OwnedFamiliarCollection from "./OwnedFamiliarCollection";
import {PROFESSIONS} from "@/lib/summons/profession-system";
import {publicActivityPresentation} from "@/lib/public-activity-presentation";

const categories=[
  {id:"all",label:"All",zh:"全部"},
  {id:"move",label:"Move",zh:"运动"},
  {id:"create",label:"Create",zh:"创造"},
  {id:"grow",label:"Grow",zh:"成长"},
] as const;

function classify(title:string,type:string) {
  const value=(title+" "+type).toLowerCase();
  if(/fitness|sport|run|walk|workout|badminton|hike|ride|plank|pushup/.test(value))return "move";
  if(/create|art|draw|paint|music|write|design|photo|creative/.test(value))return "create";
  return "grow";
}

export function DiscoverScreen() {
  const language=useSumLanguage();
  const {quests,loading,error,refresh}=useOpenQuests();
  const params=useSearchParams();
  const {category:filter,query:search}=discoverySelection(params);
  const returnTo=discoveryHref(filter,search);
  const restored=useRef(false);
  function changeFilters(category:string,query:string){
    window.history.replaceState(null,"",discoveryHref(category,query));
  }
  useEffect(()=>{
    if(loading||error||restored.current)return;
    const hash=window.location.hash;
    if(!/^#quest-[a-zA-Z0-9_-]{1,128}$/.test(hash))return;
    const card=document.getElementById(hash.slice(1));if(!card)return;
    restored.current=true;
    const frame=requestAnimationFrame(()=>{card.scrollIntoView({block:"center"});card.focus({preventScroll:true});});
    return()=>cancelAnimationFrame(frame);
  },[loading,error,quests]);
  const visible=useMemo(()=>quests.filter(q=>
    (filter==="all"||classify(q.title,q.type)===filter)&&
    (q.title+" "+q.description+" "+q.type).toLowerCase().includes(search.toLowerCase().trim())
  ),[quests,filter,search]);
  return <IosFrame title="Discover" eyebrow="SHARED POSSIBILITIES">
    <section className="ios-discover-console" aria-label="Matchmaking">
      <div><span className="ios-overline"><SumText en="MATCHMAKING / PUBLIC QUESTS" zh="匹配 / 公开 Quest"/></span><h1><SumText en="Find a Duel" zh="寻找对决"/></h1>
        <p><SumText en="Join an open Quest or host a challenge of your own." zh="加入正在招募的 Quest，或由你发起新的挑战。"/></p></div>
      <Link href="/app/create" className="ios-discover-console__new"><IosIcon name="spark" size={16}/> <SumText en="Host" zh="发起"/></Link>
    </section>
    <label className="ios-search"><IosIcon name="discover" size={18}/>
      <span className="sr-only">Search Quests</span>
      <input aria-label={translated(language,"Search Quests","搜索 Quest")} placeholder={translated(language,"Search Quests…","搜索 Quest…")} value={search} maxLength={160} onChange={e=>changeFilters(filter,e.target.value)}/>
    </label>
    <div className="ios-filters" role="group" aria-label="Quest categories">{categories.map(item=><button key={item.id} type="button" className={"ios-chip"+(filter===item.id?" is-selected":"")} aria-pressed={filter===item.id} onClick={()=>changeFilters(item.id,search)}>{translated(language,item.label,item.zh)}</button>)}</div>
    <div className="ios-section__heading"><div><small><SumText en="REAL OPEN CHALLENGES" zh="真实开放挑战"/></small><h2><SumText en="Open matches" zh="开放中的对决"/></h2></div><button className="ios-text-action" type="button" onClick={refresh}><SumText en="Refresh" zh="刷新"/></button></div>
    {loading ? <IOSLoadingCards label={translated(language,"Finding public Quests…","正在寻找公开 Quest…")} /> :
      error ? <section className="ios-discovery-recovery" data-testid="discovery-load-error">
        <h2><SumText en="We could not load Quests." zh="暂时无法读取 Quest。"/></h2>
        <p role="alert" className="ios-message ios-message--error">{error}</p>
        <button type="button" className="ios-secondary-button" onClick={refresh}><SumText en="Try again" zh="重试"/></button>
      </section> :
      visible.length===0 ? (search.trim()||filter!=="all"?<section className="ios-discovery-recovery" data-testid="discovery-no-matches">
        <IosEmpty image={visuals.move} heading={translated(language,"No matching Quests.","没有匹配的 Quest。")}
          description={translated(language,"These filters do not match the public Quests currently loaded. Clear them or try another search.","当前筛选未匹配到已加载的公开 Quest。可以清除筛选或更换关键词。")}/>
        <button type="button" className="ios-secondary-button" onClick={()=>changeFilters("all","")}><SumText en="Clear filters" zh="清除筛选"/></button>
      </section>:<IosEmpty image={visuals.move} heading={translated(language,"A new Quest could start with you.","下一个 Quest，也许就由你开启。")}
        description={translated(language,"No public open Quests right now. Be the one who starts something.","暂时没有开放的 Quest，来发起第一个吧。")}
        action={translated(language,"Create a Quest","创建 Quest")} href="/app/create"/>) :
      <><p className="ios-discovery-count" role="status">{language==="zh"?`当前列表中有 ${visible.length} 个匹配结果`:`${visible.length} matching Quests in this list`}</p>
      <div className="ios-list">{visible.map(q=><IosQuestCard key={q.id} challenge={q} returnTo={returnTo}/>)}</div></>}
    <IosAction href="/app/community" secondary><SumText en="See community activity" zh="查看社区动态"/></IosAction>
  </IosFrame>;
}

export function CommunityScreen() {
  const language=useSumLanguage();
  const {events,loading,error,refresh}=usePublicActivity();
  return <IosFrame title="Community" eyebrow="REAL PEOPLE · REAL PROGRESS" back="/app/discover">
    <section className="ios-community-cover">
      <IosArt src={visuals.landscape} alt="Dreamy floating land filled with small adventures"/>
      <div><h1><SumText en="Little things," zh="点滴行动，"/><br/><SumText en="together." zh="一起完成。"/></h1><p><SumText en="A public record of moments from the SUM community." zh="SUM 社区的公开活动记录。"/></p></div>
    </section>
    <div className="ios-section__heading"><div><small><SumText en="PUBLIC ACTIVITY" zh="公开动态"/></small><h2><SumText en="For you" zh="为你推荐"/></h2></div><button type="button" className="ios-text-action" onClick={refresh}><SumText en="Refresh" zh="刷新"/></button></div>
    {loading?<IOSLoadingCards label={translated(language,"Loading public community activity…","正在读取公开社区动态…")} rows={2}/>:
    error?<p className="ios-message ios-message--error" role="alert">{error}</p>:
    events.length===0?<IosEmpty image={visuals.create} heading={translated(language,"Your community starts small.","社区从一点一滴开始。")} description={translated(language,"No public activity has been recorded yet. Completed Quests and public updates will appear here when available.","暂时没有公开动态，真实 Quest 活动和公开更新会显示在这里。")} action={translated(language,"Explore Quests","探索 Quest")} href="/app/discover"/>:
    <div className="ios-feed">{events.map(ev=>{const presentation=publicActivityPresentation(ev,language);return <article className="ios-feed-card" key={ev.id}>
      <div className="ios-feed-card__author"><span className="ios-feed-card__avatar"><IosIcon name="pico"/></span>
        <span><strong>{ev.user?.username||translated(language,"SUM community","SUM 社区")}</strong>
          <small>{new Date(ev.createdAt).toLocaleString(language==="zh"?"zh-CN":"en-US")}</small></span></div>
      <p>{presentation.message}</p>
      {ev.challenge&&<Link className="ios-feed-card__quest" href={questRoute("quest",ev.challenge.id,"/app/community")}>
        <IosArt src={visuals.grow} alt=""/>
        <span><strong>{ev.challenge.title}</strong><small>{ev.challenge.status} · {ev.challenge.type}</small></span>
        <IosIcon name="arrow" size={18}/>
      </Link>}
      <small>{presentation.label}</small>
    </article>;})}</div>}
    <IosAction href="/app/create"><SumText en="Start a Quest with others" zh="和朋友发起 Quest"/></IosAction>
    <p className="ios-footer-note"><SumText en="Likes, comments and custom posts are not supported by the current service. This feed only shows recorded public activity." zh="目前不支持点赞、评论和自定义发帖；这里仅展示已记录的公开动态。"/></p>
  </IosFrame>;
}

const picoStates=[
  {id:"guide",label:"Guide",image:visuals.mascot,copy:"Tell Pico the idea you want to bring to life."},
  {id:"clarify",label:"Clarify",image:visuals.mascotHappy,copy:"Pico can help make a Quest clear enough for everyone to agree."},
  {id:"review",label:"Review",image:visuals.mascotHappy,copy:"Proof must follow the actual accepted rules."}
] as const;

export function PicosScreen() {
  const language=useSumLanguage();
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
      <span className="ios-overline"><SumText en="YOUR STARTING GUIDE" zh="你的初始伙伴"/></span>
      <h1><SumText en="Pico, your first Summon" zh="Pico，你的第一位召唤兽"/></h1><p><SumText en="Every player begins with Pico. Your own profession paths grow from real adventures." zh="每位玩家都从 Pico 开始。完成真实的冒险，逐步解锁不同职业方向。"/></p>
      <p className="ios-pico-entitlement" role="status">
        {!pico.signedIn?translated(language,"Sign in to activate your included starter Pico.","登录后激活附赠的初始 Pico。"):
        pico.loading?translated(language,"Checking your Pico starter rule…","正在检查 Pico 初始资格…"):
        pico.error?translated(language,"Starter status unavailable. Try again after reconnecting.","初始伙伴状态暂时不可用，请联网后重试。"):
        pico.starter?.persistedInventory?
          translated(language,"Pico is in your permanent Summon collection.","Pico 已保存在你的永久召唤兽收藏中。"):
        pico.starter?translated(language,"Pico is included for your account · persistent collection activates after the server rollout.","你的账号包含 Pico；永久收藏将在服务器上线后启用。"):
        translated(language,"Pico starter status is not yet confirmed.","暂时无法确认初始 Pico 状态。")}
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
