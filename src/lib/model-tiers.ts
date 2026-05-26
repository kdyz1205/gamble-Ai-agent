/**
 * AI cost tier definitions - no blockchain dependencies.
 * Names are provider-neutral because runtime routing can use OpenAI,
 * Anthropic, Google, Kimi, DeepSeek, or a local model.
 */
export const MODEL_TIERS = {
  LIGHT: { id: 1, name: "Light", model: "claude-haiku-4-5-20251001", priceUsd: 0.01 },
  PRO: { id: 2, name: "Pro", model: "claude-sonnet-4-6", priceUsd: 0.05 },
  MAX: { id: 3, name: "Max", model: "claude-opus-4-7", priceUsd: 0.25 },
} as const;

export type TierName = keyof typeof MODEL_TIERS;
export type TierId = 1 | 2 | 3;

export function tierById(id: TierId) {
  return Object.values(MODEL_TIERS).find((t) => t.id === id)!;
}

export function tierByName(name: string): (typeof MODEL_TIERS)[TierName] | undefined {
  const legacy: Record<string, TierName> = {
    HAIKU: "LIGHT",
    SONNET: "PRO",
    OPUS: "MAX",
  };
  const key = name.toUpperCase() as TierName;
  return MODEL_TIERS[key] ?? MODEL_TIERS[legacy[name.toUpperCase()]];
}
