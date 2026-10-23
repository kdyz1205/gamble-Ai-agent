"use client";

import { useState } from "react";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestArtifact from "@/components/experience/QuestArtifact";
import { Arrow } from "./WorldUI";

export default function ChronicleReceipt() {
  const [message,setMessage]=useState("");
  const [sharing,setSharing]=useState(false);
  async function shareExample(){
    if(sharing)return;
    setSharing(true);
    const url=new URL("/judgment/demo",window.location.origin).toString();
    const text="SUM / Quest Chronicle — illustrative example only. Three rallies, one shared quest. Not a verified result.";
    try{
      if(navigator.share){
        await navigator.share({title:"SUM · Example Quest Chronicle",text,url});
        setMessage("Example shared.");
      }else if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text+"\n"+url);
        setMessage("Example link copied.");
      }else{
        setMessage("Sharing is unavailable in this browser. You can copy the page address.");
      }
    }catch(error){
      if(error instanceof Error&&error.name==="AbortError")setMessage("Sharing canceled.");
      else setMessage("Could not share this example. You can copy the page address.");
    }finally{setSharing(false);}
  }
  return <section className="sw-chronicle-display sum-v4-chronicle" aria-label="Illustrative Quest Chronicle">
    <QuestArtifact
      stage="chronicle"
      id="EXAMPLE-001"
      title="Three rallies. One shared adventure."
      participants="Mira / Ren — illustrative participants"
      proof="Continuous match recording (example)"
      deadline="24-hour evidence window"
      objective="An example of how an agreed Quest can become a record worth keeping."
      sample
    >
      <div className="sum-v4-chronicle__outcome">
        <span>ILLUSTRATIVE SCORE / NOT A VERIFIED RESULT</span>
        <div><strong>MIRA <b>3</b></strong><i>:</i><strong><b>2</b> REN</strong></div>
        <p>In a live Quest, the Chronicle displays only an outcome actually determined from accepted rules and evidence.</p>
      </div>
      <div className="sum-v4-chronicle__reason">
        <PicoFamiliar mood="referee"/>
        <div><strong>Clarity is part of the story.</strong><p>Evidence, uncertainty, and the reason for a decision remain attached to a real record.</p></div>
      </div>
    </QuestArtifact>
    <p className="sw-chronicle-disclaimer">No real participant evidence has been evaluated here.</p>
    <button type="button" className="sw-button" onClick={()=>void shareExample()} disabled={sharing}>
      {sharing?"Sharing…":"Share this example"} <Arrow/>
    </button>
    <span role="status" className="sw-share-status">{message}</span>
  </section>;
}
