"use client";

import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {useSession} from "next-auth/react";
import {IosFrame,IosAction} from "./IOSAppUI";
import {AuthInvitation} from "./IOSPersonalScreens";
import {QuizVoiceInput} from "./QuizVoiceInput";

const TOPICS=[
  {id:"general",label:"General knowledge / 常识"},
  {id:"technology",label:"Software & AI / 技术"},
  {id:"science",label:"Science / 科学"},
  {id:"sports",label:"Sports / 体育"},
  {id:"math",label:"Mathematics / 数学"},
] as const;
type Topic=typeof TOPICS[number]["id"];
type PublicQuestion={id:string;prompt:string;choices:string[]};
type Score={userId:string;score:number|null;answerHash:string|null};
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
  expiresAt:string|null;answerCommitment:string;questions:PublicQuestion[]|null;
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
  const {status}=useSession();
  const router=useRouter();
  const [topic,setTopic]=useState<Topic>("general");
  const [description,setDescription]=useState("");
  const [opponent,setOpponent]=useState("");
  const [voiceNotice,setVoiceNotice]=useState("");
  const [runtime,setRuntime]=useState<AiCapabilities|null>(null);
  const [quiz,setQuiz]=useState<QuizView|null>(null);
  const [choices,setChoices]=useState<number[]>([-1,-1,-1]);
  const [now,setNow]=useState(0);
  const [loading,setLoading]=useState(Boolean(id));
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [copied,setCopied]=useState(false);
  const requestKey=useRef<string|null>(null);
  const topicWasChosen=useRef(false);

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
    void fetchJson<{capabilities:AiCapabilities}>("/api/ai/runtime")
      .then(result=>{if(active)setRuntime(result.capabilities);})
      .catch(()=>{if(active)setRuntime(null);});
    return()=>{active=false;};
  },[status]);
  useEffect(()=>{
    if(!id||status!=="authenticated")return;
    let active=true;
    const update=async()=>{
      try{
        const result=await fetchJson<{quiz:QuizView}>("/api/quiz/"+encodeURIComponent(id));
        if(active){setQuiz(result.quiz);setError("");}
      }catch(e){
        if(active)setError(e instanceof Error?e.message:"Quiz could not be loaded");
      }finally{if(active)setLoading(false);}
    };
    void update();
    const interval=setInterval(()=>{void update();},3000);
    return()=>{active=false;clearInterval(interval);};
  },[id,status]);

  const create=async()=>{
    if(working||status!=="authenticated")return;
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
      router.push("/app/quiz?id="+encodeURIComponent(result.challengeId));
    }catch(e){
      setError(e instanceof Error?e.message:"Quiz creation failed; you can retry safely");
    }finally{setWorking(false);}
  };
  const postAction=async(path:string,body?:unknown)=>{
    if(!id||working)return;
    setWorking(true);setError("");
    try{
      const result=await fetchJson<{quiz:QuizView}>(
        "/api/quiz/"+encodeURIComponent(id)+path,{
          ...mutation,body:body?JSON.stringify(body):undefined,
        });
      setQuiz(result.quiz);
    }catch(e){setError(e instanceof Error?e.message:"Quiz action failed");}
    finally{setWorking(false);}
  };
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
  const remain=secondsRemaining(quiz?.expiresAt||null,now);
  const canSubmit=Boolean(quiz?.status==="live"&&quiz.accepted&&
    !quiz.ownSubmitted&&!expired&&choices.length===3&&
    choices.every(x=>Number.isInteger(x)&&x>=0&&x<=3)&&!working);
  const result=quiz?.result;
  return <IosFrame title="Voice Quiz Duel" eyebrow="VERIFIED · FRIEND VS FRIEND"
    back="/app/today">
    <section className="ios-quiz-hero">
      <span className="ios-overline">SPEAK · INVITE · ANSWER · VERIFY</span>
      <h1>Challenge a friend to a Quiz</h1>
      <p>Everyone answers the same sealed questions. The server checks exact
        answers and publishes a verifiable receipt.</p>
      <strong>Free challenge · 0 credits at stake</strong>
    </section>
    {status==="loading"?<p role="status">Checking account…</p>:
      status!=="authenticated"?<AuthInvitation
        title="Sign in to play a real Quiz"
        detail="Both people must sign in separately. No account is shared with the AI provider."/>:
      !id?<section className="ios-quiz-card" data-testid="quiz-create-form">
        <h2>1. Describe your Quiz</h2>
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
          <select value={topic} onChange={e=>{
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
          <strong>2. Verify the match rules</strong>
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
                <small>No credits were transferred. Receipt version: {result.version}.
                  Final decision can be independently recalculated from the
                  question bank and sealed answer scores.</small>
              </div>
              <IosAction href="/app/quiz" secondary>Start another free Quiz</IosAction>
            </>}
            <button type="button" className="ios-secondary-button"
              onClick={()=>{window.location.reload();}} disabled={working}>
              Refresh server receipt
            </button>
          </div>:<p>Quiz unavailable.</p>}
      </section>}
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
