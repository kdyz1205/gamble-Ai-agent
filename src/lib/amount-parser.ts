/**
 * Unified amount parser — single source of truth.
 * Every part of the system uses this, no more scattered regex.
 */

export const CREDITS_PER_USD = 100;

export interface ParsedAmount {
  credits: number;
  originalText: string;
  unit: "credits" | "usd" | "ambiguous";
  needsConfirmation: boolean;
  confirmationPrompt?: string;
}

/**
 * Parse an amount from natural language input.
 * Returns structured result with ambiguity flag.
 */
export function parseAmount(input: string): ParsedAmount | null {
  const s = input.toLowerCase().trim();

  // ── Credits (explicit) ──
  const creditMatch = s.match(/(\d+(?:\.\d+)?)\s*(?:credits?|cr|点数?|积分|筹码)/i);
  if (creditMatch) {
    return {
      credits: Math.round(parseFloat(creditMatch[1])),
      originalText: creditMatch[0],
      unit: "credits",
      needsConfirmation: false,
    };
  }

  // ── USD (explicit) ──
  // $10, 10 usd, 10 dollar(s), 10美金, 10美元, 10u, 10 usdt
  const usdPatterns = [
    /\$(\d+(?:\.\d+)?)/,
    /(\d+(?:\.\d+)?)\s*(?:dollars?|usd|usdt|美金|美元)\b/i,
    /(\d+(?:\.\d+)?)\s*u\b/i, // "10u" — common crypto slang
  ];

  for (const pattern of usdPatterns) {
    const match = s.match(pattern);
    if (match) {
      const usd = parseFloat(match[1]);
      const credits = Math.round(usd * CREDITS_PER_USD);
      return {
        credits,
        originalText: match[0],
        unit: "usd",
        needsConfirmation: credits > 2000, // confirm if > $20 equivalent
        confirmationPrompt: credits > 2000
          ? `$${usd} = ${credits} credits. Confirm?`
          : undefined,
      };
    }
  }

  // ── Ambiguous (requires confirmation) ──
  // 块, 元, 刀, bare numbers
  const ambiguousPatterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:块|元|刀|人民币|cny|rmb)\b/i, type: "cny" as const },
    { regex: /(\d+(?:\.\d+)?)\s*(?:dollar\s*credit|刀\s*credit)/i, type: "mixed" as const },
  ];

  for (const { regex, type } of ambiguousPatterns) {
    const match = s.match(regex);
    if (match) {
      const num = parseFloat(match[1]);
      return {
        credits: Math.round(num), // conservative: treat as credits until confirmed
        originalText: match[0],
        unit: "ambiguous",
        needsConfirmation: true,
        confirmationPrompt: type === "cny"
          ? `"${match[0]}" — did you mean ${Math.round(num)} credits or ¥${num}?`
          : `"${match[0]}" — did you mean ${Math.round(num)} credits or $${num} (=${Math.round(num * CREDITS_PER_USD)} credits)?`,
      };
    }
  }

  // ── Bare number at the end (no unit) → ambiguous ──
  const bareNumber = s.match(/\b(\d+(?:\.\d+)?)\s*$/);
  if (bareNumber && parseFloat(bareNumber[1]) > 0) {
    const num = parseFloat(bareNumber[1]);
    if (num <= 10000) { // sanity check
      return {
        credits: Math.round(num),
        originalText: bareNumber[0],
        unit: "ambiguous",
        needsConfirmation: true,
        confirmationPrompt: `"${Math.round(num)}" — is that ${Math.round(num)} credits or $${Math.round(num)}?`,
      };
    }
  }

  return null; // no amount found → free challenge
}

/**
 * Normalize transcript before parsing.
 * Cleans up voice recognition artifacts.
 */
export function normalizeTranscript(raw: string): string {
  let s = raw.trim();

  // Collapse multiple spaces
  s = s.replace(/\s+/g, " ");

  // Normalize currency words
  s = s.replace(/\bdollar\s+credits?\b/gi, "dollars");
  s = s.replace(/\b刀\s*credits?\b/gi, "刀");
  s = s.replace(/\b块\s*credits?\b/gi, "块");

  // Normalize number words
  s = s.replace(/\bten\b/gi, "10");
  s = s.replace(/\btwenty\b/gi, "20");
  s = s.replace(/\bfifty\b/gi, "50");
  s = s.replace(/\bhundred\b/gi, "100");
  s = s.replace(/\bthousand\b/gi, "1000");

  // Chinese number normalization
  s = s.replace(/十/g, "10");
  s = s.replace(/二十/g, "20");
  s = s.replace(/五十/g, "50");
  s = s.replace(/一百/g, "100");

  // Normalize punctuation
  s = s.replace(/，/g, ",");
  s = s.replace(/。/g, ".");
  s = s.replace(/：/g, ":");

  return s;
}
