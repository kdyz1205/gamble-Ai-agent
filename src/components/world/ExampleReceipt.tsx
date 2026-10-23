"use client";
import { useState } from "react";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { ArrowMark } from "@/components/world/EditorialMarks";

export default function ExampleReceipt() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const shareExample = async () => {
    setBusy(true);
    const url = new URL("/judgment/demo", window.location.origin).href;
    const text = "Summoner.world — illustrative example receipt, not a real challenge result.\n" + url;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Summoner.world — example receipt", text, url });
        setStatus("Example shared.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setStatus("Example link copied.");
      } else {
        setStatus("Copy the page address to share this example.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setStatus("");
      else setStatus("Could not share. You can copy the page address instead.");
    } finally { setBusy(false); }
  };
  return <div className="ed-ticket-wrap"><article className="ed-ticket" data-testid="editorial-example-receipt"><header className="ed-ticket-header"><PicoFamiliar mood="celebrate" /><p>SUMMONER.WORLD / EXAMPLE RECEIPT</p></header><h2>Three rallies.<br />One good story.</h2><div className="ed-ticket__winner"><small>ILLUSTRATIVE WINNER</small><strong>Mira</strong><p>Mira 3 &nbsp;—&nbsp; Ren 2</p></div><dl><div><dt>CHALLENGE</dt><dd>First to 3 rallies</dd></div><div><dt>PROOF FORMAT</dt><dd>Continuous video</dd></div><div><dt>RECORD TYPE</dt><dd>Design example</dd></div></dl><div className="ed-ticket__reason"><strong>A RESULT NEEDS A REASON</strong><p>In a live quest, this space explains which evidence supports the outcome. Unclear rallies stay unresolved for review.</p></div><div className="ed-ticket__barcode" aria-hidden="true" /><p className="ed-ticket__foot">EXAMPLE ONLY · NOT A VERIFIED RESULT</p></article><p className="ed-note">No real participant evidence has been evaluated here.</p><button type="button" className="ed-button ed-button--ink" disabled={busy} onClick={() => void shareExample()}>{busy ? "Opening share…" : "Share this example"}<ArrowMark /></button><span className="ed-copy-status" role="status" aria-live="polite">{status}</span></div>;
}
