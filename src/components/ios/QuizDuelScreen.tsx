"use client";

import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {useSession} from "next-auth/react";
import {IosFrame,IosAction} from "./IOSAppUI";
import {AuthInvitation} from "./IOSPersonalScreens";
import {QuizVoiceInput} from "./QuizVoiceInput";
import QuizArenaStage from "./QuizArenaStage";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";
import QuizMatchHistoryPanel from "./QuizMatchHistoryPanel";

const TOPICS=[
  {id:"general",label:"General knowledge / 常识"},
  {id:"technology",label:"Software & AI / 技术"},
  {id:"science",label:"Science / 科学"},
  {id:"sports",label:"Sports / 体育"},
  {id:"math",label:"Mathematics / 数学"},
] as const;
type Topic=typeof TOPICS[number]["id"];
type PublicQuestion={id:string;prompt:string;choices:string[]};
type Score={userId:string;score:number|null;answerHash:string|null;answers:number[]|null};
type QuizResult={
  version:string;bankVersion:string;questionIds:string[];
  correctAnswers:Array<{id:string;answer:number}>;
  answerCommitment:string;
  scores:Score[];winnerId:string|null;outcome:"win"|"tie"|"void_timeout";
  creditsTransferred:0;escrowCredits:0;expiresAt:string|null;
};
type AiCapabilities={
  text:{providerId:string;transport:string;configured:boolean};
  speech:{providerId:string;transport:string;configured:boolean};
  quiz:{enabled:boolean};
  quizGrading:{providerId:string;model:string;externalAiCalls:number};
  subscriptionSharing:{availableInThisApp:boolean};
};
type QuizView={
  id:string;title:string;topic:string;bankVersion:string;
  status:"open"|"live"|"completed"|"cancelled";
  challengeStatus:string;stakeCredits:0;stakesEnabled:false;
  creatorUsername:string;opponentUsername:string|null;
  isCreator:boolean;
  playerUserId:string;accepted:boolean;canJoin:boolean;
  expiresAt:string|null;answerCommitment:string;resolutionHash:string|null;
  questions:PublicQuestion[]|null;
  ownSubmitted:boolean;opponentSubmitted:boolean;result:QuizResult|null;
  receiptVersion:string;
};
const secondsRemaining=(time:string|null,now:number)=>time?
  Math.max(0,Math.ceil((Date.parse(time)-now)/1000)):0;

function detectTopic(text:string):Topic{
  const t=text.toLowerCase();
  if(/羽毛球|体育|篮球|足球|badminton|tennis|sports|basketball/.test(t))return "sports";
  if(/数学|积分|统计|calculus|mathemat|algebra/.test(t))return "math";
  if(/科学|化学|物理|生物|biology|chemistry|physics|science/.test(t))return "science";
  if(/ai|code|program|software|computer|编程|机器人|人工智能|技术/.test(t))return "technology";
  return "general";
}
async function fetchJson<T>(url:string,options?:RequestInit):Promise<T>{
  const r=await fetch(url,{credentials:"same-origin",cache:"no-store",...options,
    headers:{"Accept":"application/json",...(options?.headers??{})}});
  let payload:Record<string,unknown>;
  try{payload=await r.json() as Record<string,unknown>;}
  catch{throw new Error("The Quiz server returned an invalid response.");}
  if(!r.ok)throw new Error(typeof payload.error==="string"?payload.error:"Quiz request failed");
  return payload as T;
}
const mutation={method:"POST",headers:{"Content-Type":"application/json"}} as const;

export default function QuizDuelScreen({id}:{id?:string}){
  const {status,data:session}=useSession();
  // A room/account switch is a new answer lifecycle, never a continuation of
  // the previous room's selected answers, retry key or pending mutation.
  return <QuizDuelSession key={`${status}:${session?.user?.id??"guest"}:${id??"create"}`} id={id}/>;
}

function QuizDuelSession({id}:{id?:string}){
  const language=useSumLanguage();
  const {status,data:session}=useSession();
  const router=useRouter();
  const [topic,setTopic]=useState<Topic>("general");
  const [description,setDescription]=useState("");
  const [opponent,setOpponent]=useState("");
  const [voiceNotice,setVoiceNotice]=useState("");
  const [runtime,setRuntime]=useState<AiCapabilities|null>(null);
  const [runtimeError,setRuntimeError]=useState("");
  const [runtimeRetry,setRuntimeRetry]=useState(0);
  const pilotEnabled=runtime?.quiz.enabled===true;
  const [quiz,setQuiz]=useState<QuizView|null>(null);
  const [choices,setChoices]=useState<number[]>([-1,-1,-1]);
  const [now,setNow]=useState(0);
  const [loading,setLoading]=useState(Boolean(id));
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const requestKey=useRef<string|null>(null);
  const autoExpireAttempt=useRef<string|null>(null);
  const topicWasChosen=useRef(false);
  const mounted=useRef(true);
  const actionBusy=useRef(false);
  const revision=useRef(0);
  useEffect(()=>{
    mounted.current=true;
    return()=>{mounted.current=false;};
  },[]);

  const updateDescription=(value:string)=>{
    setDescription(value);
    if(!topicWasChosen.current)setTopic(detectTopic(value));
    requestKey.current=null;
  };
  useEffect(()=>{
    setNow(Date.now());
    const tick=setInterval(()=>setNow(Date.now()),1000);
    return()=>clearInterval(tick);
  },[]);
  useEffect(()=>{
    if(status!=="authenticated")return;
    let active=true;
    setRuntimeError("");
    void fetchJson<{capabilities:AiCapabilities}>("/api/ai/runtime")
      .then(result=>{
        if(!result.capabilities||typeof result.capabilities.quiz?.enabled!=="boolean")
          throw new Error("Quiz configuration could not be verified.");
        if(active)setRuntime(result.capabilities);
      })
      .catch(e=>{
        if(active){
          setRuntime(null);
          setRuntimeError(e instanceof Error?e.message:"Quiz configuration could not be loaded.");
        }
      });
    return()=>{active=false;};
  },[status,runtimeRetry]);
  useEffect(()=>{
    if(!id||status!=="authenticated"||!pilotEnabled)return;
    let active=true;
    let inFlight=false;
    let controller:AbortController|null=null;
    const update=async()=>{
      // Serialize reads and never let a pre-mutation snapshot overwrite a
      // confirmed join/answer/cancel response that arrived in the meantime.
      if(inFlight||actionBusy.current||document.hidden)return;
      inFlight=true;
      const observedRevision=revision.current;
      controller=new AbortController();
      const stillCurrent=()=>active&&mounted.current&&
        observedRevision===revision.current&&!actionBusy.current;
      try{
        const result=await fetchJson<{quiz:QuizView}>("/api/quiz/"+encodeURIComponent(id),
          {signal:controller.signal});
        if(stillCurrent()){setQuiz(result.quiz);setError("");}
      }catch(e){
        if(stillCurrent())setError(e instanceof Error?e.message:"Quiz could not be loaded");
      }finally{
        if(stillCurrent())setLoading(false);
        inFlight=false;
      }
    };
    void update();
    const interval=setInterval(()=>{void update();},3000);
    const visible=()=>{if(!document.hidden)void update();};
    document.addEventListener("visibilitychange",visible);
    return()=>{
      active=false;controller?.abort();clearInterval(interval);
      document.removeEventListener("visibilitychange",visible);
    };
  },[id,status,pilotEnabled]);

  const create=async()=>{
    if(actionBusy.current||status!=="authenticated"||!pilotEnabled)return;
    actionBusy.current=true;revision.current++;
    setWorking(true);setError("");
    if(!requestKey.current)requestKey.current=crypto.randomUUID();
    try{
      const body={
        topic,description:description.trim(),
        opponentUsername:opponent.trim()||undefined,
        stakeCredits:0,requestKey:requestKey.current,
      };
      const result=await fetchJson<{challengeId:string}>("/api/quiz",{
        ...mutation,body:JSON.stringify(body),
      });
      if(!mounted.current)return;
      // Preserve the key on ambiguous failures, but never reuse a successful
      // creation when the player returns here to start another Quiz.
      requestKey.current=null;
      router.push("/app/quiz?id="+encodeURIComponent(result.challengeId));
    }catch(e){
      if(mounted.current)setError(e instanceof Error?e.message:"Quiz creation failed; you can retry safely");
    }finally{
      actionBusy.current=false;
      if(mounted.current)setWorking(false);
    }
  };
  const postAction=useCallback(async(path:string,body?:unknown)=>{
    if(!id||actionBusy.current||!pilotEnabled||status!=="authenticated")return;
    actionBusy.current=true;revision.current++;
    setWorking(true);setError("");
    try{
      const result=await fetchJson<{quiz:QuizView}>(
        "/api/quiz/"+encodeURIComponent(id)+path,{
          ...mutation,body:body?JSON.stringify(body):undefined,
        });
      if(mounted.current)setQuiz(result.quiz);
    }catch(e){
      if(mounted.current)setError(e instanceof Error?e.message:"Quiz action failed");
    }finally{
      actionBusy.current=false;
      if(mounted.current)setWorking(false);
    }
  },[id,pilotEnabled,status]);
  const share=async()=>{
    if(!id)return;
    const url=window.location.origin+"/app/quiz?id="+encodeURIComponent(id);
    try{
      if(navigator.share)await navigator.share({title:"Join my free Quiz",url});
      else await navigator.clipboard.writeText(url);
      setCopied(true);
    }catch{setCopied(false);}
  };

  const expired=Boolean(quiz?.expiresAt&&Date.parse(quiz.expiresAt)<=now);
  // The authenticated client's own expired room can self-finalize through the
  // same locked server route. Cron handles abandoned rooms when enabled.
  useEffect(()=>{
    if(status!=="authenticated"||!pilotEnabled||!id||quiz?.id!==id||
       quiz.status!=="live"||!quiz.accepted||
       !expired||working||autoExpireAttempt.current===id)return;
    autoExpireAttempt.current=id;
    void postAction("/finalize");
  },[status,pilotEnabled,id,quiz?.id,quiz?.status,quiz?.accepted,expired,working,postAction]);
  const remain=secondsRemaining(quiz?.expiresAt||null,now);
  const canSubmit=Boolean(pilotEnabled&&quiz?.id===id&&quiz?.status==="live"&&quiz.accepted&&
    !quiz.ownSubmitted&&!expired&&choices.length===3&&
    choices.every(x=>Number.isInteger(x)&&x>=0&&x<=3)&&!working);
  const result=quiz?.result;
  const arenaPhase=!pilotEnabled||!id||!quiz?"preview":quiz.status;
  const arenaOutcome=arenaPhase!=="completed"||!result?null:
    result.outcome==="tie"?"tie":result.outcome==="void_timeout"?"timeout":
    result.winnerId===quiz?.playerUserId?"won":"lost";
  return <IosFrame title="Voice Quiz Duel" eyebrow="VERIFIED · FRIEND VS FRIEND"
    back="/app/today">
    <QuizArenaStage phase={arenaPhase} creator={quiz?.creatorUsername}
      opponent={quiz?.opponentUsername} outcome={arenaOutcome}
      winnerSide={arenaPhase==="completed"&&result?.outcome==="win"&&quiz?
        ((result.winnerId===quiz.playerUserId)===quiz.isCreator?"creator":"opponent"):
        null}/>
    <section className="ios-quiz-hero ios-quiz-hero--compact"
      data-testid="ios-duel-hud" aria-label="Duel controls and match status">
      <div className="ios-quiz-hero__top">
        <span className="ios-overline"><SumText en="1V1 · VERIFIED QUIZ" zh="双人对决 · 结果可核查"/></span>
        <span className="ios-quiz-hero__phase">{translated(language,arenaPhase.toUpperCase(),({preview:"演示",open:"待加入",live:"进行中",completed:"已完成",cancelled:"已取消"} as const)[arenaPhase])}</span>
      </div>
      <h1>{translated(language,
      quiz?.status==="open"?"Invite your challenger":
        quiz?.status==="live"?quiz.ownSubmitted?"Answers locked in":"Your turn to play":
        quiz?.status==="completed"?"Your match receipt is ready":
        quiz?.status==="cancelled"?"Invitation closed":"Challenge a friend to a Quiz",
      quiz?.status==="open"?"邀请你的对手":
        quiz?.status==="live"?quiz.ownSubmitted?"答案已提交":"轮到你答题":
        quiz?.status==="completed"?"已生成比赛记录":
        quiz?.status==="cancelled"?"邀请已关闭":"邀请朋友进行 Quiz 对决")}</h1>
      <p>{translated(language,
      quiz?.status==="live"?"Both players receive the same three sealed questions. The server checks each answer.":
        quiz?.status==="completed"?"The server has finalized the score. Review the sealed result below.":
        quiz?.status==="cancelled"?"No credits were reserved or transferred.":
        "Speak, invite, then answer three sealed questions. A server receipt confirms the outcome.",
      quiz?.status==="live"?"双方回答同样的三道题，答案由服务器核验。":
        quiz?.status==="completed"?"比分已由服务器结算，请查看下方可核查的记录。":
        quiz?.status==="cancelled"?"此次取消没有预留或转移积分。":
        "描述想出的题目、邀请好友、回答三道题，最后查看服务器结果。")}</p>
      <strong><SumText en="Free challenge · 0 credits at stake" zh="免费对决 · 不押注积分"/></strong>
    </section>
    {status==="loading"?<p role="status">Checking account…</p>:
      status!=="authenticated"?<AuthInvitation
        title="Sign in to play a real Quiz"
        detail="Both people must sign in separately. No account is shared with the AI provider."/>:
      !pilotEnabled?<section className="ios-quiz-card" aria-label="Quiz activation status"
        data-testid="quiz-pilot-disabled" role="status">
        <h2>{runtimeError?translated(language,"Quiz configuration is unavailable","暂时无法读取 Quiz 配置"):
          runtime?"Free Quiz pilot is not active here":"Checking secure Quiz configuration…"}</h2>
        {runtimeError&&<>
          <p role="alert">{runtimeError}</p>
          <button type="button" className="ios-secondary-button"
            onClick={()=>setRuntimeRetry(value=>value+1)}>
            <SumText en="Retry Quiz configuration" zh="重新读取 Quiz 配置"/>
          </button>
        </>}
        <p>Creating or joining Quizzes requires a separately migrated, explicitly
          enabled test environment. No account, answer or credit will be changed.</p>
      </section>:
      !id?<section className="ios-quiz-card" data-testid="quiz-create-form">
        <h2><SumText en="1. Describe your Quiz" zh="1. 描述你的 Quiz"/></h2>
        <QuizVoiceInput value={description} disabled={working}
          onChange={updateDescription}
          onResult={v=>setVoiceNotice(v.usedFallback?
            "Browser transcription was used; confirm every word before creating.":
            "Audio was transcribed. Please review the text and rules.")}/>
        <label className="ios-quiz-label">Voice transcript / editable instructions
          <textarea rows={3} value={description} maxLength={300}
            data-testid="quiz-voice-transcript" disabled={working}
            placeholder="Challenge a friend to a science quiz / 跟朋友比三道数学题"
            onChange={e=>updateDescription(e.target.value)}/>
        </label>
        {voiceNotice&&<p role="status" className="ios-quiz-hint">{voiceNotice}</p>}
        <label className="ios-quiz-label">Question category
          <select value={topic} disabled={working} onChange={e=>{
            setTopic(e.target.value as Topic);topicWasChosen.current=true;requestKey.current=null;
          }} aria-label="Quiz topic">
            {TOPICS.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="ios-quiz-label">Invite a username (optional)
          <input value={opponent} maxLength={48} disabled={working}
            placeholder="Leave blank to invite with a link"
            onChange={e=>{setOpponent(e.target.value);requestKey.current=null;}}/>
        </label>
        <div className="ios-quiz-rules">
          <strong><SumText en="2. Verify the match rules" zh="2. 核对比赛规则"/></strong>
          <p>Three multiple-choice questions · 15 minutes once joined · one
          final answer per person · no edits · a tie stays a draw. Missing
          answers at timeout produce no winner. Answers are checked by a fixed
          bank, not guessed by AI.</p>
          <p>Staking real money or purchased credits is disabled in this pilot.
            The game gives no redeemable financial prize.</p>
        </div>
        <button data-testid="quiz-create-submit" type="button" className="ios-primary"
          disabled={working} onClick={()=>void create()}>
          {working?"Creating…":"Confirm and create free Quiz"}
        </button>
      </section>:
      <section className="ios-quiz-card" data-testid="quiz-duel-room">
        {loading&&!quiz?<p role="status">Loading Quiz invitation…</p>:
          quiz?<div className="ios-quiz-room">
            <div className="ios-quiz-heading">
              <span className="ios-overline">{quiz.status.toUpperCase()} · {quiz.topic}</span>
              <h2>{quiz.title}</h2>
              <p>Creator: {quiz.creatorUsername}
                {quiz.opponentUsername?" · Opponent: "+quiz.opponentUsername:" · Opponent pending"}</p>
            </div>
            <div className="ios-quiz-rules">
              <p><strong>Cost: 0 credits.</strong> No payment, lottery, prize or
                purchased-credit settlement is involved.</p>
              <small>Question commitment: <code>{quiz.answerCommitment.slice(0,14)}…</code></small>
            </div>
            {quiz.status==="open"&&<>
              <h3>1. Invite a friend</h3>
              <p>Share this URL. The other person needs their own account,
                accepts the Quiz, then both receive the same three questions.</p>
              <button type="button" className="ios-secondary-button"
                onClick={()=>void share()} data-testid="quiz-share-invite">
                {copied?"Invitation shared or copied":"Share invitation link"}
              </button>
              {quiz.isCreator&&<button type="button" className="ios-secondary-button"
                data-testid="quiz-cancel-invite" disabled={working}
                onClick={()=>void postAction("/cancel")}>
                Cancel unaccepted invitation · 0 credit refund needed
              </button>}
              {quiz.canJoin?<button className="ios-primary" type="button"
                data-testid="quiz-accept-invite" disabled={working}
                onClick={()=>void postAction("/accept")}>
                {working?"Joining…":"Accept free Quiz · 0 credits"}
              </button>:
              <p className="ios-quiz-hint">Waiting for the invited player to accept.</p>}
            </>}
            {quiz.status==="cancelled"&&<div role="status"
              data-testid="quiz-cancelled">
              This free Quiz invitation was canceled before the other player joined.
              No credits were reserved or transferred.
              <IosAction href="/app/quiz" secondary>Create a new Quiz</IosAction>
            </div>}
            {quiz.status==="live"&&<>
              <h3>2. Answer the same three questions</h3>
              <p role="status" className="ios-quiz-timer">
                {expired?"The answer deadline has passed.":
                  "Time remaining: "+Math.floor(remain/60)+"m "+(remain%60)+"s"}
              </p>
              {quiz.accepted&&quiz.questions?
                quiz.ownSubmitted?<div className="ios-quiz-rules" role="status">
                  Your answer receipt is sealed. Waiting for the opponent or
                  deadline. Scores and correct answers remain private until completion.
                </div>:
                <div className="ios-quiz-questions">
                  {quiz.questions.map((q,i)=><fieldset key={q.id}
                    className="ios-quiz-question">
                    <legend>Question {i+1}: {q.prompt}</legend>
                    {q.choices.map((choice,j)=><label key={j}
                      className={"ios-quiz-choice"+(choices[i]===j?" is-selected":"")}>
                      <input type="radio" name={"quiz-question-"+i}
                        checked={choices[i]===j} disabled={working||expired}
                        onChange={()=>{
                          setChoices(prev=>prev.map((n,k)=>i===k?j:n));
                        }}/>
                      <span>{choice}</span>
                    </label>)}
                  </fieldset>)}
                  <button className="ios-primary" type="button"
                    data-testid="quiz-submit-answers" disabled={!canSubmit}
                    onClick={()=>void postAction("/answer",{answers:choices})}>
                    {working?"Saving…":"Submit answers permanently"}
                  </button>
                  <p className="ios-quiz-hint">You cannot change answers after
                    submitting. The server—not the device—checks the result.</p>
                </div>:<p>This Quiz is available only to accepted competitors.</p>}
              {expired&&<button type="button" className="ios-secondary-button"
                disabled={working} data-testid="quiz-finalize-expired"
                onClick={()=>void postAction("/finalize")}>
                Complete expired Quiz · no prize
              </button>}
            </>}
            {quiz.status==="completed"&&result&&<>
              <h3>3. Final, server-recorded verdict</h3>
              <div className="ios-quiz-result" role="status"
                data-testid="quiz-final-verdict">
                <strong>{result.outcome==="tie"?"Draw · equal verified scores":
                  result.outcome==="void_timeout"?"Timed out · no winner":
                  result.winnerId===quiz.playerUserId?"You won on correct answers":
                  "Other player won on correct answers"}</strong>
                {result.scores.map(s=><p key={s.userId}>
                  {s.userId===quiz.playerUserId?"You":"Other player"}:
                  {" "+(s.score===null?"Not submitted":s.score+" / 3 correct")}
                </p>)}
              </div>
              <div className="ios-quiz-rules">
                <strong>Answer-key verification</strong>
                <p>Committed under {result.bankVersion}; answer key is now
                  revealed only after finalization.</p>
                {result.correctAnswers.map((a,i)=>{
                  const q=quiz.questions?.find(q=>q.id===a.id);
                  return <p key={a.id}>Q{i+1}: {q?.choices[a.answer]??"Server answer"}
                  </p>;
                })}
                <details className="ios-quiz-receipt" data-testid="quiz-verified-answer-receipt">
                  <summary>Recalculate the result · sealed answer receipts</summary>
                  {result.scores.map(s=><div key={s.userId}>
                    <strong>{s.userId===quiz.playerUserId?"Your choices":"Other player's choices"}</strong>
                    <p>{s.answers?s.answers.map((answer,i)=>
                      "Q"+(i+1)+": option "+(answer+1)).join(" · "):"No submitted answers"}</p>
                    <code>{s.answerHash??"No answer hash"}</code>
                  </div>)}
                  <p>Final Quiz resolution SHA-256:</p>
                  <code>{quiz.resolutionHash??"Not available"}</code>
                </details>
                <small>No credits were transferred. Receipt version: {result.version}.
                  Recompute each score using these answer indices and the
                  revealed correct answers. The final hash identifies the
                  exact server-recorded outcome.</small>
              </div>
              <IosAction href="/app/quiz" secondary>Start another free Quiz</IosAction>
            </>}
            <button type="button" className="ios-secondary-button"
              onClick={()=>{window.location.reload();}} disabled={working}>
              Refresh server receipt
            </button>
          </div>:<p>Quiz unavailable.</p>}
      </section>}
    {!id&&status==="authenticated"&&pilotEnabled&&
      <QuizMatchHistoryPanel enabled userId={session?.user?.id??null}/>}
    {error&&<p className="ios-message ios-message--error" role="alert">{error}</p>}
    {status==="authenticated"&&<section className="ios-quiz-runtime"
      aria-label="AI provider routing">
      <strong>How this Quiz uses AI</strong>
      <p>Speech: {runtime?
        runtime.speech.configured
          ?"Server transcription via "+runtime.speech.providerId+" API"
          :"Browser speech preview, manual confirmation required"
        :"Checking configured voice provider…"}</p>
      <p>Chat / other Quests: {runtime?
        runtime.text.configured
          ?runtime.text.providerId+" server API"
          :"Local rules fallback; an AI provider is not currently configured"
        :"Checking configured text provider…"}</p>
      <p>Quiz winner: fixed server answer key; no GPT grading call.</p>
      <small>ChatGPT personal subscriptions are not shared with participants.
        Provider API credentials remain on the server.</small>
    </section>}
    <p className="ios-footer-note">Preview release: objective free challenges only.
      Paid wagers require separate security, anti-cheat, legal and settlement reviews.
      Your personal ChatGPT subscription is never shared with other players.</p>
  </IosFrame>;
}
