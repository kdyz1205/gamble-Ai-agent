"use client";

import { useState } from "react";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { Arrow, SummonSigil } from "./WorldUI";

export default function ChronicleReceipt() {
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);
  async function shareExample() {
    if (sharing) return;
    setSharing(true);
    const url = new URL("/judgment/demo", window.location.origin).toString();
    const text = "SUM / Quest Chronicle — illustrative example only. Three rallies, one shared quest. Not a verified result.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "SUM · Example Quest Chronicle", text, url });
        setMessage("Example shared.");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setMessage("Example link copied.");
      } else {
        setMessage("Sharing is unavailable in this browser. You can copy the page address.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") setMessage("Sharing canceled.");
      else setMessage("Could not share this example. You can copy the page address.");
    } finally { setSharing(false); }
  }
  return <section className="sw-chronicle-display" aria-label="Example quest chronicle"><article className="sw-chronicle-card"><header className="sw-chronicle-card__header"><span className="sw-small-label">SUM / QUEST CHRONICLE</span><span className="sw-example-label">EXAMPLE ONLY</span></header><div className="sw-chronicle-seal" aria-hidden="true"><SummonSigil /></div><div className="sw-chronicle-title"><span>A MOMENT, KEPT.</span><h2>Three rallies.<br />One shared quest.</h2><p>An illustrative entry in a Summoner&apos;s story.<br />Not a real adjudicated outcome.</p></div><div className="sw-chronicle-score"><div><strong>3</strong><small>Mira · example</small></div><span>sample<br />score</span><div><strong>2</strong><small>Ren · example</small></div></div><dl className="sw-chronicle-metadata"><div><dt>Quest</dt><dd>First to win three rallies</dd></div><div><dt>Proof format</dt><dd>Continuous recording</dd></div><div><dt>Record type</dt><dd>Design demonstration</dd></div></dl><section className="sw-chronicle-reason"><span>A RESULT NEEDS A REASON</span><p>In a live quest, this space explains which evidence supports the outcome, what both participants agreed to, and anything that still needs review.</p></section><div className="sw-chronicle-bottom"><PicoFamiliar mood="celebrate"/><span>YOUR QUEST. ITS PROOF. THE STORY THAT STAYS.</span></div></article><p className="sw-chronicle-disclaimer">No real participant evidence has been evaluated here.</p><button type="button" className="sw-button" onClick={() => void shareExample()} disabled={sharing}>{sharing ? "Sharing…" : "Share this example"}<Arrow /></button><span className="sw-share-status" role="status">{message}</span></section>;
}
