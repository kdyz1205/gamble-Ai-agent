import PicoFamiliar, {type PicoMood} from "@/components/familiar/PicoFamiliar";
import RealmCanvas, {type PortalRealm, type PortalState} from "@/components/experience/RealmCanvas";
import QuestArtifact from "@/components/experience/QuestArtifact";

interface Props {
  hasInput: boolean;
  isWorking: boolean;
  hasReply: boolean;
  readyToPublish: boolean;
  challengeTitle: string;
  participants: string;
  proof: string;
  deadline: string;
  realm?: PortalRealm;
  error?: string | null;
}

const messages: Record<PortalState,[string,string,string]> = {
  dormant:["The Gate is waiting","Tell Pico what you want to make real.","Nothing begins without your idea."],
  listening:["Pico is listening","Your intention has entered the Nexus.","The words are a draft until you review the rules."],
  working:["Shaping your Quest","Pico is working on the structured draft.","No agreement or publishing has occurred."],
  clarifying:["A detail still matters","Pico has returned a draft that needs clarification.","Review the response and resolve missing conditions."],
  formed:["Your blueprint awaits","The current draft is ready for your review.","Publishing is a separate action, under your control."],
  error:["A moment to reconsider","The draft request needs attention.","Nothing has been published or charged."],
};

export default function LiveQuestFormation({
  hasInput,isWorking,hasReply,readyToPublish,challengeTitle,participants,proof,deadline,realm="move",error,
}:Props) {
  const state:PortalState = error?"error":isWorking?"working":readyToPublish?"formed":hasReply?"clarifying":hasInput?"listening":"dormant";
  const mood:PicoMood = state==="working"?"thinking":state==="listening"?"listening":state==="clarifying"?"clarify":state==="formed"?"confirm":state==="error"?"error":"waiting";
  const [title,description,boundary]=messages[state];
  return (
    <section className="sum-live-nexus" data-testid="live-quest-formation" data-stage={state} aria-label="The live SUM Quest formation display">
      <div className="sum-live-nexus__head">
        <span><i aria-hidden="true"/> GATE / 001</span>
        <span>{state==="working"?"PROCESSING":"YOUR SUMMONING NEXUS"}</span>
      </div>
      <div className="sum-live-nexus__art" aria-hidden="true">
        <RealmCanvas realm={realm} state={state} className="sum-live-nexus__canvas"/>
        <div className="sum-live-nexus__pico"><PicoFamiliar mood={mood}/></div>
      </div>
      <div className="sum-live-nexus__message">
        <span className="sum-small-label">{state.toUpperCase()} / BASED ON CURRENT QUEST STATE</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="sum-live-nexus__artifact">
        {hasInput ? (
          <QuestArtifact
            stage={readyToPublish?"draft":"intention"}
            title={challengeTitle}
            participants={participants}
            proof={proof}
            deadline={deadline}
            compact
            statusText={readyToPublish?"READY FOR YOUR REVIEW":"UNCONFIRMED DRAFT"}
          />
        ) : (
          <div className="sum-live-nexus__empty">
            <span aria-hidden="true">✧</span>
            <strong>An unfinished story.</strong>
            <p>Your Quest Artifact will take shape as you describe your idea.</p>
          </div>
        )}
      </div>
      <p className="sum-live-nexus__disclaimer">{boundary}</p>
      <span role="status" aria-live="polite" className="sr-only">{title}</span>
    </section>
  );
}
