type Activity = {
  type: string;
  user?: { username: string } | null;
  challenge?: { title: string } | null;
};

/** Presentation only: keep original messages in the event/audit store. Unknown
 * future event kinds do not expose provider names or raw internal identifiers.
 * No winning, payment, XP or settlement is inferred from a recommendation.
 */
export function publicActivityPresentation(event: Activity, language: "en" | "zh" = "en"): { label: string; message: string } {
  if (language === "zh") {
    const player = event.user?.username || "一位召唤师";
    const quest = event.challenge ? `“${event.challenge.title}”` : "一个 Quest";
    switch (event.type) {
      case "user_joined": return {label:"新召唤师",message:`${player} 加入了 Summoners World。`};
      case "challenge_created": return {label:"Quest 已创建",message:`${player} 创建了 ${quest}。`};
      case "quiz_created": return {label:"Quiz 邀请",message:`${player} 创建了 Quiz 邀请。`};
      case "challenge_accepted": return {label:"已接受规则",message:`${player} 接受了 ${quest} 的规则。`};
      case "evidence_submitted": return {label:"已提交证据",message:`${player} 为 ${quest} 提交了证据。`};
      case "challenge_verdict_recommended": return {label:"裁判建议",message:`${quest} 已记录裁判建议。请打开 Quest 查看当前复核和结果状态。`};
      case "challenge_settled": return {label:"结果已确认",message:`${quest} 已记录确认后的结果，请查看结果回执。`};
      case "challenge_refunded": return {label:"无胜者结果",message:`${quest} 已记录无胜者结果，请查看结果回执。`};
      case "challenge_cancelled": return {label:"Quest 已取消",message:`${quest} 已记录取消操作。`};
      default: return {label:"社区更新",message:"已记录一条公开社区动态。"};
    }
  }
  const player = event.user?.username || "A Summoner";
  const quest = event.challenge ? `“${event.challenge.title}”` : "a Quest";
  switch (event.type) {
    case "user_joined": return { label: "New Summoner", message: `${player} joined Summoners World.` };
    case "challenge_created": return { label: "Quest created", message: `${player} created ${quest}.` };
    case "quiz_created": return { label: "Quiz invitation", message: `${player} created a Quiz invitation.` };
    case "challenge_accepted": return { label: "Rules accepted", message: `${player} accepted the rules for ${quest}.` };
    case "evidence_submitted": return { label: "Proof submitted", message: `${player} submitted proof for ${quest}.` };
    case "challenge_verdict_recommended": return { label: "Referee recommendation", message: `A referee recommendation was recorded for ${quest}. Open the Quest to check its current review and result status.` };
    case "challenge_settled": return { label: "Result confirmed", message: `A confirmed result was recorded for ${quest}. View the result receipt for details.` };
    case "challenge_refunded": return { label: "No-winner result", message: `A no-winner result was recorded for ${quest}. View the result receipt for details.` };
    case "challenge_cancelled": return { label: "Quest cancelled", message: `The cancellation of ${quest} was recorded.` };
    default: return { label: "Community update", message: "A public community update was recorded." };
  }
}
