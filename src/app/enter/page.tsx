import Link from "next/link";
import Image from "next/image";
import SceneTopBar from "@/components/scene/SceneTopBar";
import SummoningPortal from "@/components/universe/SummoningPortal";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { Arrow, Eyebrow, QuestJourney, SummonSigil, WorldFooter, WorldGlyph } from "@/components/universe/WorldUI";
import { questSeeds } from "@/components/universe/quest-seeds";


export default function EnterPage() {
  return (
    <div className="sw-app sw-home sum-award-home sum-kawaii-home" data-design-version="sum-world-v3" data-art-direction="storybook-world">
      <a className="sw-skip-link" href="#world-introduction">Skip to main content</a>
      <SceneTopBar activePath="/enter"/>
      <main id="world-introduction" tabIndex={-1}>
        <section className="sw-hero sw-container sum-award-hero" aria-labelledby="world-title">
          <div className="sw-hero__copy sum-award-hero__copy">
            <Eyebrow>AN EXTRAORDINARY WAY TO BE HUMAN</Eyebrow>
            <h1 id="world-title">Make reality<br/><em>summonable.</em></h1>
            <p className="sw-hero__lead">
              A little spark can become a real adventure. Create a Quest, invite your people, share your proof, and let Pico help you make the moment count.
            </p>
            <div className="sw-hero__actions">
              <Link className="sw-button sum-award-cta" href="/summons" data-testid="world-summon-cta">
                <SummonSigil/> Summon a Quest <Arrow/>
              </Link>
              <Link className="sw-text-link" href="/rituals">Meet Pico, your Familiar <Arrow/></Link>
            </div>
            <div className="sum-kawaii-hero__whisper" aria-hidden="true"><span>✦</span> Small ideas. Brighter tomorrows.</div>
            <div className="sum-award-hero__meta">
              <div className="sum-award-hero__line" aria-hidden="true"><span>01</span><i/><span>06</span></div>
              <div className="sum-award-hero__meaning"><PicoFamiliar mood="guide"/><p><strong>You are the Summoner.</strong><span>Your imagination becomes the beginning.</span></p></div>
            </div>
          </div>
          <SummoningPortal/>
        </section>
        <section className="sw-path-section sw-container sum-award-path" id="how-it-works" aria-labelledby="path-title">
          <div className="sw-section-heading">
            <div><Eyebrow>ONE IDEA / MANY FORMS</Eyebrow><h2 id="path-title">The world changes<br/><em>when you act.</em></h2></div>
            <p>Not a simulated victory. Not another feed.<br/>A clear path from intention to a real outcome.</p>
          </div>
          <QuestJourney current={-1}/>
        </section>
        <section className="sw-realms-section sw-container sum-award-realms" aria-labelledby="realms-title">
          <div className="sw-section-heading">
            <div><Eyebrow>YOUR POSSIBILITIES ARE NOT ONE CATEGORY</Eyebrow><h2 id="realms-title">A new realm begins<br/>with your idea.</h2></div>
            <Link className="sw-text-link" href="/summons">Create something of your own <Arrow/></Link>
          </div>
          <div className="sw-realms">
            {questSeeds.map((quest,index) => (
              <Link className={"sw-realm sw-realm--"+quest.id} href={"/summons?seed="+quest.id} key={quest.id}>
                <div className="sw-realm__header"><span className="sw-small-label">0{index+1} / {quest.realm}</span><WorldGlyph kind={quest.kind}/></div>
                <div className="sw-realm__storybook" aria-hidden="true"><Image src={quest.id === "move" ? "/storybook-premium/realm1.webp" : quest.id === "craft" ? "/storybook-premium/realm2.webp" : "/storybook-premium/realm3.webp"} width={620} height={400} className="sum-storybook-realm-img" alt="" sizes="(max-width:699px) 100vw, (max-width:959px) 50vw, 33vw"/><span className="sum-realm__spark"><WorldGlyph kind={quest.kind}/></span></div>
                <h3>{quest.name}</h3><p>{quest.hint}</p>
                <span className="sw-realm__action">Enter this realm <Arrow/></span>
              </Link>
            ))}
          </div>
          <p className="sw-example-footnote">Creative starting points, not live participants, real geolocation or verified challenges.</p>
        </section>
        <section className="sw-companion-section sw-container sum-award-familiar" aria-labelledby="companion-title">
          <div className="sw-companion-section__visual">
            <div className="sw-companion-orbit" aria-hidden="true"/>
            <div className="sum-kawaii-companion-landscape" aria-hidden="true"><Image src="/storybook-premium/pico3.webp" alt="" fill sizes="(max-width:699px) 100vw, 44vw" className="sum-storybook-companion-img"/></div>
            <PicoFamiliar className="sw-companion-section__pico" mood="listening"/>
            <span className="sw-companion-section__tag"><span>FAMILIAR / 001</span><b>PICO</b><small>A little clarity, by your side.</small></span>
          </div>
          <div className="sw-companion-section__copy">
            <Eyebrow>NOT JUST A CHARACTER / A COMPANION</Eyebrow>
            <h2 id="companion-title">An idea is yours.<br/><span>The journey is shared.</span></h2>
            <p>From the first words to the final evidence, Pico helps clarify the rules, surface unanswered questions, and explain what happened.</p>
            <div className="sw-companion-functions">
              <span><WorldGlyph kind="spark"/>Shape the idea</span>
              <span><WorldGlyph kind="proof"/>Review the proof</span>
              <span><WorldGlyph kind="chronicle"/>Explain the result</span>
            </div>
            <Link className="sw-text-link" href="/rituals">Meet your AI Familiar <Arrow/></Link>
            <p className="sw-fairness-note">Pico never accepts a pact on your behalf or invents an outcome.</p>
          </div>
        </section>
        <section className="sw-world-invitation sw-container sum-award-endcap">
          <SummonSigil/>
          <div><Eyebrow>YOUR WORLD IS WAITING</Eyebrow><h2>What will you bring to life?</h2><p>A friend, an idea, a shared finish line. It starts here.</p></div>
          <Link className="sw-button sw-button--light" href="/summons">Open the Nexus <Arrow/></Link>
        </section>
      </main>
      <WorldFooter/>
    </div>
  );
}
