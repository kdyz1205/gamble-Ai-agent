"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { QuestXpStatus } from "@/lib/summons/quest-xp-status";

/**
 * Account-backed progression receipt for the real Web App. Read-only:
 * rendering the result page never awards XP or grants a Familiar.
 */
export default function IOSQuestXpStatus({ challengeId }: { challengeId: string }) {
  const { status: loginStatus } = useSession();
  const [state, setState] = useState<QuestXpStatus | null>(null);
  const [readError, setReadError] = useState("");
  useEffect(() => {
    setState(null);
    setReadError("");
    if (loginStatus !== "authenticated") return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(
          "/api/summons/quest-xp?challengeId=" + encodeURIComponent(challengeId),
          { method: "GET", signal: controller.signal,
            credentials: "same-origin", cache: "no-store" },
        );
        if (!res.ok) throw new Error("Status is temporarily unavailable");
        const data = await res.json() as QuestXpStatus;
        if (!controller.signal.aborted) setState(data);
      } catch {
        if (!controller.signal.aborted) {
          setReadError("Career XP status is unavailable; no reward is implied.");
        }
      }
    };
    void load();
    return () => controller.abort();
  }, [challengeId, loginStatus]);

  const amount = state?.status === "awarded" ? state.verifiedXp : null;
  return <section className="ios-quest-reward" data-testid="ios-real-xp-status"
    aria-label="Verified career experience">
    <div className="ios-quest-reward__heading">
      <strong>Career XP</strong>
      <span>{amount !== null && amount !== undefined ? "Verified receipt" : "Not yet awarded"}</span>
    </div>
    {amount !== null && amount !== undefined ?
      <div className="ios-quest-reward__amount">
        +{amount} XP
        {state?.professionId && <small>{state.professionId} career</small>}
      </div> :
      <p className="ios-quest-reward__waiting">
        {loginStatus === "loading" ? "Checking your account…" :
         loginStatus === "unauthenticated" ? "Sign in to see your account's actual career XP." :
         readError ? readError :
         !state ? "Checking verified progression…" :
         state.status === "approved_pending_issuance" ? "Independent reviewer approved. XP issuance is pending." :
         state.status === "awaiting_independent_review" ? "Result recorded; independent review is pending." :
         state.status === "requires_correction" ? "Previous XP receipt needs independent reconciliation." :
         state.status === "review_revoked" ? "Independent review was revoked; XP was not awarded." :
         state.status === "disabled" ? "Career XP rewards are not enabled for this preview." :
         state.status === "awaiting_final_result" ? "The result or appeal has not finalized." :
         "This result has no verified XP award."}
      </p>}
    <p className="ios-quest-reward__note">
      {state?.note || "XP, free tickets and owned Summons require separate server receipts."}
    </p>
  </section>;
}
