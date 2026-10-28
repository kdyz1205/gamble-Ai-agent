"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {useCallback,useState,type CSSProperties} from "react";
import {visuals} from "./IOSAppUI";
import QuizArenaParticles from "./QuizArenaParticles";
import {SumText,useSumLanguage,translated,type SumLanguage} from "@/components/locale/SumLanguage";

const Pico3DScene=dynamic(()=>import("./Pico3DScene"),{ssr:false});

type Phase="preview"|"open"|"live"|"completed"|"cancelled";
type Outcome="won"|"lost"|"tie"|"timeout"|null;

type Props={
  phase:Phase;
  creator?:string;
  opponent?:string|null;
  outcome?:Outcome;
  winnerSide?:"creator"|"opponent"|null;
};

/* Fixed positions avoid hydration drift and unnecessary per-frame JS work. */
const SPARKS=Array.from({length:22},(_,index)=>({
  x:((index*37+19)%91)+4,
  y:((index*53+7)%78)+8,
  delay:((index*11)%19)/-4,
  duration:3+((index*7)%13)/5,
  size:index%5===0?4:2,
}));

function statusText(phase:Phase,outcome:Outcome,language:SumLanguage){
  if(language==="zh"){
    if(phase==="preview")return "竞技场预览 · 尚未开始比赛";
    if(phase==="open")return "邀请已创建 · 等待对手确认";
    if(phase==="live")return "对决进行中 · 答案由服务器核验";
    if(phase==="cancelled")return "邀请已取消 · 没有奖励";
    if(outcome==="won")return "胜利已核验 · 服务器结果记录";
    if(outcome==="lost")return "比赛已结束 · 结果已核验";
    if(outcome==="tie")return "平局 · 双方正确题数相同";
    if(outcome==="timeout")return "对决已超时 · 没有胜者";
    return "比赛已结束 · 请核对服务器记录";
  }
  if(phase==="preview")return "Arena preview · no active match";
  if(phase==="open")return "Invitation created · challenger not yet confirmed";
  if(phase==="live")return "Match live · answers verified by the server";
  if(phase==="cancelled")return "Invitation cancelled · no prize";
  if(outcome==="won")return "Verified victory · server receipt";
  if(outcome==="lost")return "Match completed · verified result";
  if(outcome==="tie")return "Verified draw · equal correct answers";
  if(outcome==="timeout")return "Match expired · no winner";
  return "Match completed · check the server receipt";
}

/**
 * Visual-only arena. It never awards XP, sets a winner, mutates a Quiz,
 * or reveals an answer. Phase and outcome come from the existing API.
 */
export default function QuizArenaStage({phase,creator,opponent,outcome=null,winnerSide=null}:Props){
  const language=useSumLanguage();
  const resolved=phase==="completed"&&winnerSide!==null;
  const [show3D,setShow3D]=useState(false);
  const [ready3D,setReady3D]=useState(false);
  const [modelError,setModelError]=useState(false);
  const onReady=useCallback(()=>setReady3D(true),[]);
  const onUnavailable=useCallback(()=>{
    setReady3D(false);setShow3D(false);setModelError(true);
  },[]);
  const switchMode=()=>{
    setReady3D(false);setModelError(false);
    setShow3D(open=>!open);
  };
  return <section className={"ios-quiz-arena ios-quiz-arena--"+phase+
    (resolved?" ios-quiz-arena--"+winnerSide+"-win":"")+
    (show3D&&ready3D?" ios-quiz-arena--3d":"")}
    aria-label="Pico Quiz arena"
    data-testid="ios-quiz-arena" data-phase={phase}
    data-render-mode={show3D&&ready3D?"3d":"illustration"}>
    <div className="ios-quiz-arena__sky" aria-hidden="true"/>
    <div className="ios-quiz-arena__rift" aria-hidden="true">
      <span className="ios-quiz-arena__rift-ring"/>
      <span className="ios-quiz-arena__rift-beam"/>
      <span className="ios-quiz-arena__rift-core"/>
    </div>
    <QuizArenaParticles phase={phase} paused={show3D&&ready3D}/>
    <div className="ios-quiz-arena__sparks" aria-hidden="true">
      {SPARKS.map((spark,index)=><span key={index}
        style={{
          "--spark-x":spark.x+"%",
          "--spark-y":spark.y+"%",
          "--spark-delay":spark.delay+"s",
          "--spark-duration":spark.duration+"s",
          "--spark-size":spark.size+"px",
        } as CSSProperties}/>)}
    </div>
    <div className="ios-quiz-arena__top">
      <span className="ios-quiz-arena__eyebrow"><SumText en="SUMMONER ARENA" zh="召唤师竞技场"/> <span aria-hidden="true">✦</span></span>
      <div className="ios-quiz-arena__top-actions">
        <button type="button" className="ios-quiz-arena__mode"
          data-testid="toggle-pico-3d"
          aria-label={show3D?"Return to Pico illustrations":"Show procedural Pico 3D prototype"}
          aria-pressed={show3D} onClick={switchMode}>
          {show3D?<SumText en="2D ART" zh="2D 插画"/>:<SumText en="3D MODE" zh="3D 模式"/>}
        </button>
        <span className="ios-quiz-arena__free"><SumText en="FREE · 0 CREDITS" zh="免费 · 0 积分"/></span>
      </div>
    </div>
    <div className="ios-quiz-arena__fighters">
      {show3D&&<Pico3DScene phase={phase} winnerSide={winnerSide}
        onReady={onReady} onUnavailable={onUnavailable}/>}
      <div className="ios-quiz-arena__fighter">
        <div className="ios-quiz-arena__platform" aria-hidden="true"/>
        <div className="ios-quiz-arena__aura" aria-hidden="true"/>
        <Image src={visuals.mascotHappy} width={228} height={228}
          sizes="(max-width:430px) 32vw, 160px"
          className="ios-quiz-arena__pico"
          alt="" draggable={false}/>
        <span className="ios-quiz-arena__fighter-label">
          <small>SUMMONER ONE</small>
          <strong>{creator||translated(language,"Your Pico","你的 Pico")}</strong>
        </span>
        {phase==="completed"&&winnerSide==="creator"&&
          <span className="ios-quiz-arena__winner-mark">WINNER</span>}
      </div>
      <div className="ios-quiz-arena__versus" aria-hidden="true">
        <span>VS</span>
        <span className="ios-quiz-arena__versus-flash"/>
      </div>
      <div className={"ios-quiz-arena__fighter ios-quiz-arena__fighter--rival"+
        (!opponent?" ios-quiz-arena__fighter--pending":"")}>
        <div className="ios-quiz-arena__platform" aria-hidden="true"/>
        <div className="ios-quiz-arena__aura" aria-hidden="true"/>
        <Image src={visuals.mascotHappy} width={228} height={228}
          sizes="(max-width:430px) 32vw, 160px"
          className="ios-quiz-arena__pico"
          alt="" draggable={false}/>
        <span className="ios-quiz-arena__fighter-label">
          <small>SUMMONER TWO</small>
          <strong>{opponent||translated(language,"Friend pending","等待好友加入")}</strong>
        </span>
        {phase==="completed"&&winnerSide==="opponent"&&
          <span className="ios-quiz-arena__winner-mark">WINNER</span>}
      </div>
    </div>
    <div className="ios-quiz-arena__ground" aria-hidden="true"/>
    {resolved&&<div className="ios-quiz-arena__impact" aria-hidden="true"/>}
    {show3D&&ready3D&&<span className="ios-quiz-arena__prototype-note">
      Original mesh prototype · drag to rotate</span>}
    {modelError&&<p className="ios-quiz-arena__fallback" role="status">
      3D is unavailable here. The illustrated Pico is still playable.</p>}
    <p className="ios-quiz-arena__status" role="status">{statusText(phase,outcome,language)}</p>
  </section>;
}
