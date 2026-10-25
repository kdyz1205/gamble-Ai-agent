"use client";

import {useState} from "react";
import {useSession} from "next-auth/react";
import PactComposer from "@/components/summons/PactComposer";
import {questSeeds} from "@/components/universe/quest-seeds";
import * as api from "@/lib/api-client";
import {IosAction,IosArt,IosEmpty,IosFrame,IosIcon,visuals} from "./IOSAppUI";
import {useQuest} from "./IOSAppData";
import {AuthInvitation} from "./IOSPersonalScreens";
import IOSQuestJudgment from "./IOSQuestJudgment";
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
      <div><span className="ios-overline">PICO / RULE BUILDER</span><h1>New Quest</h1>
        <p>Describe a challenge. Review its rules before you invite anyone.</p></div>
    </section>
    <div className="ios-filters" aria-label="Starting categories">
      {questSeeds.map(q=><button key={q.id} type="button" aria-pressed={chosen===q.id}
        className={"ios-chip"+(chosen===q.id?" is-selected":"")}
        onClick={()=>choose(q.id)}>{q.label}</button>)}
    </div>
    <section className="ios-composer" data-testid="ios-real-quest-composer">
      <PactComposer key={prompt} initialPrompt={prompt} appMode/>
    </section>
    <IosAction href="/app/quiz" secondary>Or start a voice Quiz</IosAction>
    <p className="ios-footer-note">Publishing and any credit use require the existing confirmed Quest workflow. Pico does not publish on your behalf.</p>
  </IosFrame>;
}

function QuestStatus({status}: {status:string}) {
  return <span className={"ios-status ios-status--"+status.replace(/[^a-z]/g,"")}>{status.replace(/_/g," ")}</span>;
}

function QuestMissing({loading,error}: {loading:boolean;error:string;id?:string}) {
  return loading ? <p role="status" className="ios-message">Loading the real Quest…</p>
    : <IosEmpty heading={error?"We could not open this Quest.":"Choose an actual Quest."}
      description={error||"A Quest must exist before a receipt, result or evidence record can appear."}
      action="Browse Quests" href="/app/discover"/>;
}

export function QuestDetailScreen({id}: {id?:string}) {
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
        <p className="ios-overline">THE QUEST</p><h1>{quest.title}</h1>
        {quest.description&&<p>{quest.description}</p>}
        {quest.proposition&&quest.proposition!==quest.title&&<p>{quest.proposition}</p>}
      </section>
      <div className="ios-quest-stats">
        <div><IosIcon name="people" size={19}/><strong>{quest.participants.filter(p=>p.status==="accepted").length}/{quest.maxParticipants}</strong><span>Players</span></div>
        <div><IosIcon name="star" size={19}/><strong>{quest.stake>0?quest.stake+" cr":"Free"}</strong><span>Credits</span></div>
        <div><IosIcon name="camera" size={19}/><strong>{quest._count?.evidence??quest.evidence?.length??0}</strong><span>Evidence</span></div>
      </div>
      <section className="ios-quest-detail-card">
        <h2>Agreed Quest Details</h2>
        <div><span>Status</span><QuestStatus status={quest.status}/></div>
        <div><span>Deadline</span><strong>{quest.deadline?new Date(quest.deadline).toLocaleString():"Not specified"}</strong></div>
        <div><span>Proof type</span><strong>{quest.evidenceType.replace(/_/g," ")}</strong></div>
        {quest.rules&&<p>{quest.rules}</p>}
        <p className="ios-footer-note">Only the accepted rules and actual evidence can determine a Quest result.</p>
      </section>
      {quest.status==="open"&&<div className="ios-actions">
        {creator?<p className="ios-message">Waiting for another person to join your Quest.</p>:
          <IosAction href={"/app/join?id="+encodeURIComponent(quest.id)}>Review and join Quest</IosAction>}
        <button type="button" className="ios-secondary-button" onClick={()=>void share()}>{copied?"Shared or copied":"Share invitation"}</button>
      </div>}
      {quest.arbiter==="quiz-curated-mcq-v1"
        ? <IOSQuestJudgment quest={quest} userId={me} onUpdated={refresh}/>
        : <>
          {quest.status==="live"&&<IosAction href={"/app/evidence-add?id="+encodeURIComponent(quest.id)}>
            {quest.evidence?.some(row=>row.userId===me) ? "View proof status" : "Submit your proof"}
          </IosAction>}
          {quest.status==="settled"&&<IosAction href={"/app/quest-complete?id="+encodeURIComponent(quest.id)}>View real result</IosAction>}
          {["judging","pending_settlement","disputed"].includes(quest.status)&&
            <IOSQuestJudgment quest={quest} userId={me} onUpdated={refresh}/>}
        </>}
      <button type="button" className="ios-text-action ios-refresh" onClick={refresh}>Refresh Quest status</button>
    </>}
  </IosFrame>;
}

export function EvidenceAddScreen({id}:{id?:string}) {
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
    }catch(e){setSubmitError(e instanceof Error?e.message:"Evidence was not saved.");}
    finally{setBusy(false);}
  };
  return <IosFrame title="Add Evidence" eyebrow="THE PROOF CHAPTER" back={id?"/app/quest?id="+encodeURIComponent(id):"/app/today"}>
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
    <>
      <section className="ios-app-proof-heading" aria-label="Proof submission">
        <span className="ios-app-proof-heading__icon"><IosIcon name="camera" size={23}/></span>
        <div><span className="ios-overline">REQUIRED PROOF / {quest.evidenceType.replace(/_/g," ")}</span>
          <h1>{quest.title}</h1>
        </div>
      </section>
      {quest.status!=="live"?<IosEmpty image={visuals.mascot} heading="Proof is not open yet."
        description={"Quest status: "+quest.status+". Evidence may only be changed while a Quest is live."} action="View Quest" href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      !accepted?<AuthInvitation title="Only accepted players can submit proof." detail="Sign in with the account participating in this Quest."/>:
      success||alreadySubmitted?<IosEmpty image={visuals.mascotHappy} heading="Your proof was saved."
        description="Your real proof submission is recorded. The referee cannot judge until every required player has submitted." action="View Quest" href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      <>
        <section className="ios-proof-form">
          <h2>What happened?</h2><p>Describe the real attempt and keep the agreed proof requirements in mind.</p>
          {textAllowed?<><label htmlFor="ios-proof-note">Your written evidence</label>
            <textarea id="ios-proof-note" value={note} onChange={e=>setNote(e.target.value)}
              placeholder="What did you do? What can the other player verify?"/>
            {submitError&&<p role="alert" className="ios-message ios-message--error">{submitError}</p>}
            <button className="ios-primary" type="button" disabled={!note.trim()||busy} onClick={()=>void save()}>
              {busy?"Submitting…":"Save written evidence"}
            </button></>:
            ["photo","video"].includes(policy) ?
              <div className="ios-app-media-proof" data-testid="ios-app-media-uploader">
                <p className="ios-message">Attach your own matching recording or photo. The upload service enforces file policy and participant access; review still depends on the actual accepted Quest rules.</p>
                <EvidenceUploader
                  challengeId={quest.id}
                  evidenceType={quest.evidenceType}
                  onSubmitted={() => setSuccess(true)}
                />
              </div> :
              <IosAction href={"/challenge/"+encodeURIComponent(quest.id)+"/versus"}>
                Open policy-specific proof capture
              </IosAction>}
        </section>
      </>}
    </>}
  </IosFrame>;
}

export function QuestCompleteScreen({id}:{id?:string}) {
  const {quest,loading,error}=useQuest(id);
  return <IosFrame title="Quest Result" eyebrow="THE STORY YOU MADE" back={id?"/app/quest?id="+encodeURIComponent(id):"/app/today"} tone="ios-result-screen">
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
      quest.status!=="settled" ? <IosEmpty image={visuals.portal} heading="The result isn't final."
        description={"This Quest is currently "+quest.status.replace(/_/g," ")+". Your real receipt will appear only after the required confirmation and settlement."}
        action="View Quest status" href={"/app/quest?id="+encodeURIComponent(quest.id)}/>:
      <>
        <div className="ios-complete-hero"><IosArt src={visuals.mascotHappy} alt="Pico celebrating a completed Quest"/></div>
        <h1 className="ios-page-title ios-center">Quest Complete!</h1>
        <p className="ios-centered-description">This Quest has a recorded settled outcome.</p>
        <section className="ios-quest-detail-card"><h2>{quest.title}</h2>
          {quest.judgments?.[0] ? <>
            <div><span>Recorded result</span><strong>{quest.judgments[0].winner?.username||"No winner recorded"}</strong></div>
            <p>{quest.judgments[0].reasoning||"The result was recorded without a public explanation."}</p>
          </> : <p>No detailed judgment was returned with this record.</p>}
        </section>
        <IosAction href={"/app/quest?id="+encodeURIComponent(quest.id)}>View result receipt</IosAction>
        <IosAction href="/app/create" secondary>Create another Quest</IosAction>
      </>}
  </IosFrame>;
}

export function QuestCreatedScreen({id}:{id?:string}) {
  const {quest,loading,error}=useQuest(id);
  return <IosFrame title="New Quest" eyebrow="A NEW ADVENTURE" back="/app/today" tone="ios-result-screen">
    {!quest?<QuestMissing loading={loading} error={error} id={id}/>:
    <>
      <div className="ios-complete-hero"><IosArt src={visuals.mascotHappy} alt="Pico welcomes your new Quest"/></div>
      <h1 className="ios-page-title ios-center">{quest.status==="draft"||quest.status==="open"?"Quest created!":"Your Quest record"}</h1>
      <p className="ios-centered-description">{quest.title}</p>
      <IosAction href={"/app/quest?id="+encodeURIComponent(quest.id)}>View real Quest</IosAction>
      <IosAction href="/app/create" secondary>Create another</IosAction>
    </>}
  </IosFrame>;
}
