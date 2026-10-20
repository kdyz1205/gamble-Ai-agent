import PactComposer from "@/components/summons/PactComposer";
import QuestIdeaDeck from "@/components/summons/QuestIdeaDeck";
import SceneShell from "@/components/scene/SceneShell";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

export default function SummonsPage() {
  return (
    <SceneShell activePath="/summons">
      <section className="ed-page ed-composer" data-testid="editorial-composer-page">
        <header className="ed-page-header"><div><p className="ed-eyebrow">01 / THE IDEA STUDIO</p><h1>Every good story<br />starts with <em>a dare.</em></h1></div><p>What are you challenging your friend to do?<br />Tell Pico in your own words. You review the rules before anything is published.</p></header>
        <ol className="ed-phase" aria-label="Quest progress"><li aria-current="step"><span>1</span> YOUR IDEA</li><li><span>2</span> SHARED RULES</li><li><span>3</span> THE PROOF</li><li><span>4</span> THE RESULT</li></ol>
        <div className="ed-composer-grid"><PactComposer /><aside className="ed-studio-aside"><div className="ed-advice"><PicoFamiliar /><span className="ed-eyebrow">A NOTE FROM PICO</span><h2>You bring the idea.<br />I&apos;ll ask the right questions.</h2><p>A good challenge has a clear finish line. Who&apos;s taking part? What counts as a win? How will you show it?</p></div><QuestIdeaDeck /><p className="ed-note">Your terms stay yours. Pico helps you clarify them — it cannot accept a quest or change agreed rules for you.</p></aside></div>
      </section>
    </SceneShell>
  );
}
