import Link from "next/link";
import SceneTopBar from "@/components/scene/SceneTopBar";
import SummoningPortal from "@/components/universe/SummoningPortal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { Arrow, Eyebrow, QuestJourney, SummonSigil, WorldFooter, WorldGlyph } from "@/components/universe/WorldUI";
import { questSeeds } from "@/components/universe/quest-seeds";

export default function EnterPage() {
  return <div className="sw-app sw-home" data-design-version="sum-world-v3">
    <a className="sw-skip-link" href="#world-introduction">Skip to main content</a>
    <SceneTopBar activePath="/enter" />
    <main id="world-introduction" tabIndex={-1}>
      <section className="sw-hero sw-container" aria-labelledby="world-title">
        <div className="sw-hero__copy">
          <Eyebrow>REAL-LIFE QUESTS. AI FAMILIARS.</Eyebrow>
          <h1 id="world-title">Your world.<br /><span>Your next quest.</span></h1>
          <p className="sw-hero__lead">You are the Summoner.<br />Turn an everyday idea into a shared quest — with Pico, your AI Familiar, by your side.</p>
          <div className="sw-hero__actions"><Link className="sw-button" href="/summons" data-testid="world-summon-cta"><SummonSigil />Summon your first quest <Arrow /></Link><Link className="sw-text-link" href="/rituals">Meet your Familiar <Arrow /></Link></div>
          <div className="sw-hero__companion"><span className="sw-hero__companion-icon"><PicoFamiliar /></span><p><strong>You bring the possibility.</strong><br />Pico helps you give it a form.</p><span className="sw-hero__companion-mark" aria-hidden="true">✧</span></div>
          <div className="sw-hero__identity"><span>YOUR INTENT</span><span aria-hidden="true">→</span><span>A SHARED QUEST</span><span aria-hidden="true">→</span><span>A REAL STORY</span></div>
        </div>
        <SummoningPortal />
      </section>
      <section className="sw-path-section sw-container" id="how-it-works" aria-labelledby="path-title"><div className="sw-section-heading"><div><Eyebrow>THE SUMMONER&apos;S PATH</Eyebrow><h2 id="path-title">An idea becomes an adventure.</h2></div><p>Clear rules. Real evidence.<br />A story both sides can understand.</p></div><QuestJourney current={-1} /></section>
      <section className="sw-realms-section sw-container" aria-labelledby="realms-title"><div className="sw-section-heading"><div><Eyebrow>MORE THAN ONE KIND OF QUEST</Eyebrow><h2 id="realms-title">Your world has many possibilities.</h2></div><Link className="sw-text-link" href="/summons">Bring your own idea <Arrow /></Link></div>
        <div className="sw-realms">{questSeeds.map((quest,index) => <Link className={`sw-realm sw-realm--${quest.id}`} href={`/summons?seed=${quest.id}`} key={quest.id}><div className="sw-realm__header"><span className="sw-small-label">0{index+1} / {quest.realm}</span><WorldGlyph kind={quest.kind} /></div><div className="sw-realm__sculpture" aria-hidden="true"><span /><span /><span /><WorldGlyph kind={quest.kind} /></div><h3>{quest.name}</h3><p>{quest.hint}</p><span className="sw-realm__action">Explore this quest <Arrow /></span></Link>)}</div><p className="sw-example-footnote">Example starting points, not active quests or a live location map.</p>
      </section>
      <section className="sw-companion-section sw-container" aria-labelledby="companion-title"><div className="sw-companion-section__visual"><div className="sw-companion-orbit" aria-hidden="true" /><PicoFamiliar className="sw-companion-section__pico" /><span className="sw-companion-section__tag"><span>FAMILIAR / 001</span><b>PICO</b><small>A little clarity, by your side.</small></span></div><div className="sw-companion-section__copy"><Eyebrow>NOT JUST A MASCOT. YOUR FAMILIAR.</Eyebrow><h2 id="companion-title">You lead the quest.<br /><span>Pico comes with you.</span></h2><p>From the first idea to the final explanation, your Familiar helps clarify the rules, understand the proof, and make room for uncertainty.</p><div className="sw-companion-functions"><span><WorldGlyph kind="spark" />Shape the idea</span><span><WorldGlyph kind="proof" />Review the proof</span><span><WorldGlyph kind="chronicle" />Explain the result</span></div><Link className="sw-text-link" href="/rituals">Get to know Pico <Arrow /></Link><p className="sw-fairness-note">Your Familiar never accepts terms for you or invents a winner.</p></div></section>
      <section className="sw-world-invitation sw-container"><SummonSigil /><div><Eyebrow>THE NEXT CHAPTER IS YOURS</Eyebrow><h2>What will you summon?</h2><p>A challenge. A new habit. Something you want to make real.</p></div><Link className="sw-button sw-button--light" href="/summons">Enter the Nexus <Arrow /></Link></section>
    </main>
    <WorldFooter />
  </div>;
}
