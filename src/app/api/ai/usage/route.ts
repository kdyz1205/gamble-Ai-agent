import { getAuthUser, unauthorized } from "@/lib/auth";
import prisma from "@/lib/db";
import { AI_RECEIPT_ACTION, AI_RESERVATION_ACTION } from "@/lib/ai-governance";

export const runtime = "nodejs";

/** Caller-owned usage only. App credits are deliberately not converted to supplier dollars. */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return unauthorized();
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = await prisma.auditLog.findMany({ where: {
    actorUserId: user.userId, createdAt: { gte: since },
    action: { in: [AI_RESERVATION_ACTION, AI_RECEIPT_ACTION] },
  }, orderBy: { createdAt: "asc" } });
  let inputTokens = 0, outputTokens = 0, totalTokens = 0, unknownUsageCalls = 0;
  const receipts = rows.filter((row) => row.action === AI_RECEIPT_ACTION).flatMap((row) => {
    try {
      const payload = JSON.parse(row.payload ?? "null");
      if (!payload || typeof payload !== "object") return [];
      const usage = payload.usage;
      if (!usage || typeof usage.totalTokens !== "number") unknownUsageCalls += 1;
      inputTokens += usage?.inputTokens ?? 0;
      outputTokens += usage?.outputTokens ?? 0;
      totalTokens += usage?.totalTokens ?? 0;
      return [{ id: row.id, challengeId: row.challengeId, createdAt: row.createdAt, ...payload }];
    } catch { unknownUsageCalls += 1; return []; }
  });
  return Response.json({ since, timezone: "UTC", reservedCalls: rows.filter((row) => row.action === AI_RESERVATION_ACTION).length,
    completedCalls: receipts.length, knownUsage: { inputTokens, outputTokens, totalTokens }, unknownUsageCalls,
    billedUsd: null, receipts,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
