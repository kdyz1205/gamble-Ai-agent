"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {
  assertQuizHistoryWire,type VerifiedQuizHistory,
} from "@/lib/quiz/quiz-history-contract";

const outcomeLabel={
  won:"Victory",lost:"Defeat",tie:"Draw",void_timeout:"Timed out",
} as const;

/** No XP award side effects. All scores originate from verified sealed
 * answer hashes and the server's original outcome receipt. */
export default function QuizMatchHistoryPanel({enabled,userId}:{
  enabled:boolean;userId:string|null;
}){
  const [data,setData]=useState<VerifiedQuizHistory|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  useEffect(()=>{
    if(!enabled||!userId){
      setData(null);setLoading(false);setError(false);
      return;
    }
    let active=true;
    const abort=new AbortController();
    setData(null);setLoading(true);setError(false);
    void fetch("/api/quiz/history",{
      credentials:"same-origin",cache:"no-store",signal:abort.signal,
    }).then(async response=>{
      if(!response.ok)throw Error("Quiz history service unavailable");
      const value=await response.json() as {history?:unknown};
      return assertQuizHistoryWire(value.history);
    }).then(history=>{
      if(active){setData(history);setLoading(false);}
    }).catch(()=>{
      if(active){setData(null);setLoading(false);setError(true);}
    });
    return()=>{active=false;abort.abort();};
  },[enabled,userId]);

  if(!enabled||!userId)return null;
  return <section className="ios-quiz-card" data-testid="quiz-verified-history"
    aria-label="My verified Quiz match history">
    <span className="ios-overline">MY VERIFIED DUELS</span>
    <h2>Battle history</h2>
    {loading?<p role="status">Checking completed server-verified Quizzes...</p>:
    error?<p role="alert">Battle history could not be verified. No wins or rewards are being guessed.</p>:
    !data?<p role="status">Awaiting verified match receipts.</p>:
    data.items.length===0?<p>No completed Quiz duels have been recorded under this rule.</p>:
      <>
        <div className="ios-quiz-rules" data-testid="quiz-history-summary">
          <strong>{data.items.length} verified recent duels</strong>
          <p>{data.stats.won} wins · {data.stats.lost} losses ·
            {" "+data.stats.tied} draws · {data.stats.voided} timed out.</p>
          <small>{data.completeHistory?
            "All completed matches fit in this page.":
            "Latest 20 only: older completed matches may exist."}</small>
        </div>
        <div style={{display:"grid",gap:9}}>
          {data.items.map(item=><article key={item.challengeId}
            className="ios-quiz-rules"
            data-testid={"quiz-history-"+item.challengeId}>
            <div style={{display:"flex",alignItems:"center",
              justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <strong>{outcomeLabel[item.outcome]}</strong>
              <small>{item.finalizedAt.slice(0,10)} UTC</small>
            </div>
            <p>{item.topic} · versus {item.opponentUsername}</p>
            <p>{item.myScore===null?"No answer":item.myScore+" / 3"} vs.
              {" "+(item.opponentScore===null?"No answer":item.opponentScore+" / 3")}</p>
            <small>SHA-256 outcome: {item.resolutionHash.slice(0,16)}...</small>
            <Link href={"/app/quiz?id="+encodeURIComponent(item.challengeId)}
              className="ios-secondary-button"
              aria-label={"View verified receipt for Quiz "+item.challengeId}>
              Open verified Quiz receipt
            </Link>
          </article>)}
        </div>
      </>}
    <small>History records server-verified results only. The current fixed public
      question bank does not award career XP, free Summon tickets or cash.
      No score in this list changes your credits or creature inventory.</small>
  </section>;
}
