import { z } from "zod";

/**
 * Fixed JSON schema for AI parse output (strict — no extra keys).
 * Keep in sync with `ParsedChallenge` in ai-engine / api-client.
 */
export const betParseJsonSchema = z
  .object({
    title: z.string().max(64),
    type: z.enum(["Fitness", "Cooking", "Coding", "Learning", "Games", "Video", "General"]),
    suggestedStake: z.number().int().min(0).max(1_000_000_000),
    currency: z.enum(["USDC", "ETH", "USDT", "credits"]).default("credits"),
    evidenceType: z.enum(["video", "photo", "gps", "self_report"]),
    rules: z.string().max(8000),
    deadline: z.string().max(128),
    durationMinutes: z.number().int().min(1).max(525600).default(2880),
    isPublic: z.boolean(),
    judgingMethod: z.enum(["vision", "api", "hybrid"]),
  })
  .strict();

export type BetParseJson = z.infer<typeof betParseJsonSchema>;

export function safeParseBetDraft(raw: unknown): BetParseJson | null {
  const r = betParseJsonSchema.safeParse(raw);
  return r.success ? r.data : null;
}
