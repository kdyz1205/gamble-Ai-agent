import Link from "next/link";
import SceneShell from "@/components/scene/SceneShell";
import { ArrowMark } from "@/components/world/EditorialMarks";

export default function DuelDemoPage() {
  return (
    <SceneShell activePath="/duel/demo">
      <section className="ed-page ed-proof" data-testid="editorial-proof-page">
        <header className="ed-page-header"><div><p className="ed-eyebrow">03 / THE PROOF ROOM</p><h1>Show the moment.<br /><em>Not just your word.</em></h1></div><p>Good proof makes a good story clearer. Keep the whole attempt in view and let both sides add their perspective.</p></header>
        <div className="ed-proof-layout">
          <div>
            <section className="ed-proof-stage" aria-label="Illustrated example of a badminton proof recording">
              <div className="ed-proof-stage__top"><span>BADMINTON / FIRST TO 3 RALLIES</span><span className="ed-example-tag">EXAMPLE</span></div>
              <svg viewBox="0 0 640 330" role="img" aria-label="An illustrated badminton court with two players. No video is attached.">
                <path d="M0 0h640v330H0z" fill="#29483e" />
                <path d="M65 40h510v250H65zM90 40v250M550 40v250M65 165h510M65 95h510M65 235h510M320 40v55m0 140v55" stroke="#e4ebcb" strokeWidth="2" fill="none" opacity=".8" />
                <path d="M42 165h556" stroke="#f5d65e" strokeWidth="3" />
                <path d="M42 161v10m556-10v10" stroke="#f5d65e" strokeWidth="5" />
                <ellipse cx="260" cy="262" rx="33" ry="8" fill="#112a24" opacity=".45" />
                <ellipse cx="400" cy="103" rx="30" ry="8" fill="#112a24" opacity=".45" />
                <circle cx="260" cy="230" r="24" fill="#f3bca8" stroke="#f7f5ef" strokeWidth="2" /><text x="260" y="237" textAnchor="middle" fill="#1d302d" fontSize="18" fontWeight="700">M</text>
                <circle cx="400" cy="75" r="23" fill="#eed15c" stroke="#f7f5ef" strokeWidth="2" /><text x="400" y="82" textAnchor="middle" fill="#1d302d" fontSize="18" fontWeight="700">R</text>
                <path d="M285 215q40-132 92-117" fill="none" stroke="#f7f5ef" strokeWidth="2" strokeDasharray="5 7" opacity=".6" /><circle cx="328" cy="141" r="5" fill="#f7f5ef" />
                <path d="m307 148 7-5m24-17 6-6" stroke="#f7f5ef" strokeWidth="2" strokeLinecap="round" />
                <text x="32" y="309" fill="#d8e6d2" fontSize="9" letterSpacing="2">ILLUSTRATION / NOT SUBMITTED FOOTAGE</text>
              </svg>
              <div className="ed-proof-stage__caption"><span className="ed-eyebrow">ONE CONTINUOUS ATTEMPT</span><span>Both players. Every rally. Full context.</span></div>
            </section>
            <section className="ed-evidence-ledger" aria-labelledby="evidence-title"><div className="ed-section-row"><h2 id="evidence-title">The evidence, in order.</h2><span className="ed-eyebrow">SAMPLE RECORDS</span></div>{[["01", "Full-match recording", "Mira / continuous video"], ["02", "Match notes", "Ren / player details"]].map(([number, title, detail]) => <div className="ed-evidence-row" key={number}><span>{number}</span><div><h3>{title}</h3><p>{detail}</p></div><span className="ed-example-tag">EXAMPLE ONLY</span></div>)}<p className="ed-note">These entries illustrate the layout. No files have been uploaded or reviewed on this demo page.</p></section>
          </div>
          <aside className="ed-proof-notebook"><p className="ed-eyebrow">THE BETTER-PROOF CHECKLIST</p><h2>Give the whole<br />picture.</h2><ol><li><span>01</span><div><h3>Keep the attempt continuous.</h3><p>Start before the action and finish after the outcome. Avoid missing context.</p></div></li><li><span>02</span><div><h3>Make each player identifiable.</h3><p>Show who is taking part and which person each record belongs to.</p></div></li><li><span>03</span><div><h3>Follow the agreed rules.</h3><p>The live quest specifies proof requirements and its submission deadline.</p></div></li></ol><div className="ed-proof-review"><strong>Not clear? Not decided.</strong><p>When evidence cannot establish the outcome, the quest needs review — not a guess.</p></div><Link className="ed-button ed-button--ink" href="/summons">Create your own quest <ArrowMark /></Link></aside>
        </div>
      </section>
    </SceneShell>
  );
}
