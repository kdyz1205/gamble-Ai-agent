"use client";

import {useState} from "react";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";
import {useSession} from "next-auth/react";
import PactComposer from "@/components/summons/PactComposer";
import {questSeeds} from "@/components/universe/quest-seeds";
import * as api from "@/lib/api-client";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,visuals} from "./IOSAppUI";
import {useQuest} from "./IOSAppData";
import {AuthInvitation} from "./IOSPersonalScreens";
import IOSQuestJudgment from "./IOSQuestJudgment";
import IOSQuestXpStatus from "./IOSQuestXpStatus";
import EvidenceUploader from "@/components/EvidenceUploader";

export function CreateScreen({seed}: {seed?:string}) {
  const [chosen,setChosen]=useState(seed==="craft"||seed==="grow"?seed:"move");
  const [prompt,setPrompt]=useState(()=>questSeeds.find(item=>item.id===seed)?.prompt ?? "");
  const choose=(id:string)=>{
    setChosen(id);
    const found=questSeeds.find(item=>item.id===id);
    if(found)setPrompt(found.prompt);
  };
  return <IosFrame title="Quest Forge" eyebrow="YOUR IDEA · PICO HELPS" back="/app/today">
    <section className="ios-forge-bar" aria-label="Quest creation">
      <IosArt src={visuals.mascotHappy} alt="Pico"/>
      <div><span className="ios-overline"><SumText en="PICO / RULE BUILDER" zh="PICO / 规则助手"/></span><h1><SumText en="New Quest" zh="创建 Quest"/></h1>
        <p><SumText en="Describe a challenge. Review its rules before you invite anyone." zh="描述你想发起的挑战。邀请朋友前请先核对规则。"/></p></div>
    </section>
    <div className="ios-filters" aria-label="Starting categories">
      {questSeeds.map(q=><button key={q.id} type="button" aria-pressed={chosen===q.id}
        className={"ios-chip"+(chosen===q.id?" is-selected":"")}
        onClick={()=>choose(q.id)}>{q.label}</button>)}
    </div>
    <section className="ios-composer" data-testid="ios-real-quest-composer">
      <PactComposer key={prompt} initialPrompt={prompt} appMode/>
    </section>
    <IosAction href="/app/quiz" secondary><SumText en="Or start a voice Quiz" zh="或开始双人语音 Quiz"/></IosAction>
    <p className="ios-footer-note"><SumText en="Publishing and any credit use require the existing confirmed Quest workflow. Pico does not publish on your behalf." zh="发布 Quest 或使用积分必须经过现有确认流程。Pico 不会替你发布挑战。"/></p>
  </IosFrame>;
}

const questStatusZh:Record<string,string>={
  draft:"草稿",open:"等待加入",live:"进行中",
  judging:"证据审核中",pending_settlement:"等待结算",
  settled:"已结算",cancelled:"已取消",
  disputed:"结果复核中",refunded:"已退款",
};
function QuestStatus({status}: {status:string}) {
  const language=useSumLanguage();
  const label=translated(language,status.replace(/_/g," "),questStatusZh[status]||status.replace(/_/g," "));
  return <span className={"ios-status ios-status--"+status.replace(/[^a-z]/g,"")}>{label}</span>;
}

function QuestMissing({loading,error}: {loading:boolean;error:string;id?:string}) {
  const language=useSumLanguage();
  return loading ? <p role="status" className="ios-message"><SumText en="Loading the real Quest…" zh="正在读取真实 Quest…"/></p>
    : <IosEmpty heading={error?translated(language,"We could not open this Quest.","无法打开该 Quest。"):translated(language,"Choose an actual Quest.","请选择一个真实 Quest。")}
      description={error||translated(language,"A Quest must exist before a receipt, result or evidence record can appear.","Quest 必须真实存在，才能显示对应的证据、结果或记录。")}
      action={translated(language,"Browse Quests","浏览 Quest")} href="/app/discover"/>;
}

export function QuestDetailScreen({id}: {id?:string}) {
  const language=useSumLanguage();
  const {quest,loading,error,refresh}=useQuest(id);
  const {data:session}=useSession();
  const [copied,setCopied]=useState(false);
  const me=session?.user?.id;
  const creator=Boolean(me&&quest?.creatorId===me);
  const share=async()=>{
    if(!quest)return;
    const url=window.location.origin+"/app/join?id="+encodeURIComponent(quest.id);
    try{
      if(navigator.share) await navigator.share({title:quest.title,url});
      else await navigator.clipboard.writeText(url);
      setCopied(true);
    }catch {setCopied(false);}
  };
  return <IosFrame title="Quest Detail" eyebrow="YOUR REAL ADVENTURE" back="/app/today">
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
    <>
      <div className="ios-quest-hero">
        <IosArt src={visuals.portal} alt="A glowing gateway to your next Quest"/>
        <QuestStatus status={quest.status}/>
      </div>
      <section className="ios-quest-description">
        <p className="ios-overline"><SumText en="THE QUEST" zh="当前 Quest"/></p><h1>{quest.title}</h1>
        {quest.description&&<p>{quest.description}</p>}
        {quest.proposition&&quest.proposition!==quest.title&&<p>{quest.proposition}</p>}
      </section>
      <div className="ios-quest-stats">
        <div><IosIcon name="people" size={19}/><strong>{quest.participants.filter(p=>p.status==="accepted").length}/{quest.maxParticipants}</strong><span><SumText en="Players" zh="玩家"/></span></div>
        <div><IosIcon name="star" size={19}/><strong>{quest.stake>0?quest.stake+" cr":translated(language,"Free","免费")}</strong><span><SumText en="Credits" zh="积分"/></span></div>
        <div><IosIcon name="camera" size={19}/><strong>{quest._count?.evidence??quest.evidence?.length??0}</strong><span><SumText en="Evidence" zh="证据"/></span></div>
      </div>
      <section className="ios-quest-detail-card">
        <h2><SumText en="Agreed Quest Details" zh="已确认的 Quest 规则"/></h2>
        <div><span><SumText en="Status" zh="状态"/></span><QuestStatus status={quest.status}/></div>
        <div><span><SumText en="Deadline" zh="截止时间"/></span><strong>{quest.deadline?new Date(quest.deadline).toLocaleString(language==="zh"?"zh-CN":"en-US"):translated(language,"Not specified","未指定")}</strong></div>
        <div><span><SumText en="Proof type" zh="证据形式"/></span><strong>{quest.evidenceType.replace(/_/g," ")}</strong></div>
        {quest.rules&&<p>{quest.rules}</p>}
        <p className="ios-footer-note"><SumText en="Only the accepted rules and actual evidence can determine a Quest result." zh="Quest 结果只能依据双方接受的规则与真实证据确定。"/></p>
      </section>
      {quest.status==="open"&&<div className="ios-actions">
        {creator?<p className="ios-message"><SumText en="Waiting for another person to join your Quest." zh="正在等待另一位玩家加入 Quest。"/></p>:
          <IosAction href={"/app/join?id="+encodeURIComponent(quest.id)}><SumText en="Review and join Quest" zh="查看规则并加入 Quest"/></IosAction>}
        <button type="button" className="ios-secondary-button" onClick={()=>void share()}>{copied?translated(language,"Shared or copied","已分享或复制"):translated(language,"Share invitation","分享邀请")}</button>
      </div>}
      {quest.arbiter==="quiz-curated-mcq-v1"
        ? <IOSQuestJudgment quest={quest} userId={me} onUpdated={refresh}/>
        : <>
          {quest.status==="live"&&<IosAction href={"/app/evidence-add?id="+encodeURIComponent(quest.id)}>
            {quest.evidence?.some(row=>row.userId===me) ? translated(language,"View proof status","查看证据状态") : translated(language,"Submit your proof","提交证据")}
          </IosAction>}
          {quest.status==="settled"&&<IosAction href={"/app/quest-complete?id="+encodeURIComponent(quest.id)}><SumText en="View real result" zh="查看真实结果"/></IosAction>}
          {["judging","pending_settlement","disputed"].includes(quest.status)&&
            <IOSQuestJudgment quest={quest} userId={me} onUpdated={refresh}/>}
        </>}
      <button type="button" className="ios-text-action ios-refresh" onClick={refresh}><SumText en="Refresh Quest status" zh="刷新 Quest 状态"/></button>
    </>}
  </IosFrame>;
}

export function EvidenceAddScreen({id}:{id?:string}) {
  const language=useSumLanguage();
  const {quest,loading,error}=useQuest(id);
  const {data:session}=useSession();
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [submitError,setSubmitError]=useState("");
  const [success,setSuccess]=useState(false);
  const accepted=Boolean(quest&&session?.user?.id&&quest.participants.some(
    p=>p.user.id===session.user.id&&p.status==="accepted"
  ));
  const policy=(quest?.evidenceType||"").toLowerCase();
  const textAllowed=policy==="text"||policy==="self_report";
  const alreadySubmitted=Boolean(quest?.evidence?.some(p=>p.userId===session?.user?.id));
  const save=async()=>{
    if(!quest||!accepted||!textAllowed||!note.trim()||busy)return;
    setBusy(true);setSubmitError("");
    try{
      await api.submitEvidence(quest.id,{type:"text",description:note.trim()});
      setSuccess(true);
    }catch(e){setSubmitError(e instanceof Error?e.message:translated(language,"Evidence was not saved.","证据未保存成功。"));}
    finally{setBusy(false);}
  };
  return <IosFrame title="Add Evidence" eyebrow="THE PROOF CHAPTER" back={id?"/app/quest?id="+encodeURIComponent(id):"/app/today"}>
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
    <>
      <section className="ios-app-proof-heading" aria-label="Proof submission">
        <span className="ios-app-proof-heading__icon"><IosIcon name="camera" size={23}/></span>
        <div><span className="ios-overline"><SumText en="REQUIRED PROOF" zh="所需证据"/> / {quest.evidenceType.replace(/_/g," ")}</span>
          <h1>{quest.title}</h1>
        </div>
      </section>
      {quest.status!=="live"?<IosEmpty image={visuals.mascot} heading={translated(language,"Proof is not open yet.","暂时无法提交证据。")}
        description={translated(language,"Quest status: ","Quest 状态：")+quest.status+translated(language,". Evidence may only be changed while a Quest is live.","。只有 Quest 进行中才能修改证据。")} action={translated(language,"View Quest","查看 Quest")} href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      !accepted?<AuthInvitation title={translated(language,"Only accepted players can submit proof.","只有正式加入的玩家才能提交证据。")} detail={translated(language,"Sign in with the account participating in this Quest.","请使用参与该 Quest 的账号登录。")}/>:
      success||alreadySubmitted?<IosEmpty image={visuals.mascotHappy} heading={translated(language,"Your proof was saved.","你的证据已保存。")}
        description={translated(language,"Your real proof submission is recorded. The referee cannot judge until every required player has submitted.","证据已真实记录。所有必要玩家提交证据后，才能进入裁判审核。")} action={translated(language,"View Quest","查看 Quest")} href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      <>
        <section className="ios-proof-form">
          <h2><SumText en="What happened?" zh="发生了什么？"/></h2><p><SumText en="Describe the real attempt and keep the agreed proof requirements in mind." zh="请如实描述这次行动，并遵守双方事先确认的证据要求。"/></p>
          {textAllowed?<><label htmlFor="ios-proof-note"><SumText en="Your written evidence" zh="书面证据"/></label>
            <textarea id="ios-proof-note" value={note} onChange={e=>setNote(e.target.value)}
              placeholder="What did you do? What can the other player verify?"/>
            {submitError&&<p role="alert" className="ios-message ios-message--error">{submitError}</p>}
            <button className="ios-primary" type="button" disabled={!note.trim()||busy} onClick={()=>void save()}>
              {busy?translated(language,"Submitting…","正在提交…"):translated(language,"Save written evidence","保存书面证据")}
            </button></>:
            ["photo","video"].includes(policy) ?
              <div className="ios-app-media-proof" data-testid="ios-app-media-uploader">
                <p className="ios-message"><SumText en="Attach your own matching recording or photo. The upload service enforces file policy and participant access; review still depends on the actual accepted Quest rules." zh="请上传属于自己的、符合规则的视频或照片。上传服务会核查文件规则和参与权限；审核仍然依据双方认可的 Quest 规则。"/></p>
                <EvidenceUploader
                  challengeId={quest.id}
                  evidenceType={quest.evidenceType}
                  onSubmitted={() => setSuccess(true)}
                />
              </div> :
              <IosAction href={"/challenge/"+encodeURIComponent(quest.id)+"/versus"}>
                <SumText en="Open policy-specific proof capture" zh="打开规定的证据采集流程"/>
              </IosAction>}
        </section>
      </>}
    </>}
  </IosFrame>;
}

export function QuestCompleteScreen({id}:{id?:string}) {
  const language=useSumLanguage();
  const {quest,loading,error}=useQuest(id);
  return <IosFrame title="Quest Result" eyebrow="THE STORY YOU MADE" back={id?"/app/quest?id="+encodeURIComponent(id):"/app/today"} tone="ios-result-screen">
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
      quest.status!=="settled" ? <IosEmpty image={visuals.portal} heading={translated(language,"The result isn't final.","结果尚未最终确认。")}
        description={translated(language,"This Quest is currently ","当前 Quest 状态：")+quest.status.replace(/_/g," ")+translated(language,". Your real receipt will appear only after the required confirmation and settlement.","。完成必要确认及结算后才会显示真实的结果记录。")}
        action={translated(language,"View Quest status","查看 Quest 状态")} href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      <>
        <div className="ios-complete-hero"><IosArt src={visuals.mascotHappy} alt="Pico celebrating a completed Quest"/></div>
        <h1 className="ios-page-title ios-center"><SumText en="Quest Complete!" zh="Quest 已完成！"/></h1>
        <p className="ios-centered-description">This Quest has a recorded settled outcome.</p>
        <section className="ios-quest-detail-card"><h2>{quest.title}</h2>
          {quest.judgments?.[0] ? <>
            <div><span><SumText en="Recorded result" zh="已记录的结果"/></span><strong>{quest.judgments[0].winner?.username||translated(language,"No winner recorded","未记录胜者")}</strong></div>
            <p>{quest.judgments[0].reasoning||translated(language,"The result was recorded without a public explanation.","结果已记录，但没有公开说明。")}</p>
          </> : <p><SumText en="No detailed judgment was returned with this record." zh="该记录没有返回详细判定信息。"/></p>}
        </section>
        <IOSQuestXpStatus challengeId={quest.id}/>
        <IosAction href={"/app/quest?id="+encodeURIComponent(quest.id)}><SumText en="View result receipt" zh="查看结果记录"/></IosAction>
        <IosAction href="/app/picos" secondary><SumText en="Check Familiars & tickets" zh="查看召唤兽与召唤券"/></IosAction>
        <IosAction href="/app/create" secondary><SumText en="Create another Quest" zh="再创建一个 Quest"/></IosAction>
      </>}
  </IosFrame>;
}

export function QuestCreatedScreen({id}:{id?:string}) {
  const language=useSumLanguage();
  const {quest,loading,error}=useQuest(id);
  return <IosFrame title="New Quest" eyebrow="A NEW ADVENTURE" back="/app/today" tone="ios-result-screen">
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
    <>
      <div className="ios-complete-hero"><IosArt src={visuals.mascotHappy} alt="Pico welcomes your new Quest"/></div>
      <h1 className="ios-page-title ios-center">{quest.status==="draft"||quest.status==="open"?translated(language,"Quest created!","Quest 已创建！"):translated(language,"Your Quest record","你的 Quest 记录")}</h1>
      <p className="ios-centered-description">{quest.title}</p>
      <IosAction href={"/app/quest?id="+encodeURIComponent(quest.id)}><SumText en="View real Quest" zh="查看真实 Quest"/></IosAction>
      <IosAction href="/app/create" secondary><SumText en="Create another" zh="继续创建"/></IosAction>
    </>}
  </IosFrame>;
}
