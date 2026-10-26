"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {IosFrame,visuals} from "./IOSAppUI";
import {SumText,useSumLanguage} from "@/components/locale/SumLanguage";
import {CAST_MS,SUMMON_MS,STORY_SEQUENCE_ID,type StoryPhase}
  from "@/lib/summons/pico-story-timeline";

const PicoStoryWorld=dynamic(()=>import("./PicoStoryWorld"),{ssr:false});

const lines:Record<StoryPhase,{kicker:string;title:string;description:string}>={
  intro:{
    kicker:"THE WORLD BETWEEN DREAMS",
    title:"Before the first star",
    description:"A little light is waiting beyond the moon gate. Call Pico and begin your very first chapter.",
  },
  summoning:{
    kicker:"A NEW FAMILIAR APPEARS",
    title:"A voice answers",
    description:"Pico follows the sound of your call through the quiet moon gate.",
  },
  ready:{
    kicker:"A LITTLE COURAGE IS ENOUGH",
    title:"Awaken the first light",
    description:"Look toward the sleeping star. Guide Pico's light into the seal with one simple gesture.",
  },
  casting:{
    kicker:"STARLIGHT IN MOTION",
    title:"Let the light flow",
    description:"Gather, release, and watch the moon gate respond. This is a visual training ritual.",
  },
  complete:{
    kicker:"THE PROLOGUE IS COMPLETE",
    title:"The first light is awake",
    description:"Pico's practice is finished. Your real adventures and verified progress begin with actual Quests.",
  },
};

const zhLines:typeof lines={
  intro:{kicker:"梦与现实之间",title:"第一颗星升起之前",
    description:"月之门后藏着一道微光。召唤 Pico，开启你的第一章。"},
  summoning:{kicker:"新的伙伴即将出现",title:"回应你呼唤的声音",
    description:"Pico 正穿过安静的月之门，来到你身边。"},
  ready:{kicker:"只要有一点勇气",title:"唤醒第一道星辉",
    description:"看向沉睡的星星。按下技能按钮，让 Pico 的光芒抵达封印。"},
  casting:{kicker:"星辉开始流动",title:"让光芒绽放",
    description:"蓄力、释放、看月门作出回应。这是一段不产生真实奖励的技能试炼。"},
  complete:{kicker:"序章完成",title:"第一道星辉已经苏醒",
    description:"Pico 完成了练习。真正的冒险与可核验进度，需要你参与真实 Quest。"},
};

function prefersLessMotion(){
  try{
    return matchMedia("(prefers-reduced-motion:reduce)").matches||
      localStorage.getItem("sum-ios-reduced-motion")==="true";
  }catch{return false;}
}

/** A genuinely playable local chapter with one original cinematic move.
 * There is no fake XP, equipment, user progress or Quiz settlement.
 */
export default function PicoStoryChapter(){
  const language=useSumLanguage();
  const [phase,setPhase]=useState<StoryPhase>("intro");
  const [ready3D,setReady3D]=useState(false);
  const [fallback,setFallback]=useState(false);
  const onReady=useCallback(()=>setReady3D(true),[]);
  const onUnavailable=useCallback(()=>{
    setReady3D(false);setFallback(true);
  },[]);
  useEffect(()=>{
    if(phase!=="summoning"&&phase!=="casting")return;
    const duration=phase==="summoning"?SUMMON_MS:CAST_MS;
    const timer=window.setTimeout(()=>{
      setPhase(phase==="summoning"?"ready":"complete");
    },prefersLessMotion()?200:duration);
    return ()=>window.clearTimeout(timer);
  },[phase]);
  const copy=language==="zh"?zhLines[phase]:lines[phase];
  const waiting=phase==="summoning"||phase==="casting";
  const currentStep=phase==="intro"||phase==="summoning"?0:
    phase==="ready"||phase==="casting"?1:2;

  return <IosFrame title="Pico · Chapter One" eyebrow="ONE STORY · ONE MOVE"
    back="/app/today" tone="ios-pico-story" withNav={false}>
    <section className={"pico-story pico-story--"+phase}
      data-testid="pico-story" data-phase={phase}
      data-render-mode={ready3D?"3d":"illustration"}
      data-content-type="local-playable-prologue"
      data-sequence={STORY_SEQUENCE_ID}>
      <div className="pico-story__caption">
        <span><SumText en="SUMMONER / CHAPTER 01" zh="召唤师 / 第一章"/></span>
        <span className="pico-story__demo"><SumText en="PLAYABLE PREVIEW" zh="可玩试玩版"/></span>
      </div>
      <div className="pico-story__theater" data-testid="pico-story-theater"
        role="region" aria-label="Pico's cinematic starlight trial">
        <div className="pico-story__ink" aria-hidden="true"/>
        <div className="pico-story__mist" aria-hidden="true"/>
        <div className="pico-story__moon" aria-hidden="true"/>
        <div className="pico-story__silhouette pico-story__silhouette--left"
          aria-hidden="true"/>
        <div className="pico-story__silhouette pico-story__silhouette--right"
          aria-hidden="true"/>
        {!fallback&&<PicoStoryWorld phase={phase}
          onReady={onReady} onUnavailable={onUnavailable}/>}
        <div className={"pico-story__illustration"+
          (ready3D?" pico-story__illustration--hidden":"")}
          data-testid="pico-story-fallback">
          <Image src={visuals.mascotHappy} alt="" width={405} height={365}
            priority sizes="(max-width: 430px) 74vw, 400px"/>
        </div>
        <div className="pico-story__paper-stars" aria-hidden="true">
          <span/><span/><span/><span/><span/><span/>
        </div>
        <div className="pico-story__target" aria-hidden="true">
          <span>✦</span>
        </div>
        <div className="pico-story__rim" aria-hidden="true"/>
        <span className="pico-story__chapter-stamp"><SumText en="01 / STAR GATE" zh="01 / 星之门"/></span>
      </div>
      <div className="pico-story__dialogue" aria-live="polite"
        data-testid="pico-story-dialogue">
        <span className="pico-story__speaker">
          <span className="pico-story__speaker-dot" aria-hidden="true"/> <SumText en="Pico’s Chronicle" zh="Pico 的冒险日志"/>
        </span>
        <p className="pico-story__kicker">{copy.kicker}</p>
        <h1>{copy.title}</h1>
        <p className="pico-story__text">{copy.description}</p>
      </div>
      <div className="pico-story__beats" aria-label="Chapter progress">
        {(language==="zh"?["召唤 Pico","释放星辉","第一道光"]:["Call Pico","Channel the light","First light"]).map((step,i)=>
          <span key={step} aria-current={i===currentStep?"step":undefined}
            className={i<=currentStep?"is-reached":""}>
            <small>0{i+1}</small>{step}
          </span>)}
      </div>
      <div className="pico-story__actions">
        {phase==="intro"&&<button className="pico-story__action"
          data-testid="pico-story-start" type="button"
          onClick={()=>setPhase("summoning")}>
          <span><SumText en="Call Pico" zh="召唤 Pico"/></span><span aria-hidden="true">✦</span>
        </button>}
        {phase==="ready"&&<button className="pico-story__action"
          data-testid="pico-story-cast" type="button"
          onClick={()=>setPhase("casting")}>
          <span><SumText en="Release Starlight" zh="释放星辉"/></span><span aria-hidden="true">✦</span>
        </button>}
        {waiting&&<button className="pico-story__action"
          data-testid="pico-story-waiting" type="button" disabled>
          {phase==="summoning"?<SumText en="Pico is arriving…" zh="Pico 正在到来…"/>:<SumText en="The light is moving…" zh="星辉正在流动…"/>}
        </button>}
        {phase==="complete"&&<>
          <button className="pico-story__action"
            data-testid="pico-story-replay" type="button"
            onClick={()=>setPhase("intro")}>
            <SumText en="Replay chapter" zh="重玩本章"/> <span aria-hidden="true">↻</span>
          </button>
          <Link href="/app/create" className="pico-story__secondary"
            data-testid="pico-story-quest"><SumText en="Start a real Quest" zh="创建真实 Quest"/></Link>
        </>}
      </div>
      <p className="pico-story__disclaimer" data-testid="pico-story-no-rewards">
        <SumText en="Visual-only chapter · No XP, credits, tickets or inventory rewards." zh="剧情试玩仅用于展示 · 不发放 XP、积分、召唤券或背包道具。"/>
        {fallback?<SumText en=" Your device is using the illustrated version." zh=" 当前设备正在使用插画版。"/>:null}
      </p>
    </section>
  </IosFrame>;
}
