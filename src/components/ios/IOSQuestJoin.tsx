"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";
import { IosAction, IosFrame, IosIcon, IosEmpty } from "./IOSAppUI";
import { useCreditBalance, useQuest } from "./IOSAppData";
import { AuthInvitation } from "./IOSPersonalScreens";

/**
 * A real accepted-rules checkpoint INSIDE the mobile Web App. The backend,
 * not this component, owns participant seats, stake debit and challenge state.
 */
export default function IOSQuestJoin({ id }: { id?: string }) {
  const { quest, loading, error, refresh } = useQuest(id);
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;
  const stake = quest?.stake ?? 0;
  const { credits, loading: balanceLoading, error: balanceError } = useCreditBalance(
    Boolean(quest && stake > 0 && sessionStatus === "authenticated"),
  );
  const [agreedRules, setAgreedRules] = useState(false);
  const [agreedStake, setAgreedStake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  useEffect(() => {
    setAgreedRules(false);
    setAgreedStake(false);
    setAcceptError("");
  }, [id]);

  const isCreator = Boolean(userId && quest?.creatorId === userId);
  const isAccepted = Boolean(userId && quest?.participants.some(p =>
    p.user.id === userId && p.status === "accepted" &&
    ["creator", "opponent"].includes(p.role)));
  const paidApprovalRequired = stake > 0;
  const hasAgreedRules = Boolean(quest?.rules?.trim() || quest?.proposition?.trim());
  const enoughCredits = !paidApprovalRequired ||
    (!balanceLoading && credits !== null && credits >= stake && !balanceError);
  const canAccept = Boolean(
    quest && userId && quest.status === "open" &&
    !isCreator && !isAccepted && hasAgreedRules && agreedRules &&
    (!paidApprovalRequired || agreedStake) && enoughCredits && !busy,
  );

  async function accept() {
    if (!quest || !canAccept) return;
    setBusy(true);
    setAcceptError("");
    try {
      await api.acceptChallenge(quest.id);
      router.replace("/app/quest?id=" + encodeURIComponent(quest.id));
    } catch (caught) {
      setAcceptError(caught instanceof Error ? caught.message : "This invitation could not be accepted");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return <IosFrame title="Quest Invitation" eyebrow="READ · AGREE · ENTER" back="/app/discover">
    {!id ? <IosEmpty heading="Invitation link missing."
      description="Use an actual invitation from a friend to enter the Quest."
      action="Discover Quests" href="/app/discover"/> :
    !quest ? (loading ? <p role="status" className="ios-message">Checking the Quest invitation…</p> :
      <IosEmpty heading="This invitation cannot be opened."
        description={error || "No authentic Quest record was found."}
        action="Discover Quests" href="/app/discover"/>) :
    quest.arbiter === "quiz-curated-mcq-v1" ?
      <section className="ios-quest-invite" data-testid="ios-join-quiz">
        <h1>{quest.title}</h1>
        <p>This is a sealed Quiz. Join in its dedicated verified Quiz room.</p>
        <IosAction href={"/app/quiz?id=" + encodeURIComponent(quest.id)}>
          Open the Quiz invitation
        </IosAction>
      </section> :
    <section className="ios-quest-invite" data-testid="ios-quest-invite">
      <div className="ios-quest-invite__eyebrow"><IosIcon name="people" size={20}/>
        <span>PLAYER INVITATION / {quest.visibility === "invite_only" ? "PRIVATE" : "PUBLIC"}</span>
      </div>
      <h1>{quest.title}</h1>
      {quest.description && <p>{quest.description}</p>}
      <div className="ios-quest-invite__facts">
        <div><span>Host</span><strong>{quest.creator?.username || "Summoner"}</strong></div>
        <div><span>Entry</span><strong>{stake > 0 ? stake + " platform credits" : "Free · 0 credits"}</strong></div>
        <div><span>Proof</span><strong>{quest.evidenceType.replace(/_/g, " ")}</strong></div>
        <div data-testid="ios-invitation-state"><span>Quest status</span><strong>{quest.status.replace(/_/g, " ")}</strong></div>
        <div><span>Deadline</span><strong>{quest.deadline ? new Date(quest.deadline).toLocaleString() : "Not specified"}</strong></div>
      </div>
      <div className="ios-quest-invite__rules">
        <h2>Rules to accept</h2>
        <p>{quest.rules || quest.proposition || "No specific rules were supplied. Do not accept until the host clarifies the Quest."}</p>
      </div>
      {isCreator ? <p className="ios-message">You created this Quest. Send this invitation to the other player.</p> :
       isAccepted ? <IosAction href={"/app/quest?id=" + encodeURIComponent(quest.id)}>Continue your accepted Quest</IosAction> :
       quest.status !== "open" ? <p className="ios-message">This Quest is {quest.status.replace(/_/g, " ")} and cannot accept a new player.</p> :
       sessionStatus !== "authenticated" ? <AuthInvitation
          title="Sign in to join this Quest."
          detail="Your accepted seat and evidence must belong to the same account."/> :
       <>
         {!hasAgreedRules && <p role="alert" className="ios-message ios-message--error">The host must specify reviewable Quest rules before anyone can join.</p>}
         <label className="ios-quest-invite__approval">
           <input data-testid="ios-accept-rules" type="checkbox" checked={agreedRules}
             onChange={e => setAgreedRules(e.target.checked)}/>
           I have read and agree to these Quest rules and proof requirements.
         </label>
         {paidApprovalRequired && <label className="ios-quest-invite__approval">
           <input data-testid="ios-accept-stake" type="checkbox" checked={agreedStake}
             onChange={e => setAgreedStake(e.target.checked)}/>
           I authorize a stake of {stake} platform credits. The server will check and reserve this amount when I join.
         </label>}
         {paidApprovalRequired && <p className="ios-message">
           Verified available credits: {balanceLoading ? "checking…" : credits === null ? "unavailable" : credits}.
           {balanceError ? " Could not confirm balance." : ""}
         </p>}
         {acceptError && <p role="alert" className="ios-message ios-message--error">{acceptError}</p>}
         <button type="button" className="ios-primary" data-testid="ios-accept-quest"
           disabled={!canAccept} onClick={() => void accept()}>
           {busy ? "Accepting…" : "Accept Quest and enter game"}
         </button>
         <p className="ios-footer-note">This action records your acceptance on the server. No winner, XP or reward is awarded for joining.</p>
       </>}
    </section>}
  </IosFrame>;
}
