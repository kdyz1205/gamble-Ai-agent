import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import SceneShell from "@/components/scene/SceneShell";
import { ArrowMark, SparkMark } from "@/components/world/EditorialMarks";

const capabilities = [
  ["01", "A good listener.", "Describe the challenge naturally. Pico helps turn the idea into something both friends can understand."],
  ["02", "A helpful second question.", "Who is playing? Where is the finish line? What proof will you need? Clear terms come before commitment."],
  ["03", "An explanation, not a mystery.", "Pico assists with proof review and explains the result. Unclear evidence stays open for review."],
] as const;

export default function RitualsPage() {
  return <SceneShell activePath="/rituals"><section className="ed-page ed-familiar" data-testid="editorial-pico-page"><div className="ed-familiar-intro"><div className="ed-pico-specimen"><div className="ed-pico-specimen__label"><span>MEET YOUR FAMILIAR</span><span>NO. 001</span></div><h2>PICO.</h2><div className="ed-pico-orbit"><span className="ed-pico-orbit__ring" /><PicoFamiliar mood="celebrate" /><SparkMark className="ed-pico-orbit__spark" /></div><span className="ed-pico-specimen__stamp">SMALL FRIEND.<br />BIG GOOD ENERGY.</span><div className="ed-pico-specimen__bottom"><span>SPECIES: HELPFUL LITTLE GUY</span><span>ROLE: AI FAMILIAR</span></div></div><div className="ed-familiar-copy"><p className="ed-eyebrow">THE FRIEND BEHIND THE FRIENDLY RIVALRY</p><h1>Your idea.<br />Your rules.<br /><em>A little Pico.</em></h1><p>Not the main character. Your helpful supporting act.<br />Pico brings a little clarity to the challenge — so you can get on with making the memory.</p><Link className="ed-button ed-button--coral" href="/summons">Make a quest with Pico <ArrowMark /></Link><p className="ed-note">An introduction to Pico, not a personalized skill or progress dashboard.</p></div></div><section className="ed-familiar-capabilities" aria-labelledby="capabilities-title"><div><p className="ed-eyebrow">A LITTLE HELP GOES A LONG WAY</p><h2 id="capabilities-title">Here for the<br /><em>good questions.</em></h2></div><ol>{capabilities.map(([number, title, text]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}</ol></section><section className="ed-familiar-promises" aria-label="Pico's boundaries">{[["No secret rules.", "Both participants review the same agreement."], ["No imaginary winners.", "Unclear proof needs review, not confidence theater."], ["No hidden moves.", "Pico cannot bypass consent or commit your credits."]].map(([title, text]) => <div key={title}><h3>{title}</h3><p>{text}</p></div>)}</section></section></SceneShell>;
}
