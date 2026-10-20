import Link from "next/link";
import { Arrow, FamiliarNote, PageIntro, QuestJourney, SummonSigil } from "@/components/universe/WorldUI";

const terms = [
  ["The shared goal", "First player to win three badminton rallies. Agree on court boundaries and service order before starting."],
  ["The proof", "One continuous recording showing both players, the court, and the full attempt. Each Summoner may add their own evidence."],
  ["The deadline", "For this example, proof is due within 24 hours after both players accept. A live quest shows its exact deadline before acceptance."],
  ["When it is unclear", "Uncertain evidence stays open for review. A Familiar cannot change agreed terms or accept the pact on your behalf."],
];
const principles = [["Two Summoners. One agreement.", "Both participants see the same objective and proof requirements."], ["Consent comes before commitment.", "Any internal credits and acceptance conditions appear in the actual quest."], ["Clarity is part of the adventure.", "Missing or disputed evidence is a reason to review, not to guess."]];

export default function ContractStage() {
  return <section className="sw-page" data-testid="contract-stage"><PageIntro number="02" location="THE PACT CLEARING" title="A shared quest." accent="A pact, made together." example>A quest becomes shared when both Summoners understand the terms. Review the goal, the proof, and the commitment before joining.</PageIntro><QuestJourney current={1} />
    <div className="sw-pact-grid"><article className="sw-pact-card"><div className="sw-pact-card__top"><div><strong>SUMMONER PACT / EXAMPLE 001</strong><small>An illustrative agreement, not an invitation to accept.</small></div><SummonSigil /></div><div className="sw-pact-card__body"><h2>Three rallies.<br />One shared adventure.</h2><div className="sw-summoners"><div className="sw-summoner"><span className="sw-summoner__avatar">M</span><span><strong>Mira</strong><small>Quest creator · example</small></span></div><span className="sw-summoners__bond" aria-hidden="true"><SummonSigil /></span><div className="sw-summoner"><span><strong>Ren</strong><small>Invited friend · example</small></span><span className="sw-summoner__avatar">R</span></div></div><dl className="sw-pact-terms">{terms.map(([label,description],index) => <div key={label}><span>0{index+1}</span><dt>{label}</dt><dd>{description}</dd></div>)}</dl><div className="sw-pact-card__bottom"><Link className="sw-button" href="/summons">Summon your own pact <Arrow /></Link><p>No real quest is accepted or created on this example page.</p></div></div></article>
      <aside className="sw-pact-aside"><FamiliarNote title="I can clarify the pact. Only you can accept it.">Your terms belong to you and your fellow Summoner. I help make them understandable.</FamiliarNote><section><h2>Same rules.<br />Room for both sides.</h2><ul className="sw-principles">{principles.map(([title,description]) => <li key={title}><span aria-hidden="true">✧</span><div><strong>{title}</strong><p>{description}</p></div></li>)}</ul></section><Link className="sw-text-link" href="/duel/demo">Next: the Proof Archive <Arrow /></Link></aside>
    </div>
  </section>;
}
