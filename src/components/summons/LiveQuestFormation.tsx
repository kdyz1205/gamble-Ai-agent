import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { SummonSigil } from "@/components/universe/WorldUI";

export type FormationStage = "dormant" | "listening" | "clarifying" | "formed" | "working";

interface FormationProps {
  hasInput: boolean;
  isWorking: boolean;
  hasReply: boolean;
  readyToPublish: boolean;
  challengeTitle: string;
  participants: string;
  proof: string;
  deadline: string;
}
export default function LiveQuestFormation({
  hasInput, isWorking, hasReply, readyToPublish, challengeTitle, participants, proof, deadline,
}: FormationProps) {
  // The UI follows authoritative draft state; it never calls an API or advances progress on a timer.
  const stage: FormationStage = isWorking ? "working" : readyToPublish ? "formed" : hasReply ? "clarifying" : hasInput ? "listening" : "dormant";
  const copy = {
    dormant: ["Your summoning gate is waiting", "Describe a real-world challenge to begin shaping a Quest."],
    listening: ["Pico is listening", "Your words are still an idea. Review the conditions before submitting."],
    working: ["Pico is helping shape the draft", "The request is in progress. No quest has been published."],
    clarifying: ["Your Quest needs a little clarity", "Check the returned draft and answer any missing questions."],
    formed: ["Your Quest blueprint is ready to review", "Check every term before choosing to publish."],
  }[stage];
  const facts = [
    { name: "Summoners", value: participants },
    { name: "Proof", value: proof },
    { name: "Time window", value: deadline },
  ];
  return (
    <section className="sw-formation" data-testid="live-quest-formation" data-stage={stage} aria-label="Live quest formation status">
      <div className="sw-formation__visual" aria-hidden="true">
        <div className="sw-formation__outer" />
        <div className="sw-formation__inner" />
        <div className="sw-formation__runes"><i /><i /><i /><i /></div>
        <div className="sw-formation__pico"><PicoFamiliar mood={stage === "formed" ? "celebrate" : "guide"} /></div>
        <div className="sw-formation__platform" />
      </div>
      <div className="sw-formation__content">
        <span className="sw-small-label">LIVE QUEST FORMATION · {stage.toUpperCase()}</span>
        <h3>{copy[0]}</h3>
        <p>{copy[1]}</p>
        {hasInput && <div className="sw-formation__artifact" data-testid="live-quest-artifact">
          <div className="sw-formation__artifact-top"><SummonSigil /><span>{readyToPublish ? "REVIEWABLE BLUEPRINT" : "UNCONFIRMED IDEA"}</span></div>
          <strong>{challengeTitle}</strong>
          <dl>{facts.map(item => <div key={item.name}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
        </div>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{copy[0]}</span>
    </section>
  );
}
