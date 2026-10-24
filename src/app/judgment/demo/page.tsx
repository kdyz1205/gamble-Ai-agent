import Link from "next/link";
import SceneShell from "@/components/scene/SceneShell";
import ChronicleReceipt from "@/components/universe/ChronicleReceipt";
import { Arrow, Eyebrow, WorldGlyph } from "@/components/universe/WorldUI";

export default function JudgmentDemoPage() {
  return <SceneShell activePath="/judgment/demo"><section className="sw-page"><div className="sw-chronicle"><div className="sw-chronicle-copy"><Eyebrow>04 / THE QUEST CHRONICLE</Eyebrow><h1>The quest ends.<br /><span>Your story stays.</span></h1><p>Every shared adventure deserves a record: what you set out to do, the evidence you brought back, and an outcome both Summoners can understand.</p><Link className="sw-button" href="/summons">Begin your next chapter <Arrow /></Link><ul className="sw-chronicle-explanations"><li><WorldGlyph kind="pact" /><div><strong>The pact is part of the story.</strong><p>The goal and both participants stay connected to the result.</p></div></li><li><WorldGlyph kind="proof" /><div><strong>The proof does not disappear.</strong><p>A live receipt explains the evidence supporting the outcome.</p></div></li><li><WorldGlyph kind="chronicle" /><div><strong>Uncertainty stays visible.</strong><p>Review comes before an invented answer. No decorative confidence scores.</p></div></li></ul><span className="sw-example-label">Illustrative walkthrough · not a live quest</span></div><ChronicleReceipt /></div></section></SceneShell>;
}
