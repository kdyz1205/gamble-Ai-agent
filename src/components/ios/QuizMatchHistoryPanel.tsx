"use client";

import {useEffect,useState} from "react";
import Link from "next/link";
import {useSumLanguage,translated} from "@/components/locale/SumLanguage";
import {
  assertQuizHistoryWire,type VerifiedQuizHistory,
} from "@/lib/quiz/quiz-history-contract";

const outcomeLabel={
  won:"Victory",lost:"Defeat",tie:"Draw",void_timeout:"Timed out",
} as const;
const outcomeLabelZh={
  won:"胜利",lost:"失败",tie:"平局",void_timeout:"超时",
} as const;

/** No XP award side effects. All scores originate from verified sealed
 * answer hashes and the server's original outcome receipt. */
export default function QuizMatchHistoryPanel({enabled,userId}:{
  enabled:boolean;userId:string|null;
}){
  const language=useSumLanguage();
  const t=(en:string,zh:string)=>translated(language,en,zh);
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
    aria-label={t("My verified Quiz match history","我的 Quiz 已验证对战记录")}>
    <span className="ios-overline">{t("MY VERIFIED DUELS","我的已验证对战")}</span>
    <h2>{t("Battle history","对战记录")}</h2>
    {loading?<p role="status">{t("Checking completed server-verified Quizzes...","正在核对服务器已验证的 Quiz 对战…")}</p>:
    error?<p role="alert">{t("Battle history could not be verified. No wins or rewards are being guessed.","无法验证对战记录；不会推测胜场或奖励。")}</p>:
    !data?<p role="status">{t("Awaiting verified match receipts.","等待已验证的对战收据。")}</p>:
    data.items.length===0?<p>{t("No completed Quiz duels have been recorded under this rule.","当前规则下尚无已完成的 Quiz 对战记录。")}</p>:
      <>
        <div className="ios-quiz-rules" data-testid="quiz-history-summary">
          <strong>{data.items.length} {t("verified recent duels","场近期已验证对战")}</strong>
          <p>{data.stats.won} {t("wins","胜")} · {data.stats.lost} {t("losses","负")} ·
            {" "+data.stats.tied} {t("draws","平")} · {data.stats.voided} {t("timed out","超时")}。</p>
          <small>{data.completeHistory?
            t("All completed matches fit in this page.","此页包含全部已完成对战。"):
            t("Latest 20 only: older completed matches may exist.","仅显示最近 20 场；可能存在更早的对战记录。")}</small>
        </div>
        <div style={{display:"grid",gap:9}}>
          {data.items.map(item=><article key={item.challengeId}
            className="ios-quiz-rules"
            data-testid={"quiz-history-"+item.challengeId}>
            <div style={{display:"flex",alignItems:"center",
              justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <strong>{language==="zh"?outcomeLabelZh[item.outcome]:outcomeLabel[item.outcome]}</strong>
              <small>{item.finalizedAt.slice(0,10)} UTC</small>
            </div>
            <p>{item.topic} · {t("versus","对手：")} {item.opponentUsername}</p>
            <p>{item.myScore===null?t("No answer","未作答"):item.myScore+" / 3"} vs.
              {" "+(item.opponentScore===null?t("No answer","未作答"):item.opponentScore+" / 3")}</p>
            <small>{t("SHA-256 outcome","SHA-256 结果哈希")}: {item.resolutionHash.slice(0,16)}...</small>
            <Link href={"/app/quiz?id="+encodeURIComponent(item.challengeId)}
              className="ios-secondary-button"
              aria-label={t("View verified receipt for Quiz ","查看 Quiz 验证收据：")+item.challengeId}>
              {t("Open verified Quiz receipt","查看已验证的 Quiz 收据")}
            </Link>
          </article>)}
        </div>
      </>}
    <small>{t("History records server-verified results only. The current fixed public question bank does not award career XP, free Summon tickets or cash. No score in this list changes your credits or creature inventory.","历史仅记录服务端验证的结果。当前固定公开题库不会发放职业经验、免费召唤券或现金。这里的任何成绩都不会改变积分或召唤兽库存。")}</small>
  </section>;
}
