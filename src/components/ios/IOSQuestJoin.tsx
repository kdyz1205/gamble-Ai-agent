"use client";

import { useEffect, useState } from "react";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";
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
  const language=useSumLanguage();
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
      setAcceptError(caught instanceof Error ? caught.message :
        translated(language,"This invitation could not be accepted","无法接受这份邀请。"));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return <IosFrame title="Quest Invitation" eyebrow="READ · AGREE · ENTER" back="/app/discover">
    {!id ? <IosEmpty heading={translated(language,"Invitation link missing.","邀请链接缺失。")}
      description={translated(language,"Use an actual invitation from a friend to enter the Quest.","请使用朋友发来的真实 Quest 邀请链接。")}
      action={translated(language,"Discover Quests","发现 Quest")} href="/app/discover"/> :
    !quest ? (loading ? <p role="status" className="ios-message"><SumText en="Checking the Quest invitation…" zh="正在验证 Quest 邀请…"/></p> :
      <IosEmpty heading={translated(language,"This invitation cannot be opened.","无法打开该邀请。")}
        description={error || translated(language,"No authentic Quest record was found.","找不到有效的 Quest 记录。")}
        action={translated(language,"Discover Quests","发现 Quest")} href="/app/discover"/>) :
    quest.arbiter === "quiz-curated-mcq-v1" ?
      <section className="ios-quest-invite" data-testid="ios-join-quiz">
        <h1>{quest.title}</h1>
        <p><SumText en="This is a sealed Quiz. Join in its dedicated verified Quiz room." zh="这是一场答案封存的 Quiz，请进入独立的验证对战房间。"/></p>
        <IosAction href={"/app/quiz?id=" + encodeURIComponent(quest.id)}>
          <SumText en="Open the Quiz invitation" zh="进入 Quiz 邀请房间"/>
        </IosAction>
      </section> :
    <section className="ios-quest-invite" data-testid="ios-quest-invite">
      <div className="ios-quest-invite__eyebrow"><IosIcon name="people" size={20}/>
        <span><SumText en="PLAYER INVITATION" zh="玩家邀请"/> / {quest.visibility === "invite_only" ? translated(language,"PRIVATE","私密") : translated(language,"OPEN","公开")}</span>
      </div>
      <h1>{quest.title}</h1>
      {quest.description && <p>{quest.description}</p>}
      <div className="ios-quest-invite__facts">
        <div><span><SumText en="Host" zh="发起者"/></span><strong>{quest.creator?.username || "Summoner"}</strong></div>
        <div><span><SumText en="Entry" zh="加入成本"/></span><strong>{stake > 0 ? stake + translated(language," platform credits"," 平台积分") : translated(language,"Free · 0 credits","免费 · 0 积分")}</strong></div>
        <div><span><SumText en="Proof" zh="证据形式"/></span><strong>{quest.evidenceType.replace(/_/g, " ")}</strong></div>
        <div><span><SumText en="Deadline" zh="截止时间"/></span><strong>{quest.deadline ? new Date(quest.deadline).toLocaleString(language==="zh"?"zh-CN":"en-US") : translated(language,"Not specified","未指定")}</strong></div>
      </div>
      <div className="ios-quest-invite__rules">
        <h2><SumText en="Rules to accept" zh="接受前需确认的规则"/></h2>
        <p>{quest.rules || quest.proposition || translated(language,"No specific rules were supplied. Do not accept until the host clarifies the Quest.","发起者尚未提供明确规则。请在规则澄清前不要接受这份 Quest。")}</p>
      </div>
      {isCreator ? <p className="ios-message"><SumText en="You created this Quest. Send this invitation to the other player." zh="这是你创建的 Quest，请将邀请发送给另一位玩家。"/></p> :
       isAccepted ? <IosAction href={"/app/quest?id=" + encodeURIComponent(quest.id)}><SumText en="Continue your accepted Quest" zh="继续已加入的 Quest"/></IosAction> :
       quest.status !== "open" ? <p className="ios-message"><SumText en="This Quest is" zh="当前 Quest 状态："/> {quest.status.replace(/_/g, " ")}<SumText en=" and cannot accept a new player." zh="；暂不接受新玩家。"/></p> :
       sessionStatus !== "authenticated" ? <AuthInvitation
          title={translated(language,"Sign in to join this Quest.","登录后加入 Quest。")}
          detail={translated(language,"Your accepted seat and evidence must belong to the same account.","参与资格与提交证据必须使用同一账号。")}/> :
       <>
         {!hasAgreedRules && <p role="alert" className="ios-message ios-message--error"><SumText en="The host must specify reviewable Quest rules before anyone can join." zh="发起者必须先提供可核查的 Quest 规则，其他玩家才能加入。"/></p>}
         <label className="ios-quest-invite__approval">
           <input data-testid="ios-accept-rules" type="checkbox" checked={agreedRules}
             onChange={e => setAgreedRules(e.target.checked)}/>
           <SumText en="I have read and agree to these Quest rules and proof requirements." zh="我已阅读并同意本 Quest 的规则与证据要求。"/>
         </label>
         {paidApprovalRequired && <label className="ios-quest-invite__approval">
           <input data-testid="ios-accept-stake" type="checkbox" checked={agreedStake}
             onChange={e => setAgreedStake(e.target.checked)}/>
           <SumText en={<>I authorize a stake of {stake} platform credits. The server will check and reserve this amount when I join.</>} zh={<>我明确同意加入时冻结 {stake} 平台积分。服务器会先验证可用余额，并按所接受的规则保留该笔积分。</>}/>
         </label>}
         {paidApprovalRequired && <p className="ios-message">
           <SumText en="Verified available credits:" zh="已核验的可用积分："/> {balanceLoading ? translated(language,"checking…","核验中…") : credits === null ? translated(language,"unavailable","暂不可用") : credits}.
           {balanceError ? translated(language," Could not confirm balance."," 无法确认余额。") : ""}
         </p>}
         {acceptError && <p role="alert" className="ios-message ios-message--error">{acceptError}</p>}
         <button type="button" className="ios-primary" data-testid="ios-accept-quest"
           disabled={!canAccept} onClick={() => void accept()}>
           {busy ? translated(language,"Accepting…","正在接受…") : translated(language,"Accept Quest and enter game","确认规则并加入 Quest")}
         </button>
         <p className="ios-footer-note"><SumText en="This action records your acceptance on the server. No winner, XP or reward is awarded for joining." zh="此操作会将你的接受记录保存到服务器。仅加入 Quest 不会产生胜负、XP 或奖励。"/></p>
       </>}
    </section>}
  </IosFrame>;
}
