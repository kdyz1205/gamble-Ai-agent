import type { DraftState, RawAgentResponse } from "./types";

const SHORT_SCORED_SPORT = /\b(badminton|table tennis|ping[- ]?pong|tennis|pickleball|volleyball)\b|羽毛球|乒乓球|网球|匹克球|排球/i;
const MOOD_OR_GREETING = /^(?:hi|hello|hey|你好|嗨|哈喽|喂|我(?:好|很)?(?:饿|累|困|烦)|i['’]?m\s+(?:hungry|tired|bored|sad))\s*[!！?.。]*$/i;
const UNJUDGEABLE = /who(?:'s| is)\s+(?:cooler|better looking|handsomer)|谁(?:更|最)(?:帅|酷|好看)|谁是最好的人/i;
const UNSAFE = /一口气.*(?:啤酒|白酒|酒)|(?:chug|speed[- ]?drink).*(?:beer|alcohol|liquor)|自残|打架|斗殴|self[- ]?harm/i;

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : null;
}

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/.test(value);
}

function scoredSportText(draft: DraftState): string {
  return [draft.title, draft.proposition, draft.judgeRule].filter(Boolean).join(" ");
}

function hasExplicitStoppingRule(text: string): boolean {
  return /first\s+(?:player\s+)?to\s+\d+|exactly\s+\d+\s+(?:rallies|points)|先(?:到|得)\s*[一二三四五六七八九十\d]+\s*分|(?:总共|一共|打完)\s*[一二三四五六七八九十\d]+\s*(?:个)?(?:球|回合)|[一二三四五六七八九十\d]+\s*(?:个)?回合/i.test(text);
}

export function getDraftIssues(draft: DraftState): string[] {
  const issues: string[] = [];
  if (!draft.title || draft.title.length < 4) issues.push("title");
  if (!draft.proposition || draft.proposition.length < 8) issues.push("win condition");
  if (!draft.participants) issues.push("participants");
  if (draft.stake === null || !Number.isFinite(draft.stake) || draft.stake < 0) issues.push("credits");
  if (draft.stake !== null && draft.stake > 0 && draft.stakeType !== "credits") issues.push("credit type");
  if (draft.stake === 0 && draft.stakeType !== "none") issues.push("credit type");
  if (!draft.evidenceType) issues.push("proof type");
  if (!draft.judgeRule || draft.judgeRule.length < 25) issues.push("AI referee rule");
  if (!draft.timeWindow) issues.push("proof window");

  const sportText = scoredSportText(draft);
  if (SHORT_SCORED_SPORT.test(sportText)) {
    if (draft.evidenceType && draft.evidenceType !== "video") issues.push("continuous video proof");
    if (!hasExplicitStoppingRule(sportText)) issues.push("scoring format");
  }
  return [...new Set(issues)];
}

export function normalizeDraftState(input: Partial<DraftState> | null | undefined): DraftState {
  const rawStake = typeof input?.stake === "number" && Number.isFinite(input.stake)
    ? Math.max(0, Math.floor(input.stake))
    : null;
  const evidenceType = input?.evidenceType === "video" || input?.evidenceType === "photo" || input?.evidenceType === "text"
    ? input.evidenceType
    : null;
  const base: DraftState = {
    title: cleanText(input?.title, 100),
    proposition: cleanText(input?.proposition, 500),
    participants: cleanText(input?.participants, 120),
    stake: rawStake,
    stakeType: rawStake === null ? null : rawStake === 0 ? "none" : "credits",
    evidenceType,
    judgeRule: cleanText(input?.judgeRule, 2_000),
    timeWindow: cleanText(input?.timeWindow, 120),
    safetyNotes: Array.isArray(input?.safetyNotes)
      ? [...new Set(input.safetyNotes.filter((note): note is string => typeof note === "string").map((note) => note.trim()).filter(Boolean))].slice(0, 8)
      : [],
    readyToPublish: false,
  };
  base.readyToPublish = getDraftIssues(base).length === 0;
  return base;
}

export function draftIssueQuestion(draft: DraftState, chinese = false): string {
  const issue = getDraftIssues(draft)[0];
  if (issue === "scoring format") {
    return chinese
      ? "这里的“几个球”是指先到这个分数，还是固定打这么多个回合后比较总分？"
      : "Does that mean first to that score, or a fixed number of rallies with the higher total winning?";
  }
  if (issue === "win condition" || issue === "title") {
    return chinese ? "胜负要按什么可观察的结果判定？" : "What observable result decides the winner?";
  }
  if (issue === "participants") return chinese ? "这是你和一位朋友的对战，还是公开匹配？" : "Is this against one invited friend or an open match?";
  if (issue === "credits" || issue === "credit type") return chinese ? "这局用多少积分，还是免费玩？" : "How many credits, or should it be free?";
  if (issue === "proof type" || issue === "continuous video proof") return chinese ? "用连续视频作为证明可以吗？" : "Can a continuous video be the proof?";
  if (issue === "proof window") return chinese ? "双方需要在多长时间内完成并上传证明？" : "How long should both players have to finish and upload proof?";
  return chinese ? "AI 裁判应按什么明确规则判断赢家？" : "What exact rule should the AI referee use to decide the winner?";
}

function extractUserText(message: string): string {
  return message.split(/\n\s*\nChallenge settings:/i)[0]?.trim() ?? message.trim();
}

function extractSettings(message: string, current: DraftState) {
  const stakeMatch = /Challenge settings:\s*stake\s+(unset|\d+)\s+credits/i.exec(message);
  const opponentMatch = /opponent\s+(Open match|Invite only|Public pool)/i.exec(message);
  const windowMatch = /proof window\s+([^;.\n]+)/i.exec(message);
  const stake = stakeMatch && stakeMatch[1].toLowerCase() !== "unset"
    ? Math.max(0, Number(stakeMatch[1]))
    : current.stake ?? 0;
  const opponent = opponentMatch?.[1] ?? null;
  const participants = opponent === "Open match"
    ? "you + 1 open opponent"
    : opponent === "Public pool"
      ? "you + 1 opponent from the public pool"
      : opponent === "Invite only"
        ? "you + 1 invited friend"
        : current.participants ?? "you + 1 invited friend";
  return {
    stake,
    participants,
    timeWindow: windowMatch?.[1]?.trim() || current.timeWindow || "24 hours",
  };
}

function countFromText(text: string): number | null {
  const digit = /(\d+)\s*(?:个)?(?:球|分|回合|points?|rallies)/i.exec(text);
  if (digit) return Math.max(1, Number(digit[1]));
  const chineseDigits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const chinese = /([一二三四五六七八九十])\s*(?:个)?(?:球|分|回合)/.exec(text);
  return chinese ? chineseDigits[chinese[1]] ?? null : null;
}

function sportName(text: string): string | null {
  const match = SHORT_SCORED_SPORT.exec(text);
  return match?.[0] ?? null;
}

function stoppingMode(text: string): "first" | "exact" | null {
  if (/first\s+to|race\s+to|先(?:到|得)/i.test(text)) return "first";
  if (/exactly|总共|一共|打完|回合|rallies/i.test(text)) return "exact";
  return null;
}

function titleFromInput(text: string): string {
  const cleaned = text
    .replace(/^(?:i want to|i'd like to|let's|can we|create|我想|我要|帮我|来一个|发起)\s*/i, "")
    .replace(/[。.!！]+$/, "")
    .trim();
  return (cleaned || "Friend challenge").slice(0, 100);
}

function isPhysical(text: string): boolean {
  return SHORT_SCORED_SPORT.test(text) || /push[- ]?ups?|plank|run|sprint|squat|basketball|soccer|golf|俯卧撑|平板支撑|跑步|短跑|深蹲|篮球|足球/i.test(text);
}

function isClearCompetition(text: string): boolean {
  return /\b(?:challenge|versus|vs\.?|who|first|faster|more|most|highest|beat|race)\b|挑战|比赛|对战|谁|先|更快|更多|最高|赢|胜负|比一比/i.test(text);
}

export function isExplicitPublishIntent(message: string): boolean {
  const text = extractUserText(message).trim();
  return /^(?:publish|publish it|create it|send it|looks good|就这样|发布|确认发布|发出去|创建吧|生成吧)[。.!！\s]*$/i.test(text);
}

export function buildDeterministicAgentResponse(message: string, previous: DraftState): RawAgentResponse {
  const userText = extractUserText(message);
  const chinese = hasChinese(userText);
  const settings = extractSettings(message, previous);

  if (isExplicitPublishIntent(message)) {
    const normalized = normalizeDraftState(previous);
    if (!normalized.readyToPublish) {
      return { userVisibleReply: draftIssueQuestion(normalized, chinese), agentAction: "ask_followup", draftPatch: { readyToPublish: false }, toolName: null, toolArgs: null };
    }
    return {
      userVisibleReply: chinese ? "正在发布这个 Quest。" : "Publishing this quest now.",
      agentAction: "call_tool",
      draftPatch: {},
      toolName: "createChallenge",
      toolArgs: {},
    };
  }

  if (MOOD_OR_GREETING.test(userText)) {
    return {
      userVisibleReply: chinese ? "你想和朋友比什么？说一个能看见胜负的目标，我来补全规则。" : "What do you want to compete on with a friend? Give me one observable goal and I'll build the rules.",
      agentAction: "ask_followup", draftPatch: {}, toolName: null, toolArgs: null,
    };
  }
  if (UNJUDGEABLE.test(userText)) {
    return {
      userVisibleReply: chinese ? "这个没有客观胜负标准。换成能用时间、次数、得分或完成结果判断的挑战吧。" : "That has no objective win condition. Make it measurable by time, count, score, or completion.",
      agentAction: "refuse_or_redirect", draftPatch: { readyToPublish: false }, toolName: null, toolArgs: null,
    };
  }
  if (UNSAFE.test(userText)) {
    return {
      userVisibleReply: chinese ? "这个玩法有受伤风险，我不能把它发布成挑战。可以改成安全的非酒精、非接触版本。" : "That version has a meaningful injury risk, so I can't publish it. We can switch to a safe, non-alcohol, non-contact version.",
      agentAction: "refuse_or_redirect", draftPatch: { safetyNotes: ["Unsafe version blocked; use a non-alcohol, non-contact alternative."], readyToPublish: false }, toolName: null, toolArgs: null,
    };
  }

  const sport = sportName(`${userText} ${previous.title ?? ""}`);
  if (sport) {
    const count = countFromText(userText) ?? countFromText(scoredSportText(previous));
    const mode = stoppingMode(userText) ?? stoppingMode(previous.judgeRule ?? "");
    const title = count
      ? (chinese ? `${count}球${sport}好友赛` : `${sport} ${count}-point friend match`)
      : titleFromInput(userText);
    const common = {
      title,
      participants: settings.participants,
      stake: settings.stake,
      stakeType: settings.stake === 0 ? "none" as const : "credits" as const,
      evidenceType: "video" as const,
      timeWindow: settings.timeWindow,
    };

    if (!count || !mode) {
      const partial = normalizeDraftState({ ...previous, ...common, proposition: count ? `${sport} short match with ${count} points/rallies; scoring format pending` : `${sport} friend match; scoring format pending`, judgeRule: null });
      return {
        userVisibleReply: count
          ? draftIssueQuestion(partial, chinese)
          : (chinese ? "这局是先到几分，还是固定打几个回合？" : "Is this first to how many points, or a fixed number of rallies?"),
        agentAction: "ask_followup",
        draftPatch: partial,
        toolName: null,
        toolArgs: null,
      };
    }

    const proposition = mode === "first"
      ? (chinese ? `先得到 ${count} 分的选手获胜` : `The first player to ${count} points wins`)
      : (chinese ? `固定打完 ${count} 个回合，得分更高的选手获胜` : `Exactly ${count} rallies; the player with the higher score wins`);
    const stoppingRule = mode === "first" ? `First player to ${count} points.` : `Exactly ${count} rallies; higher score wins.`;
    const judgeRule = `${stoppingRule} Before play, both friends identify Participant A and Participant B on camera by shirt color or starting court side. Submit one continuous stable full-court video with no cuts. The Familiar starts at 0-0, returns only each visible rally winner, and code derives the running score. A scoreboard and spoken score are optional, never required. Any unclear rally or identity yields no winner for that rally and requires review instead of a guess.`;
    const complete = normalizeDraftState({ ...previous, ...common, proposition, judgeRule });
    return {
      userVisibleReply: chinese ? "规则已经补全：连续视频即可，不需要记分牌；AI 只判每个回合赢家，系统累计比分。确认后可以发布。" : "The rules are complete: one continuous video, no scoreboard required, and the system derives the score from each rally winner. Ready to publish.",
      agentAction: "show_draft",
      draftPatch: complete,
      toolName: null,
      toolArgs: null,
    };
  }

  if (!isClearCompetition(userText)) {
    return {
      userVisibleReply: chinese ? "这句话还没有可判定的胜负条件。谁和谁比、比什么结果？" : "That sentence does not yet contain a judgeable win condition. Who is competing, and what result wins?",
      agentAction: "ask_followup", draftPatch: { readyToPublish: false }, toolName: null, toolArgs: null,
    };
  }

  const evidenceType: DraftState["evidenceType"] = /screenshot|photo|picture|截图|照片/i.test(userText)
    ? "photo"
    : isPhysical(userText) ? "video" : "text";
  const title = titleFromInput(userText);
  const proposition = userText.slice(0, 500);
  const judgeRule = evidenceType === "video"
    ? `Both participants submit one continuous, uncut video showing the full attempt and a visible Participant A/B identity. The Familiar compares only the observable result described in "${proposition}". If the decisive moment or identity is unclear, no winner is guessed and the result goes to review.`
    : `Both participants submit attributable proof of the result described in "${proposition}". The Familiar checks the same measurable win condition for both sides. Missing, conflicting, or unclear proof yields no winner and requires review.`;
  const complete = normalizeDraftState({
    ...previous,
    title,
    proposition,
    participants: settings.participants,
    stake: settings.stake,
    evidenceType,
    judgeRule,
    timeWindow: settings.timeWindow,
  });
  return {
    userVisibleReply: chinese ? "我已经把胜负、证明、时间和积分整理成草稿。检查一下，确认后直接发布。" : "I turned the win condition, proof, timing, and credits into a complete draft. Review it, then publish.",
    agentAction: complete.readyToPublish ? "show_draft" : "ask_followup",
    draftPatch: complete,
    toolName: null,
    toolArgs: null,
  };
}
