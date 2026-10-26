import { SummonSigil } from "@/components/universe/WorldUI";
import type { ReactNode } from "react";

export type QuestArtifactStage = "intention" | "draft" | "pact" | "proof" | "review" | "chronicle";

interface QuestArtifactProps {
  stage: QuestArtifactStage;
  title: string;
  participants: string;
  proof: string;
  deadline?: string;
  objective?: string;
  id?: string;
  sample?: boolean;
  statusText?: string;
  children?: ReactNode;
  compact?: boolean;
}

const sequence: QuestArtifactStage[] = ["intention","draft","pact","proof","review","chronicle"];
const names:Record<QuestArtifactStage,string> = {
  intention:"THE INTENTION",
  draft:"THE QUEST BLUEPRINT",
  pact:"THE SHARED PACT",
  proof:"THE EVIDENCE CHAPTER",
  review:"THE OPEN REVIEW",
  chronicle:"THE CHRONICLE",
};

/** A continuous identity from idea to record. The geometric seal is decorative, never cryptographic proof. */
export default function QuestArtifact({
  stage,title,participants,proof,deadline,objective,id,sample=false,statusText,children,compact=false,
}:QuestArtifactProps) {
  const position=sequence.indexOf(stage);
  const label=sample ? "ILLUSTRATIVE EXAMPLE" : (statusText||"NOT YET PUBLISHED");
  return (
    <article className={"sum-artifact sum-artifact--"+stage+(compact?" sum-artifact--compact":"")} data-quest-stage={stage} data-sample={sample?"true":"false"} aria-label={"SUM Quest artifact, "+label.toLowerCase()}>
      <div className="sum-artifact__glimmer" aria-hidden="true" />
      <div className="sum-artifact__inner">
        <header className="sum-artifact__header">
          <span className="sum-artifact__mark"><SummonSigil/></span>
          <span className="sum-artifact__brand">SUM / QUEST OBJECT <small>{id||"ID ASSIGNED WHEN PUBLISHED"}</small></span>
          <span className="sum-artifact__status">{label}</span>
        </header>
        <div className="sum-artifact__body">
          <p className="sum-artifact__eyebrow">{names[stage]}</p>
          <h3>{title.trim()||"The next story begins with an idea."}</h3>
          {objective && <p className="sum-artifact__objective">{objective}</p>}
          <div className="sum-artifact__emblem" aria-hidden="true">
            <span /><SummonSigil/><span />
          </div>
        </div>
        <dl className="sum-artifact__details">
          <div><dt>Summoners</dt><dd>{participants}</dd></div>
          <div><dt>Proof</dt><dd>{proof}</dd></div>
          {deadline && <div><dt>When</dt><dd>{deadline}</dd></div>}
        </dl>
        <footer className="sum-artifact__footer">
          <div className="sum-artifact__lifecycle" aria-label={"Quest stage: "+names[stage].toLowerCase()}>
            {sequence.map((item,index) => <span key={item} className={index<=position?"is-reached":""} title={names[item]} aria-hidden="true"/>)}
          </div>
          <span className="sum-artifact__sealnote">A FORM, NOT A VERDICT</span>
        </footer>
        {children && <div className="sum-artifact__extra">{children}</div>}
      </div>
    </article>
  );
}
