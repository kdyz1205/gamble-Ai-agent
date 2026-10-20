import Link from "next/link";
import SceneTopBar from "@/components/scene/SceneTopBar";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { ArrowMark, RacketArtwork, SparkMark } from "@/components/world/EditorialMarks";

export const metadata = { title: "Summoner.world — Make a little more of real life", description: "Turn a friendly challenge into a shared quest. Clear rules, your proof, and a result you can understand." };
const steps = [
  ["01", "Say the thing.", "A race to the finish. A week of showing up. Start with a challenge in your own words."],
  ["02", "Make it fair.", "Agree on the goal, deadline and proof. Both friends see the same rules before accepting."],
  ["03", "Keep the story.", "Bring your evidence. Understand the result. Leave uncertain moments open for review."],
] as const;

export default function EnterPage() {
  return (
    <div className="ed-site" data-design-version="editorial-v2">
      <a className="ed-skip-link" href="#world-introduction">Skip to main content</a>
      <SceneTopBar activePath="/enter" />
      <main id="world-introduction" tabIndex={-1}>
        <section className="ed-hero ed-container" aria-labelledby="hero-title">
          <div className="ed-hero__copy">
            <p className="ed-eyebrow"><span className="ed-dot" /> REAL LIFE. A LITTLE MORE PLAY.</p>
            <h1 id="hero-title">Less scrolling.<br />More <em>“you&apos;re on.”</em></h1>
            <p className="ed-hero__lead">That friendly dare? Make it a quest.<br className="ed-desktop-break" /> Set the rules, bring the proof, and give your friends<br className="ed-wide-break" /> something to talk about.</p>
            <div className="ed-hero__actions"><Link href="/summons" className="ed-button ed-button--coral" data-testid="editorial-create-cta">Make your first quest <ArrowMark /></Link><a href="#how-it-works" className="ed-text-link">How it works <span aria-hidden="true">↘</span></a></div>
            <div className="ed-hero__aside"><span className="ed-avatars" aria-hidden="true"><span>M</span><span>R</span><span>YOU</span></span><p>For friends. Not followers.<br /><strong>One shared challenge at a time.</strong></p></div>
          </div>
          <div className="ed-hero__art" aria-label="Example collectible badminton challenge card">
            <div className="ed-card-back ed-card-back--coral" aria-hidden="true" />
            <div className="ed-card-back ed-card-back--yellow" aria-hidden="true" />
            <article className="ed-quest-poster">
              <div className="ed-poster__top"><span>THE FRIENDLY RIVALRY CLUB</span><span>NO. 001</span></div>
              <h2>ALL TALK?<br /><em>COURT TIME.</em></h2>
              <RacketArtwork className="ed-poster__art" />
              <div className="ed-poster__bottom"><div><span>THE CHALLENGE</span><strong>First to win 3 rallies.</strong></div><span className="ed-poster__arrow"><ArrowMark /></span></div>
              <div className="ed-poster__tear"><span>2 FRIENDS</span><span>1 GOOD STORY</span><span>EXAMPLE QUEST</span></div>
            </article>
            <div className="ed-seal"><SparkMark /><span>LESS FEED.<br />MORE<br /><b>FEELING.</b></span></div>
            <div className="ed-pico-note"><PicoFamiliar mood="guide" /><span>“I&apos;ll help with the rules.<br /><strong>You bring the rivalry.”</strong></span><small>— PICO, YOUR AI FAMILIAR</small></div>
            <span className="ed-art-caption">A little competition. A lot to remember.</span>
          </div>
        </section>
        <div className="ed-ribbon" aria-hidden="true"><span>FRIENDLY RIVALRIES</span><SparkMark /><span>REAL-WORLD STORIES</span><SparkMark /><span>CHALLENGE ACCEPTED</span><SparkMark /><span>FRIENDLY RIVALRIES</span></div>
        <section className="ed-how ed-container" id="how-it-works" aria-labelledby="how-title">
          <div className="ed-section-intro"><p className="ed-eyebrow">GOOD TIMES. CLEAR TERMS.</p><h2 id="how-title">The fun is yours.<br /><em>The structure is ours.</em></h2><p>No rulebook required. Pico helps turn your idea into a clear, shared challenge — without making up a winner.</p></div>
          <ol className="ed-how__steps">{steps.map(([n, title, detail]) => <li key={n}><span>{n}</span><div><h3>{title}</h3><p>{detail}</p></div><ArrowMark /></li>)}</ol>
        </section>
        <section className="ed-ideas ed-container" aria-labelledby="ideas-title">
          <div className="ed-section-row"><div><p className="ed-eyebrow">WHAT&apos;S YOUR NEXT “BET I CAN”?</p><h2 id="ideas-title">Small challenges.<br />Big main-character energy.</h2></div><Link href="/summons" className="ed-text-link">Start with your own idea <ArrowMark /></Link></div>
          <div className="ed-idea-grid">
            <Link className="ed-idea ed-idea--sport" href="/summons"><span className="ed-eyebrow">01 / FRIENDLY COMPETITION</span><h3>Meet you<br />on the court.</h3><RacketArtwork /><span className="ed-idea__footer">A little skill. A little bragging. <ArrowMark /></span></Link>
            <Link className="ed-idea ed-idea--habit" href="/summons"><span className="ed-eyebrow">02 / SHOWING UP</span><h3>Seven days.<br />Zero excuses.</h3><div className="ed-week" aria-hidden="true">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} data-done={i < 4}>{d}<b>{i < 4 ? "✓" : "·"}</b></span>)}</div><span className="ed-idea__footer">Make a habit worth keeping. <ArrowMark /></span></Link>
            <Link className="ed-idea ed-idea--wild" href="/summons"><span className="ed-eyebrow">03 / YOUR WILD CARD</span><h3>That thing<br />you keep saying.</h3><div className="ed-wild-star" aria-hidden="true"><SparkMark /><b>DO<br />IT.</b></div><span className="ed-idea__footer">You know the one. <ArrowMark /></span></Link>
          </div>
        </section>
        <section className="ed-final-call"><div className="ed-container"><p className="ed-eyebrow">THE GROUP CHAT CAN WAIT.</p><h2>Go make<br /><em>a good story.</em></h2><Link className="ed-button ed-button--cream" href="/summons">Challenge a friend <ArrowMark /></Link><PicoFamiliar mood="celebrate" className="ed-final-pico" /></div></section>
      </main>
      <footer className="ed-site-footer ed-container"><Link className="ed-footer-brand" href="/enter">summoner.world</Link><span>Real challenges. Shared rules. Clearer results.</span><nav aria-label="Policies and support"><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/support">Support</Link></nav></footer>
    </div>
  );
}
