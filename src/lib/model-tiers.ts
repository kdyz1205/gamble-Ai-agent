/**
 * AI Model tier definitions — no blockchain dependencies.
 * Used by auth.ts and other modules that don't need viem.
 */

export const MODEL_TIERS = {
  HAIKU:  { id: 1, name: "Haiku",  model: "claude-haiku-4-20250414",  priceUsd: 0.01 },
  SONNET: { id: 2, name: "Sonnet", model: "claude-sonnet-4-20250514", priceUsd: 0.05 },
  OPUS:   { id: 3, name: "Opus",   model: "claude-sonnet-4-20250514", priceUsd: 0.25 },
} as const;

export type TierName = keyof typeof MODEL_TIERS;
export type TierId = 1 | 2 | 3;

export function tierById(id: TierId) {
  return Object.values(MODEL_TIERS).find(t => t.id === id)!;
}

export function tierByName(name: string): (typeof MODEL_TIERS)[TierName] | undefined {
  const key = name.toUpperCase() as TierName;
  return MODEL_TIERS[key];
}
