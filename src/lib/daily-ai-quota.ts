import prisma from "./db";

export type DailyAiQuotaKind = "spec" | "judge" | "video_judge" | "transcribe";

export interface DailyAiQuotaBucket {
  used: number;
  limit: number;
  remaining: number;
}

export interface DailyAiQuotaStatus {
  dateKey: string;
  resetsAt: string;
  spec: DailyAiQuotaBucket;
  judge: DailyAiQuotaBucket;
  videoJudge: DailyAiQuotaBucket;
  transcribe: DailyAiQuotaBucket;
}

const DEFAULT_SPEC_LIMIT = 10;
const DEFAULT_JUDGE_LIMIT = 3;
const DEFAULT_VIDEO_JUDGE_LIMIT = 2;
const DEFAULT_TRANSCRIBE_LIMIT = 20;

function intEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

export function dailyAiQuotaLimits() {
  return {
    spec: intEnv("BETA_DAILY_SPEC_LIMIT", DEFAULT_SPEC_LIMIT),
    judge: intEnv("BETA_DAILY_JUDGE_LIMIT", DEFAULT_JUDGE_LIMIT),
    videoJudge: intEnv("BETA_DAILY_VIDEO_JUDGE_LIMIT", DEFAULT_VIDEO_JUDGE_LIMIT),
    transcribe: intEnv("BETA_DAILY_TRANSCRIBE_LIMIT", DEFAULT_TRANSCRIBE_LIMIT),
  };
}

function dateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function nextUtcMidnight(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

function bucket(used: number, limit: number): DailyAiQuotaBucket {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

function quotaField(kind: DailyAiQuotaKind) {
  if (kind === "spec") return "specUsed" as const;
  if (kind === "video_judge") return "videoJudgeUsed" as const;
  if (kind === "transcribe") return "transcribeUsed" as const;
  return "judgeUsed" as const;
}

function quotaLimit(kind: DailyAiQuotaKind) {
  const limits = dailyAiQuotaLimits();
  if (kind === "spec") return limits.spec;
  if (kind === "video_judge") return limits.videoJudge;
  if (kind === "transcribe") return limits.transcribe;
  return limits.judge;
}

async function ensureQuotaRow(userId: string, key = dateKey()) {
  return prisma.userDailyQuota.upsert({
    where: { userId_dateKey: { userId, dateKey: key } },
    update: {},
    create: { userId, dateKey: key },
  });
}

export async function getDailyAiQuotaStatus(userId: string): Promise<DailyAiQuotaStatus> {
  const key = dateKey();
  const row = await ensureQuotaRow(userId, key);
  const limits = dailyAiQuotaLimits();
  return {
    dateKey: key,
    resetsAt: nextUtcMidnight(),
    spec: bucket(row.specUsed, limits.spec),
    judge: bucket(row.judgeUsed, limits.judge),
    videoJudge: bucket(row.videoJudgeUsed, limits.videoJudge),
    transcribe: bucket(row.transcribeUsed, limits.transcribe),
  };
}

export async function spendDailyAiQuota(
  userId: string,
  kind: DailyAiQuotaKind,
): Promise<{ ok: true; status: DailyAiQuotaStatus } | { ok: false; status: DailyAiQuotaStatus; error: string; retryAt: string }> {
  const key = dateKey();
  const field = quotaField(kind);
  const limit = quotaLimit(kind);
  await ensureQuotaRow(userId, key);

  const result = await prisma.userDailyQuota.updateMany({
    where: {
      userId,
      dateKey: key,
      [field]: { lt: limit },
    },
    data: { [field]: { increment: 1 } },
  });

  const status = await getDailyAiQuotaStatus(userId);
  if (result.count > 0) return { ok: true, status };

  const retryAt = status.resetsAt;
  const label =
    kind === "spec" ? "AI draft generations" :
    kind === "video_judge" ? "video AI verdicts" :
    kind === "transcribe" ? "voice transcriptions" :
    "AI verdicts";
  return {
    ok: false,
    status,
    retryAt,
    error: `Daily beta limit reached for ${label}. It resets at ${retryAt}.`,
  };
}

export async function refundDailyAiQuota(userId: string, kind: DailyAiQuotaKind) {
  const key = dateKey();
  const field = quotaField(kind);
  await prisma.userDailyQuota.updateMany({
    where: { userId, dateKey: key, [field]: { gt: 0 } },
    data: { [field]: { decrement: 1 } },
  });
  return getDailyAiQuotaStatus(userId);
}
