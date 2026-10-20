import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { ArrowMark } from "@/components/world/EditorialMarks";

const exampleTerms = [
  ["The finish line", "First player to win three badminton rallies. Agree on the court boundaries and service order before starting."],
  ["What counts as proof", "One continuous video showing both players, the court and every rally. Each player may add their own record."],
  ["The deadline", "Upload proof within 24 hours after both players accept. The live quest shows its exact deadline before acceptance."],
  ["When it is not clear", "An unclear rally is left unresolved for review. No guessed points, hidden rule changes or automatic claims of victory."],
] as const;

export default function ContractStage() {
  return (
    <section className="ed-page" data-testid="contract-stage">
      <header className="ed-page-header"><div><p className="ed-eyebrow">02 / THE HANDSHAKE</p><h1>Good rivals.<br /><em>Same rules.</em></h1></div><p>The best competition starts with an agreement.<br />Everyone sees the same quest before deciding to join.</p></header>
      <div className="ed-agreement">
        <article className="ed-agreement-paper" aria-labelledby="agreement-title">
          <div className="ed-paper-heading"><div><p className="ed-eyebrow">SUMMONER.WORLD / SHARED TERMS</p><span className="ed-example-tag" style={{marginTop:10}}>ILLUSTRATIVE AGREEMENT</span></div><PicoFamiliar mood="referee" /></div>
          <h2 id="agreement-title">Three rallies.<br />One friendly rivalry.</h2>
          <div className="ed-people-line"><div className="ed-person"><span>M</span><div>Mira<small style={{display:"block",fontWeight:500,marginTop:3}}>Quest creator</small></div></div><span className="ed-versus">vs.</span><div className="ed-person"><span>R</span><div>Ren<small style={{display:"block",fontWeight:500,marginTop:3}}>Invited friend</small></div></div></div>
          <dl className="ed-terms-list">{exampleTerms.map(([label, text], i) => <div key={label}><span>0{i+1}</span><div><dt>{label}</dt><dd>{text}</dd></div></div>)}</dl>
          <div className="ed-paper-bottom"><p>This is a sample, not a live agreement. No invitation is accepted or credits committed on this page.</p><Link className="ed-button ed-button--ink" href="/summons">Make your own quest <ArrowMark /></Link></div>
        </article>
        <aside className="ed-explainer"><p className="ed-eyebrow">BEFORE ANYONE SAYS “I&apos;M IN”</p><h2>A handshake,<br />not a guessing game.</h2><ol><li>Know who&apos;s playing.<small>Both participants and their roles are visible.</small></li><li>Agree on the finish line.<small>A measurable goal. A shared deadline. The same proof requirements.</small></li><li>See the terms first.<small>Any internal credits and consent requirements appear in the actual quest.</small></li><li>Leave room for review.<small>Uncertain evidence is not a reason to invent an outcome.</small></li></ol><p className="ed-note">Pico can help clarify the wording. Only the participants can accept the agreement.</p></aside>
      </div>
    </section>
  );
}
