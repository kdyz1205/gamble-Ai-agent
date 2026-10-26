"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { QuestXpStatus } from "@/lib/summons/quest-xp-status";
import { useSumLanguage, translated } from "@/components/locale/SumLanguage";

/**
 * Account-backed progression receipt for the real Web App. Read-only:
 * rendering the result page never awards XP or grants a Familiar.
 */
export default function IOSQuestXpStatus({ challengeId }: { challengeId: string }) {
  const { status: loginStatus } = useSession();
  const language = useSumLanguage();
  const t = (en: string, zh: string) => translated(language, en, zh);
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
    aria-label={t("Verified career experience","已核验的职业经验")}>
    <div className="ios-quest-reward__heading">
      <strong>{t("Career XP","职业经验")}</strong>
      <span>{amount !== null && amount !== undefined ? t("Verified receipt","已核验的记录") : t("Not yet awarded","尚未发放")}</span>
    </div>
    {amount !== null && amount !== undefined ?
      <div className="ios-quest-reward__amount">
        +{amount} XP
        {state?.professionId && <small>{state.professionId}{t(" career"," 职业")}</small>}
      </div> :
      <p className="ios-quest-reward__waiting">
        {loginStatus === "loading" ? t("Checking your account…","正在检查账户…") :
         loginStatus === "unauthenticated" ? t("Sign in to see your account's actual career XP.","登录后查看账户中真实记录的职业经验。") :
         readError ? t("Career XP status is unavailable; no reward is implied.","暂时无法读取职业经验状态，不代表已发放奖励。") :
         !state ? t("Checking verified progression…","正在核对已验证的进度…") :
         state.status === "approved_pending_issuance" ? t("Independent reviewer approved. XP issuance is pending.","独立审核已批准，经验尚待发放。") :
         state.status === "awaiting_independent_review" ? t("Result recorded; independent review is pending.","结果已记录，正等待独立审核。") :
         state.status === "requires_correction" ? t("Previous XP receipt needs independent reconciliation.","此前的经验收据需要独立核对。") :
         state.status === "review_revoked" ? t("Independent review was revoked; XP was not awarded.","独立审核已撤销，经验未发放。") :
         state.status === "disabled" ? t("Career XP rewards are not enabled for this preview.","此预览尚未开启职业经验奖励。") :
         state.status === "awaiting_final_result" ? t("The result or appeal has not finalized.","结果或申诉尚未最终确定。") :
         t("This result has no verified XP award.","此结果没有已核验的经验奖励。")}
      </p>}
    <p className="ios-quest-reward__note">
      {state?.note || t("XP, free tickets and owned Summons require separate server receipts.","经验、免费召唤券和已拥有的召唤兽均须有独立的服务端收据。")}
    </p>
  </section>;
}
