import prisma from "@/lib/db";
import type { LlmCallMetadata } from "@/lib/llm-router";

type LogAiUsageInput = {
  userId?: string | null;
  challengeId?: string | null;
  route: string;
  metadata?: LlmCallMetadata | null;
  extra?: Record<string, unknown>;
};

export async function logAiUsage(input: LogAiUsageInput) {
  const metadata = input.metadata;
  if (!metadata) return null;
  try {
    return await prisma.aiUsageLog.create({
      data: {
        userId: input.userId ?? null,
        challengeId: input.challengeId ?? null,
        route: input.route,
        providerId: metadata.providerId,
        model: metadata.responseModel || metadata.model,
        requestKind: metadata.requestKind,
        inputTokens: metadata.inputTokens ?? null,
        outputTokens: metadata.outputTokens ?? null,
        totalTokens: metadata.totalTokens ?? null,
        imageCount: metadata.imageCount ?? null,
        estimatedCostUsd: metadata.estimatedCostUsd ?? null,
        durationMs: metadata.durationMs ?? null,
        responseId: metadata.responseId ?? null,
        metadataJson: JSON.stringify({ ...metadata, ...(input.extra ?? {}) }),
      },
    });
  } catch (error) {
    console.error("[ai-usage-log] failed", {
      route: input.route,
      providerId: metadata.providerId,
      model: metadata.model,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
