"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { ChallengeData } from "@/lib/api-client";
import * as api from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";
import { startVisiblePolling } from "@/lib/visible-polling";
import { useCreditBalance } from "./IOSAppData";
import { IosIcon } from "./IOSAppUI";
import VerdictReviewControls from "@/components/VerdictReviewControls";

type Props = {
  quest: ChallengeData;
  userId: string | undefined;
  onUpdated: () => void | Promise<void>;
};

function proofComplete(quest: ChallengeData): boolean {
  const participants = quest.participants.filter(p =>
    p.status === "accepted" && ["creator", "opponent"].includes(p.role));
  if (participants.length !== 2 ||
      !participants.some(p => p.role === "creator" && p.user.id === quest.creatorId) ||
      !participants.some(p => p.role === "opponent")) return false;
  const evidence = new Map((quest.evidence ?? []).map(row => [row.userId, row]));
  return participants.every(p => {
    const row = evidence.get(p.user.id);
    if (!row) return false;
    if (["video", "photo"].includes(quest.evidenceType)) {
      return row.type === quest.evidenceType && !!row.url?.trim();
    }
    return !!row.description?.trim();
  });
}

/** Real app actions, backed by the SAME guarded judge/consent APIs as the legacy view.
 * A recommendation is never called a settlement; no XP or item ownership is claimed.
 */
export default function IOSQuestJudgment({ quest, userId, onUpdated }: Props) {
  const creator = userId === quest.creatorId;
  const accepted = quest.participants.some(p => p.user.id === userId &&
    p.status === "accepted" && ["creator", "opponent"].includes(p.role));
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [agreedCost, setAgreedCost] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const { credits, loading: creditsLoading, error: creditError } =
    useCreditBalance(creator && quest.status === "judging");
  const validProof = proofComplete(quest);
  // Starter tier is exactly one inference credit for staked Quests; free Quests
  // have zero platform credits charged. The backend independently rechecks it.
  const reviewCost = quest.stake > 0 ? 1 : 0;
  const needsCredits = reviewCost > 0 &&
    (creditsLoading || credits === null || credits < reviewCost);
  const canStart = accepted && creator && quest.status === "judging" &&
    (quest.judgments?.length ?? 0) === 0 && validProof;

  const poll = useCallback(async (id: string, signal: AbortSignal): Promise<boolean> => {
    if (signal.aborted || document.visibilityState !== "visible") return true;
    try {
      const current = await api.getJudgeJob(id);
      if (signal.aborted) return false;
      if (current.status === "completed") {
        setJobId(null);
        setBusy(false);
        setNotice("Familiar review is ready. Both players must check the result.");
        await onUpdated();
        return false;
      }
      if (current.status === "failed") {
        setJobId(null);
        setBusy(false);
        setError(current.error || "The referee could not review the evidence. Retry the review.");
        await onUpdated();
        return false;
      }
    } catch {
      if (!signal.aborted) setNotice("Connection interrupted. The review remains on the server; checking again when visible.");
    }
    return true;
  }, [onUpdated]);

  useEffect(() => {
    if (!jobId || quest.status !== "judging") return;
    // No overlapping HTTP requests; no wakeups while the phone tab is hidden.
    // Returning to the foreground triggers an immediate status read.
    return startVisiblePolling({
      delays: [1_000, 2_000, 4_000, 6_000, 10_000],
      immediate: true,
      timeoutMs: 15 * 60_000,
      task: (signal) => poll(jobId, signal),
      onTimeout: () => {
        setBusy(false);
        setNotice("Referee check timed out. Reopen this Quest to resume the server job.");
      },
    });
  }, [jobId, quest.status, poll]);

  // Mobile Safari may terminate a suspended tab. Read server state on return
  // rather than creating a duplicate judgment or asking the player to pay again.
  useEffect(() => {
    if (!creator || quest.status !== "judging" ||
        (quest.judgments?.length ?? 0) > 0) return;
    let alive = true;
    void api.getLatestJudgeJob(quest.id).then(({ job }) => {
      if (!alive || !job) return;
      if (job.status === "pending" || job.status === "processing") {
        setJobId(current => current ?? job.jobId);
        setBusy(true);
        setNotice("Reconnected to the existing referee job. Checking its result…");
      } else if (job.status === "completed") {
        setNotice("A referee task finished. Refresh this Quest to read the verified verdict.");
      } else if (job.status === "failed") {
        setError("Previous referee review failed. You can retry without a fabricated result.");
      }
    }).catch(() => {
      // A broken read must never submit work or suppress the explicit judge gate.
    });
    return () => { alive = false; };
  }, [creator, quest.id, quest.status, quest.judgments?.length]);

  async function runJudge() {
    if (!canStart || busy || jobId || needsCredits ||
        (reviewCost > 0 && !agreedCost)) return;
    setError("");
    setNotice("Submitting both proof records to the referee…");
    setBusy(true);
    try {
      const prefs = readOracleLlmPrefs();
      const job = await api.judgeChallengeAsync(quest.id, 1, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      if (!job.jobId) throw new Error("No judge job receipt was returned");
      setJobId(job.jobId);
      setNotice("Your proof is being reviewed. The page will check for a verdict while visible.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Referee review failed");
      setNotice("");
      setBusy(false);
    }
  }

  if (quest.arbiter === "quiz-curated-mcq-v1") {
    return <section className="ios-quest-detail-card" data-testid="ios-quiz-flow">
      <h2>Verified Quiz arena</h2>
      <p>Quiz questions and scores are evaluated by their committed answer key, not by the video referee.</p>
      <Link className="ios-action" href={"/app/quiz?id=" + encodeURIComponent(quest.id)}>
        Open Quiz and final receipt <IosIcon name="arrow" size={17}/>
      </Link>
    </section>;
  }
  if (quest.status === "disputed" && (quest.judgments?.length ?? 0) > 0) {
    return <section className="ios-quest-judge" data-testid="ios-verdict-ready">
      <h2>Familiar verdict</h2>
      <p>The referee recommendation is recorded. Both players must accept it, or request review.</p>
      <div className="ios-quest-judge__receipt">
        <strong>{quest.judgments?.[0]?.winner?.username ?? "No verified winner"}</strong>
        {quest.judgments?.[0]?.reasoning &&
          <p>{quest.judgments[0].reasoning}</p>}
      </div>
      {userId ? <VerdictReviewControls challenge={quest} userId={userId}
        onUpdated={onUpdated}/> :
        <p role="status">Sign in as a participating player to review the verdict.</p>}
    </section>;
  }
  if (quest.status === "judging") {
    return <section className="ios-quest-judge" data-testid="ios-judge-gate">
      <h2>Evidence received. Referee next.</h2>
      {!validProof ?
        <>
          <p>Both players must submit acceptable proof before video/AI review can start. A deadline-rule result may be available for expired Quests.</p>
          <Link className="ios-secondary-button" href={"/challenge/" + encodeURIComponent(quest.id)}>
            Check proof and deadline status <IosIcon name="arrow" size={16}/>
          </Link>
        </> :
        !creator ?
          <p>The Quest creator can start the AI review. You can refresh the Quest to see the verdict when it is ready.</p> :
        (quest.judgments?.length ?? 0) > 0 ?
          <p>A verdict was already recorded. Refresh to see the latest decision.</p> :
          <>
            <p>Both accepted players have submitted proof. Review is a recommendation, not automatic settlement.</p>
            {reviewCost > 0 &&
              <label className="ios-quest-judge__approval">
                <input type="checkbox" checked={agreedCost} onChange={e => setAgreedCost(e.target.checked)}/>
                I authorize a review costing {reviewCost} platform credit. My available balance is {creditsLoading ? "checking…" : credits === null ? "unknown" : credits}.
              </label>}
            {(needsCredits || creditError) && reviewCost > 0 &&
              <p className="ios-message ios-message--error" role="alert">
                {creditError || "The server has not confirmed sufficient available credits."}
              </p>}
            <button type="button" className="ios-primary"
              onClick={() => void runJudge()}
              data-testid="ios-run-judge"
              disabled={!canStart || busy || !!jobId || needsCredits ||
                (reviewCost > 0 && !agreedCost)}>
              <IosIcon name="spark" size={18}/>
              {busy ? "Referee working…" : reviewCost === 0 ? "Ask Familiar to judge (free)" : "Start authorized AI review"}
            </button>
          </>}
      {notice && <p role="status" className="ios-message">{notice}</p>}
      {error && <p role="alert" className="ios-message ios-message--error">{error}</p>}
    </section>;
  }
  if (quest.status === "pending_settlement") {
    return <p className="ios-message" role="status">The verdict is recorded; settlement is still processing. No award or completed result is claimed.</p>;
  }
  if (quest.status === "disputed") {
    return <p className="ios-message" role="status">A review case is open. Settlement is frozen until the referee decision can be verified.</p>;
  }
  return null;
}
