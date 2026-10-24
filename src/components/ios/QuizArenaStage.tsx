"use client";

import Image from "next/image";
import type {CSSProperties} from "react";
import {visuals} from "./IOSAppUI";

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

function statusText(phase:Phase,outcome:Outcome){
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
  const resolved=phase==="completed"&&winnerSide!==null;
  return <section className={"ios-quiz-arena ios-quiz-arena--"+phase+
    (resolved?" ios-quiz-arena--"+winnerSide+"-win":"")}
    aria-label="Pico Quiz arena"
    data-testid="ios-quiz-arena" data-phase={phase}>
    <div className="ios-quiz-arena__sky" aria-hidden="true"/>
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
      <span className="ios-quiz-arena__eyebrow">SUMMONER ARENA <span aria-hidden="true">✦</span></span>
      <span className="ios-quiz-arena__free">FREE · 0 CREDITS</span>
    </div>
    <div className="ios-quiz-arena__fighters">
      <div className="ios-quiz-arena__fighter">
        <div className="ios-quiz-arena__platform" aria-hidden="true"/>
        <div className="ios-quiz-arena__aura" aria-hidden="true"/>
        <Image src={visuals.mascotHappy} width={228} height={228}
          sizes="(max-width:430px) 32vw, 160px"
          className="ios-quiz-arena__pico"
          alt="" draggable={false}/>
        <span className="ios-quiz-arena__fighter-label">
          <small>SUMMONER ONE</small>
          <strong>{creator||"Your Pico"}</strong>
        </span>
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
          <strong>{opponent||"Friend pending"}</strong>
        </span>
      </div>
    </div>
    <div className="ios-quiz-arena__ground" aria-hidden="true"/>
    <p className="ios-quiz-arena__status" role="status">{statusText(phase,outcome)}</p>
  </section>;
}
