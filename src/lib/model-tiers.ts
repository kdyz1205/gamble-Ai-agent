/**
 * AI Model tier definitions — no blockchain dependencies.
 * Used by auth.ts and other modules that don't need viem.
 */

// Verified against api.anthropic.com — claude-haiku-4-20250414 does NOT exist
// and caused every parse call to silently fall through to the deterministic fallback.
// Use canonical IDs from Anthropic's current model lineup.
export const MODEL_TIERS = {
  HAIKU:  { id: 1, name: "Haiku",  model: "claude-haiku-4-5-20251001",  priceUsd: 0.01 },
  SONNET: { id: 2, name: "Sonnet", model: "claude-sonnet-4-20250514",    priceUsd: 0.05 },
  OPUS:   { id: 3, name: "Opus",   model: "claude-opus-4-20250514",      priceUsd: 0.25 },
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
