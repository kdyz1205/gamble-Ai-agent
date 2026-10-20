import SceneShell from "@/components/scene/SceneShell";
import PactComposer from "@/components/summons/PactComposer";
import QuestIdeaDeck from "@/components/summons/QuestIdeaDeck";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { PageIntro, QuestJourney } from "@/components/universe/WorldUI";

export default function SummonsPage() {
  return <SceneShell activePath="/summons"><section className="sw-page" data-testid="world-nexus">
    <PageIntro number="01" location="THE SUMMONING NEXUS" title="Every quest" accent="starts with you.">Tell Pico what you have in mind. Your Familiar helps shape the idea into clear terms — you decide what gets published.</PageIntro>
    <QuestJourney current={0} />
    <div className="sw-nexus-grid"><div className="sw-nexus-main"><div className="sw-panel-label"><span>SUMMONING CONSOLE</span><span>YOUR IDEA → SHARED TERMS</span></div><PactComposer /></div><aside className="sw-nexus-aside"><section className="sw-guide-chamber"><span className="sw-small-label">PICO / YOUR AI FAMILIAR</span><div className="sw-guide-chamber__portrait"><PicoFamiliar mood="guide" /></div><h2>Let&apos;s give your idea<br />a little structure.</h2><p>Who is joining you? What counts as completing the quest? What will show it happened?</p></section><QuestIdeaDeck /><p className="sw-nexus-note">Choosing an example only fills the draft. Nothing is published, accepted, or charged by choosing a starting point.</p></aside></div>
  </section></SceneShell>;
}
