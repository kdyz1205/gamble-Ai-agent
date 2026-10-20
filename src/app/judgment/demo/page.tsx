import Link from "next/link";
import SceneShell from "@/components/scene/SceneShell";
import ExampleReceipt from "@/components/world/ExampleReceipt";
import { ArrowMark } from "@/components/world/EditorialMarks";

export default function JudgmentDemoPage() {
  return <SceneShell activePath="/judgment/demo"><section className="ed-page" aria-labelledby="results-title"><div className="ed-result-layout"><div className="ed-result-story"><p className="ed-eyebrow">04 / THE PART YOU KEEP</p><h1 id="results-title">Big moments.<br /><em>Little receipts.</em></h1><p>The challenge ends. The story doesn&apos;t.<br />A clear outcome, the evidence behind it, and something worth sending to the group chat.</p><Link className="ed-button ed-button--coral" href="/summons">Make a story of your own <ArrowMark /></Link><ol className="ed-result-checks"><li><span aria-hidden="true">01</span><div><strong>One result. Both sides of the story.</strong><p>The receipt names the quest and participants, not just a winner.</p></div></li><li><span aria-hidden="true">02</span><div><strong>The explanation stays attached.</strong><p>What was submitted, what supported the outcome, and what still needs review.</p></div></li><li><span aria-hidden="true">03</span><div><strong>Uncertainty is not a footnote.</strong><p>An inconclusive result remains open for review. No invented confidence scores.</p></div></li></ol><span className="ed-example-tag">YOU ARE VIEWING A DESIGN EXAMPLE</span></div><ExampleReceipt /></div></section></SceneShell>;
}
