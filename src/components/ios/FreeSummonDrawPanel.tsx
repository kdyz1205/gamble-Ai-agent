"use client";

import {useEffect,useRef,useState} from "react";
import {PROFESSIONS,RARITY_ODDS} from "@/lib/summons/profession-system";
import type {AccountFreeTicketSummary} from "@/lib/summons/ticket-read-contract";

type DrawResponse={
  receiptId:string;instanceId:string;speciesId:string;rarity:string;
  professionId:string;occupationId:string;ordinal:number;reused:boolean;
  pityKind:string;rareMissesAfter:number;epicMissesAfter:number;
  effectiveWeights:Array<{id:string;weight:number}>;
  creditsTransferred:0;
};
type RequestDetails={professionId:string;occupationId:string;requestKey:string};

export default function FreeSummonDrawPanel({
  tickets,enabled,onDrawComplete,
}:{
  tickets:AccountFreeTicketSummary|null;enabled:boolean;
  onDrawComplete:()=>void;
}){
  const mounted=useRef(true);
  const committing=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [career,setCareer]=useState("");
  const [occupation,setOccupation]=useState("");
  const [confirm,setConfirm]=useState(false);
  const [busy,setBusy]=useState(false);
  const [request,setRequest]=useState<RequestDetails|null>(null);
  const [error,setError]=useState("");
  const [result,setResult]=useState<DrawResponse|null>(null);
  const available=tickets?.byProfession.filter(t=>t.available>0)??[];
  const chosen=available.some(t=>t.professionId===career)?career:
    available[0]?.professionId??"";
  const profession=PROFESSIONS.find(p=>p.id===chosen);
  const specialization=profession?.specialties.find(p=>p.id===occupation)?.id??
    profession?.specialties[0]?.id??"";

  const commit=async()=>{
    if(!chosen||!specialization||committing.current||!confirm)return;
    committing.current=true;
    const stable=request??{
      professionId:chosen,occupationId:specialization,
      requestKey:crypto.randomUUID(),
    };
    setRequest(stable);setBusy(true);setError("");
    try{
      const response=await fetch("/api/summons/free-draw",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({...stable,confirmSpend:true}),
      });
      const body=await response.json() as {draw?:DrawResponse;error?:string};
      if(!response.ok||!body.draw){
        throw new Error(body.error||"Could not verify free draw receipt");
      }
      if(body.draw.creditsTransferred!==0||!body.draw.receiptId||
         !body.draw.instanceId||body.draw.professionId!==stable.professionId||
         body.draw.occupationId!==stable.occupationId)
        throw Error("Summon server receipt is incomplete");
      if(!mounted.current)return;
      setResult(body.draw);setConfirm(false);setRequest(null);
      onDrawComplete();
    }catch(err){
      // Uncertain network responses keep the SAME request key on retry.
      // We must never silently submit a second, spendable draw after a timeout.
      if(mounted.current)setError(err instanceof Error?err.message:"Summon receipt could not be verified");
    }finally{committing.current=false;if(mounted.current)setBusy(false);}
  };

  if(!tickets||!enabled)
    return <section className="ios-milestone" aria-label="Free Summon Drawing">
      <h2>Free Summon drawing</h2>
      <p>Ticket spending is not active on this server. Displayed models and rarity samples remain previews only.</p>
    </section>;
  return <section className="ios-milestone" aria-label="Free Summon Drawing">
    <span className="ios-overline">SERVER DRAW - OWNED INVENTORY</span>
    <h2>Summon a new Familiar</h2>
    <p>Only already-issued, free career tickets can be spent. One ticket creates one owned Summon.</p>
    <p>Base rarity odds (before pity): {RARITY_ODDS.map(x=>
      x.label+" "+(x.weight/100).toFixed(1)+"%").join(" | ")}.
    </p>
    <small>Rare+ guaranteed on the 20th consecutive miss; Epic+ on the 80th. Both guarantees apply across all your professions. The server stores the actual probabilities and result.</small>
    {result?<div role="status" aria-live="polite">
      <p><strong>Summoned: {result.speciesId}</strong> - {result.rarity}.</p>
      <p style={{overflowWrap:"anywhere"}}>Verified draw #{result.ordinal}, receipt {result.receiptId}. No credits transferred.</p>
      <p>Next pity counters: Rare {result.rareMissesAfter}/19, Epic {result.epicMissesAfter}/79.</p>
      <p>Actual draw weights: {result.effectiveWeights.map(x=>x.id+":"+x.weight).join(", ")}.</p>
    </div>:null}
    {available.length===0?<p>No available free career tickets. An earned milestone awaiting issuance cannot be spent.</p>:
      <div className="ios-summon-input">
        <label htmlFor="free-summon-career">Career pool</label>
        <select id="free-summon-career" value={chosen}
          disabled={busy||Boolean(request)}
          onChange={e=>{setCareer(e.target.value);setOccupation("");setConfirm(false);setResult(null);}}>
          {available.map(row=><option key={row.professionId} value={row.professionId}>
            {PROFESSIONS.find(p=>p.id===row.professionId)?.name??row.professionId} - {row.available} free
          </option>)}
        </select>
        <label htmlFor="free-summon-specialization">Specialization</label>
        <select id="free-summon-specialization" value={specialization}
          disabled={busy||Boolean(request)}
          onChange={e=>{setOccupation(e.target.value);setConfirm(false);setResult(null);}}>
          {profession?.specialties.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {!confirm?<button type="button" onClick={()=>setConfirm(true)}
          disabled={busy||!chosen||!specialization}>
          Review free ticket use
        </button>:
          <div role="group" aria-label="Confirm irreversible free ticket use">
            <p>Confirm using exactly ONE free {profession?.name} ticket. This cannot be undone.</p>
            <button type="button" disabled={busy} onClick={()=>void commit()}>
              {busy?"Checking secure draw...":request?"Retry same receipt safely":"Confirm and summon"}
            </button>
            {!request?<button type="button" disabled={busy} onClick={()=>setConfirm(false)}>Cancel</button>:null}
          </div>}
      </div>}
    {error?<p role="alert">{error}. Retry uses your original request ID, not a second ticket.</p>:null}
  </section>;
}
