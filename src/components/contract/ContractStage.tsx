import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestArtifact from "@/components/experience/QuestArtifact";
import {Arrow, PageIntro, QuestJourney, SummonSigil} from "@/components/universe/WorldUI";

const terms = [
  ["What counts as a win", "First player to win three rallies, with the court and scoring agreed before play."],
  ["What counts as proof", "One continuous recording showing both players and each rally."],
  ["When it closes", "An agreed window for submitting evidence. The live Quest shows the exact deadline."],
  ["When proof is unclear", "Uncertain moments are flagged for review, rather than silently guessed."],
];

export default function ContractStage() {
  return (
    <section className="sw-page sum-v4-page sum-v4-chapter-pact" data-testid="contract-stage">
      <PageIntro number="02" location="THE PACT CLEARING" title="Two people." accent="One shared truth." example>
        The moment a Quest becomes shared should feel important. Nothing is accepted until both Summoners understand the same terms.
      </PageIntro>
      <QuestJourney current={1}/>
      <div className="sum-v4-chapter">
        <div className="sum-v4-chapter__artifact">
          <QuestArtifact stage="pact" title="Three rallies. One shared adventure."
            id="EXAMPLE-001" participants="Mira / Ren — illustrative players"
            proof="Continuous match video" deadline="24 hours after acceptance" sample
          >
            <div className="sum-v4-pact-bond">
              <span className="sum-v4-pact-bond__person"><b>M</b><span>Mira<small>Quest creator</small></span></span>
              <span className="sum-v4-pact-bond__middle" aria-hidden="true"><SummonSigil/></span>
              <span className="sum-v4-pact-bond__person"><b>R</b><span>Ren<small>Invited Summoner</small></span></span>
            </div>
          </QuestArtifact>
        </div>
        <aside className="sum-v4-chapter__guide">
          <span className="sum-v4-chapter__counter">CHAPTER 02 / THE AGREEMENT</span>
          <div className="sum-v4-chapter__pico"><PicoFamiliar mood="clarify"/><div><strong>Pico keeps the meaning clear.</strong><p>The decision to accept belongs to the people, not to the Familiar.</p></div></div>
          <h2>A pact is more than a button.</h2>
          <p>These conditions should be understandable before the real Quest begins.</p>
          <ol className="sum-v4-conditions">{terms.map(([title,detail],index)=><li key={title}><span>0{index+1}</span><div><strong>{title}</strong><p>{detail}</p></div></li>)}</ol>
          <Link className="sw-button sum-v4-chapter__cta" href="/summons">Create your own Quest <Arrow/></Link>
          <small className="sum-v4-chapter__disclaimer">This walkthrough never accepts a real agreement.</small>
        </aside>
      </div>
    </section>
  );
}
