import { buildDeterministicAgentResponse, normalizeDraftState } from "./draft-policy";
import type { AgentMessage, DraftState, RawAgentResponse } from "./types";

export const MAX_AGENT_MESSAGE_CHARS = 8_000;
export const MAX_AGENT_HISTORY_CHARS = 6_000;

/** History is supplementary; the normalized structured draft remains authoritative. */
export function boundedAgentHistory(history: AgentMessage[]): string {
  const selected: string[] = [];
  let remaining = MAX_AGENT_HISTORY_CHARS;
  for (const message of history.slice(-8).reverse()) {
    const prefix = `${message.role.toUpperCase()}: `;
    const content = message.content.length > 1_500
      ? `${message.content.slice(0, 1_460)} [earlier message excerpt]`
      : message.content;
    const line = `${prefix}${content}`;
    if (line.length + 2 > remaining) break;
    selected.unshift(line);
    remaining -= line.length + 2;
  }
  return selected.join("\n\n");
}

function settingsReply(patch: Partial<DraftState>, previous: DraftState, chinese: boolean): RawAgentResponse {
  const next = normalizeDraftState({ ...previous, ...patch });
  return {
    userVisibleReply: chinese ? "已更新草稿设置，请检查后再发布。" : "Draft settings updated. Review them before publishing.",
    agentAction: next.readyToPublish ? "show_draft" : "ask_followup",
    draftPatch: patch,
    toolName: null,
    toolArgs: null,
  };
}

/** Only exact, supported grammar bypasses inference. Never dispatches backend tools. */
export function tryLocalAgentResponse(message: string, previous: DraftState): RawAgentResponse | null {
  const parts = message.split(/\n\s*\n(?=Challenge settings:)/i);
  if (parts.length > 2) return null;
  const text = parts[0].trim();
  const chinese = /[\u3400-\u9fff]/.test(text);
  // Reject unknown settings instead of silently ignoring a condition in the suffix.
  if (parts[1] && !/^Challenge settings: stake (?:unset|\d{1,7}) credits; opponent (?:Open match|Invite only|Public pool); proof window [\w ]{1,80}\.?$/i.test(parts[1].trim())) return null;

  if (previous.title) {
    const stake = /^(?:(?:set|change) (?:the )?(?:stake|credits) to (\d{1,7})(?: credits)?|(?:积分|筹码)(?:改为|改成|设为|设置为)(\d{1,7}))[.!。！]?$/i.exec(text);
    if (stake) return settingsReply({ stake: Number(stake[1] ?? stake[2]) }, previous, chinese);
    if (/^(?:make it free|free|改为免费|免费)[.!。！]?$/i.test(text)) return settingsReply({ stake: 0 }, previous, chinese);
    const window = /^(?:(?:set|change) (?:the )?proof window to (\d{1,3} (?:hours?|days?|minutes?))|(?:证明|上传)(?:期限|时间)(?:改为|改成|设为)(\d{1,3}(?:小时|天|分钟)))[.!。！]?$/i.exec(text);
    if (window && Number.parseInt(window[1] ?? window[2], 10) > 0) return settingsReply({ timeWindow: window[1] ?? window[2] }, previous, chinese);
    const opponents: Record<string, string> = {
      "invite only": "you + 1 invited friend", "仅邀请": "you + 1 invited friend",
      "open match": "you + 1 open opponent", "公开匹配": "you + 1 open opponent",
    };
    const opponent = /^(?:(?:set|change) opponent to |对手(?:改为|改成|设为))(.+?)[.!。！]?$/i.exec(text);
    if (opponent && Object.hasOwn(opponents, opponent[1].toLowerCase())) return settingsReply({ participants: opponents[opponent[1].toLowerCase()] }, previous, chinese);
  }

  if (/^(?:hi|hello|hey|你好|嗨|哈喽)[!！?.。\s]*$/i.test(text)) return buildDeterministicAgentResponse(message, previous);

  // Keep the template deliberately narrow: no custom rules, negations, special
  // scoring, or arbitrary sport mentions. Those belong to the model path.
  const sport = "(?:badminton|table tennis|ping[- ]?pong|tennis|pickleball|volleyball|羽毛球|乒乓球|网球|匹克球|排球)";
  const count = "[1-9]\\d{0,2}";
  const chineseFormat = `(?:先到${count}分(?:赢|获胜)?|(?:总共|一共|打完)(?:打)?${count}个?回合|${count}个球(?:定胜负)?)`;
  const englishFormat = `(?:first to ${count} points?|exactly ${count} rallies)`;
  const initial = new RegExp(`^(?:(?:我和朋友|我跟朋友|和朋友)?(?:打|比)?${sport}[，, ]*${chineseFormat}|(?:(?:challenge my friend to|play|let's play) )?${sport}[, :]*${englishFormat})[。.!！]?$`, "i");
  const followup = new RegExp(`^(?:${chineseFormat}|${englishFormat})[。.!！]?$`, "i");
  const supportedPrevious = new RegExp(sport, "i").test(previous.title ?? "")
    && (!previous.judgeRule || /The Familiar starts at 0-0, returns only each visible rally winner/.test(previous.judgeRule));
  if (initial.test(text) || (supportedPrevious && followup.test(text))) {
    return buildDeterministicAgentResponse(message, previous);
  }
  return null;
}
