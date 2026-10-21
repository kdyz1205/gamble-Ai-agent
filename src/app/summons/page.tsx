import SceneShell from "@/components/scene/SceneShell";
import PactComposer from "@/components/summons/PactComposer";
import QuestIdeaDeck from "@/components/summons/QuestIdeaDeck";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { PageIntro, QuestJourney } from "@/components/universe/WorldUI";

export default function SummonsPage() {
  return (
    <SceneShell activePath="/summons">
      <section className="sw-page sum-v4-page" data-testid="world-nexus">
        <PageIntro number="01" location="THE SUMMONING NEXUS" title="Speak the idea." accent="Shape the Quest.">
          You are the Summoner. Pico helps turn your intention into a clear, shared Quest. The rules remain yours to review and confirm.
        </PageIntro>
        <QuestJourney current={0}/>
        <div className="sum-v4-nexus">
          <div className="sum-v4-nexus__header">
            <span><i aria-hidden="true"/> THE SUMMONING INSTRUMENT</span>
            <span>YOU + PICO / ONE SHARED POSSIBILITY</span>
          </div>
          <PactComposer/>
          <div className="sum-v4-nexus__below">
            <QuestIdeaDeck/>
            <aside className="sum-v4-nexus__reminder">
              <PicoFamiliar mood="guide"/>
              <div><strong>Your idea stays yours.</strong>
                <p>Choose a starting spark or begin from nothing. Pico can clarify the draft, but cannot accept rules or publish on your behalf.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </SceneShell>
  );
}
