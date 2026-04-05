# Phase 1: The Pitch — Natural Language Challenge Creation & Stake Locking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the challenge creation flow so a user types one sentence, AI parses it into a fully structured challenge, the user reviews/edits in an elegant draft card, and credits are locked atomically before publishing.

**Architecture:** CenteredComposer captures input with rotating placeholder education + magic wand indicator -> parse API with hardened prompt + Zod validation + graceful 400 fallback -> DraftPanel becomes an editable form with rules highlight -> publish button does pre-flight balance check then atomic credit lock + DB write -> success animation + route to challenge room.

**Tech Stack:** React 19, Next.js 16, Framer Motion 12, Zod, Prisma, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/components/CenteredComposer.tsx` | Rotating placeholder, magic wand icon at 5+ chars, loading state with breathing animation |
| Modify | `src/components/DraftPanel.tsx` | Convert read-only card to editable form; red rules highlight with info tooltip |
| Modify | `src/lib/parse-bet-schema.ts` | Add `currency` field, tighten Zod schema, add `durationMinutes` |
| Modify | `src/lib/ai-engine.ts` | Harden system prompt to "bookmaker precision"; add `currency`, `durationMinutes` to output |
| Modify | `src/app/api/challenges/parse/route.ts` | Return 400 with suggestion on garbage input; never 500 |
| Modify | `src/app/api/challenges/route.ts` | Atomic credit lock + DB create in transaction; enforce `open` initial status |
| Modify | `src/app/page.tsx` | Pre-flight balance check before publish; loading states; success animation + route |
| Modify | `src/lib/api-client.ts` | Update `ParsedChallenge` type to include new fields |

---

### Task 1: Harden the Parse Schema (`parse-bet-schema.ts`)

**Files:**
- Modify: `src/lib/parse-bet-schema.ts`

- [ ] **Step 1: Update Zod schema with new fields**

```typescript
// src/lib/parse-bet-schema.ts
import { z } from "zod";

export const betParseJsonSchema = z
  .object({
    title: z.string().max(64),
    type: z.enum(["Fitness", "Cooking", "Coding", "Learning", "Games", "Video", "General"]),
    suggestedStake: z.number().int().min(0).max(1_000_000_000),
    currency: z.enum(["USDC", "ETH", "USDT", "credits"]).default("credits"),
    evidenceType: z.enum(["video", "photo", "gps", "self_report"]),
    rules: z.string().max(8000),
    deadline: z.string().max(128),
    durationMinutes: z.number().int().min(1).max(525600).default(2880), // default 48h
    isPublic: z.boolean(),
    judgingMethod: z.enum(["vision", "api", "hybrid"]),
  })
  .strict();

export type BetParseJson = z.infer<typeof betParseJsonSchema>;

export function safeParseBetDraft(raw: unknown): BetParseJson | null {
  const r = betParseJsonSchema.safeParse(raw);
  return r.success ? r.data : null;
}
```

- [ ] **Step 2: Verify no other files break**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors related to `BetParseJson` or `safeParseBetDraft`

- [ ] **Step 3: Commit**

```bash
git add src/lib/parse-bet-schema.ts
git commit -m "feat(parse): add currency and durationMinutes to bet parse schema"
```

---

### Task 2: Harden AI Parse Prompt & Types (`ai-engine.ts`)

**Files:**
- Modify: `src/lib/ai-engine.ts` (lines 28-39 ParsedChallenge interface, lines 67-108 parseChallenge function)

- [ ] **Step 1: Update `ParsedChallenge` interface**

Add `currency` and `durationMinutes` fields to match the new schema:

```typescript
// In src/lib/ai-engine.ts, update the ParsedChallenge interface (around line 29)
export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  currency: "USDC" | "ETH" | "USDT" | "credits";
  evidenceType: string;
  rules: string;
  deadline: string;
  durationMinutes: number;
  isPublic: boolean;
  judgingMethod: JudgingMethod;
}
```

- [ ] **Step 2: Rewrite system prompt in `parseChallenge()`**

Replace the system prompt (around line 78) with the hardened bookmaker version:

```typescript
const system = `You are a professional betting actuary. Your job is to convert casual spoken bets into precise smart-contract parameters. Be exhaustive in your rules — leave zero room for dispute.

RULES FOR PARSING:
- If user doesn't specify an amount, set suggestedStake to 0.
- If user doesn't specify currency, default to "credits".
- Currency mapping: "$5" or "5U" or "5USDC" → currency:"USDC", suggestedStake:5. "10 credits" → currency:"credits", suggestedStake:10.
- If no duration stated, infer from common sense: spotting a car color = 60 min, a fitness rep challenge = 10 min, weight loss = 43200 min (30 days), a sports game = 180 min.
- Rules MUST be exhaustive judgment boundaries. Examples: "Video must be continuous and uncut. Pushups must show full extension and chest touching ground. Counter starts at first rep." or "Car body must be >50% red by visible surface area. Taxis and emergency vehicles excluded."
- evidenceType: "video" for anything requiring motion proof, "photo" for static proof, "gps" for location-based, "self_report" only if nothing else fits.

Return ONLY valid JSON:
{
  "title": "string (max 64 chars, concise)",
  "type": "Fitness|Cooking|Coding|Learning|Games|Video|General",
  "suggestedStake": 0,
  "currency": "credits|USDC|ETH|USDT",
  "evidenceType": "video|photo|gps|self_report",
  "rules": "exhaustive judgment boundaries string",
  "deadline": "human string like '48 hours' or '7 days'",
  "durationMinutes": 2880,
  "isPublic": true,
  "judgingMethod": "vision|api|hybrid"
}`;
```

- [ ] **Step 3: Update `normalizeParsedChallenge()` to include new fields**

```typescript
// Around line 368
function normalizeParsedChallenge(raw: Record<string, unknown>): ParsedChallenge {
  const evidenceType = String(raw.evidenceType ?? "self_report");
  const judgingSource = raw.judgingMethod ?? raw.judging_method;
  const currencyRaw = String(raw.currency ?? "credits").toLowerCase();
  const currency = (["usdc", "eth", "usdt", "credits"].includes(currencyRaw)
    ? currencyRaw.toUpperCase()
    : "credits") as ParsedChallenge["currency"];
  // Fix casing for credits
  const normalizedCurrency = currency === "CREDITS" ? "credits" : currency;

  return {
    title: String(raw.title ?? "Challenge").slice(0, 64),
    type: String(raw.type ?? "General"),
    suggestedStake: Math.max(0, Math.floor(Number(raw.suggestedStake ?? 0))),
    currency: normalizedCurrency as ParsedChallenge["currency"],
    evidenceType,
    rules: String(raw.rules ?? ""),
    deadline: String(raw.deadline ?? "48 hours"),
    durationMinutes: Math.max(1, Math.floor(Number(raw.durationMinutes ?? 2880))),
    isPublic: raw.isPublic !== false,
    judgingMethod: coerceJudgingMethod(judgingSource, evidenceType),
  };
}
```

- [ ] **Step 4: Update `parseChallengeFallback()` to include new fields**

Add `currency: "credits"` and `durationMinutes: 2880` to the fallback return object.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Clean or only pre-existing errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-engine.ts
git commit -m "feat(parse): harden AI prompt to bookmaker precision, add currency + durationMinutes"
```

---

### Task 3: Graceful Parse API Error Handling (`parse/route.ts`)

**Files:**
- Modify: `src/app/api/challenges/parse/route.ts`

- [ ] **Step 1: Add input validation with friendly error messages**

Replace the catch block and add input quality check before calling AI:

```typescript
// After line 27 (after extracting input), add input quality gate:
    const trimmed = input.trim();
    if (trimmed.length < 4) {
      return Response.json(
        {
          error: "too_short",
          suggestion: "Tell me more! For example: 'I bet 5 credits I can do 30 pushups in 2 minutes'",
        },
        { status: 400 },
      );
    }
```

- [ ] **Step 2: Replace the 502 schema failure with a friendly 400**

```typescript
    // Replace the existing schema validation block (around line 50-56)
    if (!schemaOk) {
      return Response.json(
        {
          error: "parse_unclear",
          suggestion: "I couldn't quite understand that as a challenge. Try something like: 'Bet 10 credits the next car is red' or 'Challenge: 50 pushups in 2 min'",
        },
        { status: 400 },
      );
    }
```

- [ ] **Step 3: Replace the 500 catch with a user-friendly fallback**

```typescript
  } catch (err) {
    console.error("Parse error:", err);
    return Response.json(
      {
        error: "parse_failed",
        suggestion: "Something went wrong parsing your challenge. Try rephrasing — for example: 'I bet I can run 5km in under 30 min'",
      },
      { status: 400 },
    );
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/challenges/parse/route.ts
git commit -m "fix(parse): graceful 400 errors with suggestions instead of 500/502"
```

---

### Task 4: CenteredComposer — Rotating Placeholder + Magic Wand + Loading State

**Files:**
- Modify: `src/components/CenteredComposer.tsx`

- [ ] **Step 1: Add Chinese + English rotating placeholders**

Replace the existing `SUGGESTIONS` array (line 12-17):

```typescript
const PLACEHOLDER_HINTS = [
  "I bet 5 credits I can do 30 pushups in 2 min",
  "Bet 10U the next car outside is red",
  "Challenge: who can cook better pasta, video proof",
  "I bet my friend can't solve this LeetCode in 15 min",
  "Race to finish reading Chapter 5 — loser buys coffee",
  "Wager 20 credits on tonight's Lakers game",
];
```

- [ ] **Step 2: Add magic wand state and visual indicator**

After the existing state declarations (around line 48-53), add:

```typescript
const [showWand, setShowWand] = useState(false);

// Update onChange handler — show wand when input > 5 chars
const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
  const val = e.target.value;
  setInput(val);
  setShowWand(val.trim().length >= 5);
};
```

- [ ] **Step 3: Add parsing loading state prop**

Update the Props interface:

```typescript
interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean; // new — shows breathing loading animation
}
```

- [ ] **Step 4: Render magic wand icon next to header when showWand is true**

In the header row (around line 235-250), after the "AI Challenge Creator" label, add:

```tsx
{showWand && !isActive && (
  <motion.span
    initial={{ opacity: 0, scale: 0.5, rotate: -30 }}
    animate={{ opacity: 1, scale: 1, rotate: 0 }}
    className="ml-1.5 text-sm"
    title="AI is ready to parse your challenge"
  >
    &#10024;
  </motion.span>
)}
```

- [ ] **Step 5: Add parsing overlay inside the card**

Before the textarea (inside the card div, around line 252), add the parsing overlay:

```tsx
{/* Parsing overlay */}
<AnimatePresence>
  {isParsing && (
    <motion.div
      className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl"
      style={{ background: "rgba(6,6,15,0.92)", backdropFilter: "blur(8px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-teal flex items-center justify-center mb-4"
        animate={{
          scale: [1, 1.1, 1],
          boxShadow: [
            "0 0 20px rgba(124,92,252,0.3)",
            "0 0 40px rgba(124,92,252,0.6)",
            "0 0 20px rgba(124,92,252,0.3)",
          ],
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </motion.div>
      <motion.p
        className="text-sm font-bold text-text-secondary"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        AI is structuring your challenge...
      </motion.p>
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 6: Wire up the onChange and use rotating placeholder**

Replace `onChange={e => setInput(e.target.value)}` with `onChange={handleInputChange}` on the textarea.

Update the placeholder to use PLACEHOLDER_HINTS:

```tsx
placeholder={isActive ? "Continue the conversation..." : PLACEHOLDER_HINTS[hintIdx]}
```

Update the hint rotation to use `PLACEHOLDER_HINTS`:

```typescript
useEffect(() => {
  if (isActive) return;
  const id = setInterval(() => setHintIdx(i => (i + 1) % PLACEHOLDER_HINTS.length), 4500);
  return () => clearInterval(id);
}, [isActive]);
```

- [ ] **Step 7: Disable input when parsing**

Add `disabled={isParsing}` to the textarea and make the send button disabled during parsing.

- [ ] **Step 8: Commit**

```bash
git add src/components/CenteredComposer.tsx
git commit -m "feat(composer): rotating placeholders, magic wand indicator, parsing overlay"
```

---

### Task 5: DraftPanel — Editable Form with Rules Highlight

**Files:**
- Modify: `src/components/DraftPanel.tsx`

- [ ] **Step 1: Update ChallengeDraft interface and Props**

```typescript
export interface ChallengeDraft {
  title: string;
  playerA: string;
  playerB: string | null;
  type: string;
  stake: number;
  currency: string;
  deadline: string;
  durationMinutes: number;
  rules: string;
  evidence: string;
  aiReview: boolean;
  isPublic: boolean;
}

interface Props {
  draft: ChallengeDraft;
  onPublish: (editedDraft: ChallengeDraft) => void; // now receives the edited draft
  onEdit: () => void;
}
```

- [ ] **Step 2: Add local editable state inside DraftPanel**

```typescript
export default function DraftPanel({ draft, onPublish, onEdit }: Props) {
  const [editDraft, setEditDraft] = useState<ChallengeDraft>(draft);
  const colors = TYPE_COLORS[editDraft.type] ?? TYPE_COLORS.General;
  const hasStake = editDraft.stake > 0;

  // Sync when parent draft changes
  useEffect(() => {
    setEditDraft(draft);
  }, [draft]);

  const updateField = <K extends keyof ChallengeDraft>(key: K, value: ChallengeDraft[K]) => {
    setEditDraft(prev => ({ ...prev, [key]: value }));
  };
```

Add `useState` and `useEffect` to imports.

- [ ] **Step 3: Make title editable (inline edit)**

Replace the title `<h3>` (around line 152) with an editable input:

```tsx
<input
  type="text"
  value={editDraft.title}
  onChange={e => updateField("title", e.target.value)}
  maxLength={64}
  className="text-lg font-extrabold text-text-primary leading-snug bg-transparent border-b border-transparent hover:border-border-subtle focus:border-accent focus:outline-none transition-colors w-full"
/>
```

- [ ] **Step 4: Make stake editable (clickable number input)**

Replace the stake display (around line 155-177) with an editable version:

```tsx
<motion.div
  className="flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl"
  style={{
    background: hasStake ? "rgba(245,166,35,0.08)" : "rgba(0,212,200,0.08)",
    border: hasStake ? "1px solid rgba(245,166,35,0.18)" : "1px solid rgba(0,212,200,0.18)",
  }}
>
  <span className="text-[9px] font-bold uppercase tracking-wider"
        style={{ color: hasStake ? "#f5a623" : "#00d4c8" }}>
    Stake
  </span>
  <input
    type="number"
    min={0}
    value={editDraft.stake}
    onChange={e => updateField("stake", Math.max(0, parseInt(e.target.value) || 0))}
    className="w-16 text-xl font-black text-center bg-transparent border-b border-transparent hover:border-border-subtle focus:border-accent focus:outline-none transition-colors"
    style={{ color: hasStake ? "#f5a623" : "#00d4c8" }}
  />
  {hasStake && (
    <span className="text-[8px] font-bold uppercase tracking-wider mt-0.5"
          style={{ color: "rgba(245,166,35,0.5)" }}>
      credits
    </span>
  )}
</motion.div>
```

- [ ] **Step 5: Highlight rules with red/amber warning block + info tooltip**

Replace the rules `InfoCell` in the grid (around line 212) with a prominent rules block below the grid:

```tsx
{/* Rules highlight block — separate from grid for emphasis */}
<motion.div
  className="mb-5 px-4 py-3.5 rounded-xl relative"
  style={{
    background: "rgba(245,166,35,0.06)",
    border: "1px solid rgba(245,166,35,0.2)",
  }}
  variants={childVariants}
>
  <div className="flex items-center gap-2 mb-2">
    {INFO_ICONS.Rules}
    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-400">
      Judgment Rules
    </span>
    <div className="group relative ml-1">
      <span className="cursor-help text-amber-400/60 text-xs">&#9432;</span>
      <div className="absolute bottom-full left-0 mb-1 px-3 py-2 rounded-lg text-[11px] text-text-secondary w-56 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30"
           style={{ background: "rgba(13,13,30,0.98)", border: "1px solid rgba(245,166,35,0.2)" }}>
        AI judge will decide strictly based on these rules. Be as specific as possible.
      </div>
    </div>
  </div>
  <textarea
    value={editDraft.rules}
    onChange={e => updateField("rules", e.target.value)}
    rows={3}
    className="w-full text-sm font-bold text-amber-200 bg-transparent resize-none focus:outline-none leading-relaxed"
    style={{ caretColor: "#f5a623" }}
  />
</motion.div>
```

Remove the `Rules` entry from the InfoCell grid (keep only Deadline, Evidence, Judgment in the 2x2 grid, or make it a 3-column single row).

- [ ] **Step 6: Make deadline editable in InfoCell**

Convert the Deadline InfoCell into an input:

```tsx
<motion.div className="grid grid-cols-3 gap-2.5 mb-5" variants={childVariants}>
  <div className="relative flex flex-col gap-1.5 px-3.5 py-3 rounded-xl"
       style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
    <div className="flex items-center gap-1.5 text-text-muted">
      {INFO_ICONS.Deadline}
      <span className="text-[9px] font-bold uppercase tracking-[0.12em]">Deadline</span>
    </div>
    <input
      type="text"
      value={editDraft.deadline}
      onChange={e => updateField("deadline", e.target.value)}
      className="text-sm font-bold text-text-primary bg-transparent border-b border-transparent hover:border-border-subtle focus:border-accent focus:outline-none transition-colors"
    />
  </div>
  <InfoCell icon="&#128248;" label="Evidence" value={editDraft.evidence} />
  <InfoCell icon="&#129302;" label="Judgment" value={editDraft.aiReview ? "AI Review" : "Manual"} />
</motion.div>
```

- [ ] **Step 7: Update publish button to pass edited draft**

```tsx
<motion.button
  onClick={() => onPublish(editDraft)}
  // ... rest of button props unchanged
>
  Publish Challenge{hasStake ? ` (${editDraft.stake} credits)` : ""}
</motion.button>
```

- [ ] **Step 8: Commit**

```bash
git add src/components/DraftPanel.tsx
git commit -m "feat(draft): editable form fields, rules highlight with AI judge warning"
```

---

### Task 6: Pre-flight Balance Check & Atomic Publish (`page.tsx`)

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `isParsing` state and pass to CenteredComposer**

```typescript
// Add to state declarations (around line 113)
const [isParsing, setIsParsing] = useState(false);
```

Update `handleInitialSubmit` to set parsing state:

```typescript
const handleInitialSubmit = useCallback(async (input: string) => {
  setOrigInput(input);
  pushMsg("user", input);
  setAppState("clarifying");

  if (user) {
    try {
      setIsParsing(true);
      setIsTyping(true);
      const prefs = readOracleLlmPrefs();
      const res = await api.parseChallenge(input, 1, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      setIsParsing(false);
      setIsTyping(false);
      // ... rest unchanged
    } catch (err) {
      setIsParsing(false);
      setIsTyping(false);
      // Handle parse API 400 errors with suggestion
      if (err instanceof Error && err.message) {
        pushMsg("ai", err.message);
      } else {
        pushMsg("ai", "I couldn't parse that. Try something like: 'Bet 5 credits I can do 30 pushups in 2 min'");
      }
      setAppState("idle");
      return;
    }
  }
  // ... fallback flow unchanged
}, [pushMsg, aiReply, user]);
```

Pass `isParsing` to CenteredComposer:

```tsx
<CenteredComposer
  onSubmit={active ? handleFollowUp : handleInitialSubmit}
  isActive={active}
  isParsing={isParsing}
/>
```

- [ ] **Step 2: Update `handlePublish` with pre-flight balance check**

```typescript
const handlePublish = useCallback(async (editedDraft?: ChallengeDraft) => {
  if (!user) {
    setShowAuth(true);
    return;
  }

  const finalDraft = editedDraft ?? draft;
  if (!finalDraft) return;

  // Pre-flight balance check
  if (finalDraft.stake > 0) {
    const currentCredits = user.credits ?? 0;
    if (currentCredits < finalDraft.stake) {
      pushMsg("ai", `Insufficient credits. You need ${finalDraft.stake} credits but have ${currentCredits}. Please top up first.`);
      return;
    }
  }

  try {
    setIsTyping(true);
    const res = await api.createChallenge({
      title: finalDraft.title,
      type: finalDraft.type,
      stake: finalDraft.stake,
      deadline: finalDraft.deadline,
      rules: finalDraft.rules,
      evidenceType: finalDraft.evidence.toLowerCase().replace(/ /g, "_"),
      aiReview: finalDraft.aiReview,
      isPublic: finalDraft.isPublic,
    });
    setChallengeId(res.challenge.id);
    setIsTyping(false);
    await updateSession(); // refresh credits in header
  } catch (err) {
    setIsTyping(false);
    pushMsg("ai", `Failed to publish: ${err instanceof Error ? err.message : "Unknown error"}. You can try again.`);
    return;
  }

  setPublished(true);
  setAppState("live");
  aiReply(
    "Your challenge is **live**! Use the command panel below to submit evidence. When both sides are in, tap **Run AI verdict** to let the AI judge and settle credits.",
    ["View Live Activity", "Challenge Another"],
    1200,
  );
}, [aiReply, draft, user, pushMsg, updateSession]);
```

- [ ] **Step 3: Update DraftPanel onPublish to receive edited draft**

```tsx
<DraftPanel draft={draft} onPublish={handlePublish} onEdit={handleEdit} />
```

- [ ] **Step 4: Update buildDraft to include new fields**

```typescript
function buildDraft(userInput: string, answers: string[]): ChallengeDraft {
  // ... existing logic ...
  return {
    title,
    playerA: "You",
    playerB: answers[0]?.toLowerCase().includes("friend") ? "Friend (invite sent)" : null,
    type, stake,
    currency: "credits",
    deadline: "48 hours",
    durationMinutes: 2880,
    rules: `Standard ${type.toLowerCase()} rules — AI reviewed`,
    evidence, aiReview: true, isPublic,
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(publish): pre-flight balance check, parsing state, atomic publish flow"
```

---

### Task 7: API Client Type Updates (`api-client.ts`)

**Files:**
- Modify: `src/lib/api-client.ts`

- [ ] **Step 1: Update ParsedChallenge type in api-client**

Find the `ParsedChallenge` or `betDraft` type definition and add `currency` and `durationMinutes`:

```typescript
// Ensure the parseChallenge response type includes the new fields
interface ParseChallengeResponse {
  betDraft: {
    title: string;
    type: string;
    suggestedStake: number;
    stake: number;
    currency: string;
    evidenceType: string;
    rules: string;
    deadline: string;
    durationMinutes: number;
    isPublic: boolean;
    judgingMethod: string;
  };
  confirmationPrompt: string;
  parsed: Record<string, unknown>;
  clarifications: Array<{ question: string; options: string[] }>;
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRemaining: number;
  txHash: string | null;
}
```

- [ ] **Step 2: Update error handling in parseChallenge to surface `suggestion`**

```typescript
export async function parseChallenge(
  input: string,
  tier: 1 | 2 | 3 = 1,
  opts?: { providerId?: string; model?: string },
) {
  const body: Record<string, unknown> = { input, tier };
  if (opts?.providerId) body.providerId = opts.providerId;
  if (opts?.model) body.model = opts.model;

  const res = await fetch("/api/challenges/parse", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.suggestion || data.error || "Failed to parse challenge");
  }

  return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api-client.ts
git commit -m "feat(api-client): update parse types with currency/durationMinutes, surface suggestions"
```

---

### Task 8: Integration Test — Full Pitch Flow

**Files:**
- Manual testing

- [ ] **Step 1: Test the happy path**

1. Open http://localhost:3000
2. Type "I bet 5 credits I can do 30 pushups in 2 minutes"
3. Verify: Rotating placeholder was visible before typing
4. Verify: Magic wand sparkle appears after 5+ characters
5. Verify: Parsing overlay with breathing animation appears on submit
6. Verify: Draft card appears with editable title, stake, rules, deadline
7. Verify: Rules section has amber highlight and info tooltip
8. Edit stake from 5 to 10, verify button updates to "Publish Challenge (10 credits)"
9. Click Publish, verify challenge is created

- [ ] **Step 2: Test error cases**

1. Type "haha" (< 4 chars meaningful) — verify friendly error message in chat
2. Type "lol" — verify no crash, friendly suggestion appears
3. With 0 credits, try to publish a 10-credit challenge — verify pre-flight rejection
4. Log out, type challenge — verify fallback client-side parsing still works

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(phase1): complete pitch flow — parse, edit, pre-flight, publish"
```
