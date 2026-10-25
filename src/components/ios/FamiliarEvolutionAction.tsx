"use client";

import {useState} from "react";
import {
  nextFamiliarStage,requiredVerifiedXp,type EvolutionStage,
} from "@/lib/summons/evolution-rules";
import type {OwnedFamiliar} from "@/lib/summons/owned-inventory-contract";

type Pending={requestKey:string;toForm:EvolutionStage};
type Receipt={
  receiptId:string;instanceId:string;form:EvolutionStage;
  verifiedXp:number;rarityUnchanged:true;creditsTransferred:0;
};
export default function FamiliarEvolutionAction({
  item,verifiedXp,onEvolutionComplete,
}:{
  item:OwnedFamiliar;verifiedXp:number|null;
  onEvolutionComplete?:()=>void;
}){
  const [confirm,setConfirm]=useState(false);
  const [pending,setPending]=useState<Pending|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const stage=nextFamiliarStage(item.form);
  if(!stage)return <small>Ascended: final cosmetic evolution achieved.</small>;
  const required=requiredVerifiedXp(stage);
  const ready=verifiedXp!==null&&Number.isSafeInteger(verifiedXp)&&
    verifiedXp>=required;
  const onConfirm=async()=>{
    if(!ready||busy||!confirm||!stage)return;
    const request=pending??{requestKey:crypto.randomUUID(),toForm:stage};
    setPending(request);setBusy(true);setError("");
    try{
      const response=await fetch("/api/summons/evolve",{
        method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          instanceId:item.id,toForm:request.toForm,
          requestKey:request.requestKey,confirmEvolution:true,
        }),
      });
      const body=await response.json() as {receipt?:Receipt;error?:string};
      if(!response.ok||!body.receipt)
        throw Error(body.error||"The server could not verify evolution");
      if(body.receipt.instanceId!==item.id||
         body.receipt.form!==stage||!body.receipt.receiptId||
         body.receipt.rarityUnchanged!==true||
         body.receipt.creditsTransferred!==0)
        throw Error("Evolution response has inconsistent ownership data");
      setReceipt(body.receipt);setPending(null);setConfirm(false);
      onEvolutionComplete?.();
    }catch(err){
      setError(err instanceof Error?err.message:"Evolution receipt is unavailable");
    }finally{setBusy(false);}
  };
  return <div style={{display:"grid",gap:6}}>
    <small>
      Next form: <strong>{stage}</strong>. Requires {required} current verified
      profession XP; recorded {verifiedXp===null?"unknown":verifiedXp}.
    </small>
    {!ready?<small>Locked until the required Quest XP is audited.</small>:
      !confirm?<button type="button" onClick={()=>setConfirm(true)}
        disabled={busy} aria-label={"Review "+stage+" evolution for "+item.id}>
        Review free {stage} evolution
      </button>:
        <div role="group" aria-label="Confirm owned Familiar evolution">
          <small>Confirm changing this owned Familiar from {item.form} to {stage}.
            Its rarity, owner and credits will not change.
          </small>
          <button type="button" disabled={busy}
            onClick={()=>void onConfirm()}>
            {busy?"Verifying career XP...":pending?
              "Retry original evolution receipt":"Confirm evolution"}
          </button>
          {!pending?<button type="button" disabled={busy}
            onClick={()=>setConfirm(false)}>Cancel</button>:null}
        </div>}
    {error?<p role="alert">{error}. Retrying preserves the original request key.</p>:null}
    {receipt?<p role="status">Evolution confirmed: {receipt.form}. Receipt {receipt.receiptId};
      original rarity unchanged. Refreshing your owned collection.
    </p>:null}
  </div>;
}
