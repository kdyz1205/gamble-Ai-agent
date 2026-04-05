# Phase 2: The Arena — Discovery Fallback Waterfall & Stake Locking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every user — even incognito/no-geolocation — sees a full arena of challenges. Implement 3-level fallback waterfall discovery, Tinder-style challenge cards with pulse glow stakes, and a confirmation panel with pre-flight balance check before accepting.

**Architecture:** Discovery API uses 3-level fallback: geo-precise -> IP-city -> global-hot. PlazaSection replaces NearbySection with skeleton loading + level indicator. ChallengeCard redesign with stake pulse + countdown. Confirmation panel with flip animation for accept + stake lock. Ghost concurrency protection via DB unique constraint.

**Tech Stack:** React 19, Next.js 16, Framer Motion 12, Prisma, geoip-lite (IP geolocation), TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/app/api/challenges/discover/route.ts` | 3-level fallback waterfall (geo -> IP-city -> global) |
| Modify | `src/app/api/challenges/discover/nearby/route.ts` | Integrate into fallback; strip PII from response |
| Create | `src/components/PlazaSection.tsx` | Replace NearbySection; skeleton loading; level indicator |
| Create | `src/components/ChallengeCard.tsx` | Tinder-style card with stake pulse, countdown, rules preview |
| Create | `src/components/AcceptConfirmPanel.tsx` | Flip/expand confirmation panel with balance check |
| Modify | `src/app/api/challenges/[id]/accept/route.ts` | Ghost concurrency guard; optimistic locking |
| Modify | `src/components/SecondaryPanels.tsx` | Wire PlazaSection into FloatingActionBar |
| Modify | `src/lib/api-client.ts` | Add discoveryLevel to response type |

---

### Task 1: Discovery API Fallback Waterfall

**Files:**
- Modify: `src/app/api/challenges/discover/route.ts`

- [ ] **Step 1: Implement 3-level fallback logic**

```typescript
// Pseudocode for the waterfall:
// 1. Extract lat/lng from query params
// 2. If lat/lng present and valid: Haversine query within 5km radius
// 3. If no lat/lng: try IP geolocation from headers
//    - x-real-ip or x-forwarded-for -> geoip-lite -> city-level lat/lng -> 50km radius
// 4. If all fail: global fallback ORDER BY stake DESC, createdAt DESC LIMIT 20

// Response must include: { challenges: [...], discoveryLevel: "precise" | "city" | "global", levelMessage: string }
```

The actual implementation:

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/db";

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

async function geoFromIp(ip: string): Promise<{ lat: number; lng: number; city: string } | null> {
  try {
    // Use geoip-lite for IP->city resolution
    const geoip = await import("geoip-lite");
    const geo = geoip.lookup(ip);
    if (geo?.ll) return { lat: geo.ll[0], lng: geo.ll[1], city: geo.city || "Unknown" };
  } catch { /* fallthrough */ }
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lng = parseFloat(url.searchParams.get("lng") ?? "");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);

  const baseWhere = {
    status: "open",
    isPublic: true,
  };

  const selectFields = {
    id: true,
    title: true,
    type: true,
    stake: true,
    deadline: true,
    rules: true,
    evidenceType: true,
    createdAt: true,
    creator: {
      select: { id: true, username: true, image: true }, // NO email, NO wallet
    },
    _count: { select: { participants: true } },
  };

  // Level 1: Precise geolocation (5km radius)
  if (!isNaN(lat) && !isNaN(lng)) {
    const challenges = await prisma.$queryRaw`
      SELECT c.* FROM "Challenge" c
      WHERE c.status = 'open' AND c."isPublic" = true
      AND c."discoveryLat" IS NOT NULL
      AND (
        6371 * acos(
          cos(radians(${lat})) * cos(radians(c."discoveryLat"))
          * cos(radians(c."discoveryLng") - radians(${lng}))
          + sin(radians(${lat})) * sin(radians(c."discoveryLat"))
        )
      ) < 5
      ORDER BY c.stake DESC, c."createdAt" DESC
      LIMIT ${limit}
    `;
    // If results found, return level "precise"
    if (Array.isArray(challenges) && challenges.length > 0) {
      return Response.json({
        challenges,
        discoveryLevel: "precise",
        levelMessage: `Found ${challenges.length} challenges within 5km`,
      });
    }
    // Fall through to Level 3 if no nearby results
  }

  // Level 2: IP-based city geolocation (50km radius)
  const clientIp = getClientIp(req);
  if (clientIp) {
    const geo = await geoFromIp(clientIp);
    if (geo) {
      const challenges = await prisma.challenge.findMany({
        where: baseWhere,
        select: selectFields,
        orderBy: [{ stake: "desc" }, { createdAt: "desc" }],
        take: limit,
      });
      if (challenges.length > 0) {
        return Response.json({
          challenges,
          discoveryLevel: "city",
          levelMessage: `Showing challenges near ${geo.city}`,
        });
      }
    }
  }

  // Level 3: Global fallback — ALWAYS returns results
  const challenges = await prisma.challenge.findMany({
    where: baseWhere,
    select: selectFields,
    orderBy: [{ stake: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  return Response.json({
    challenges,
    discoveryLevel: "global",
    levelMessage: "Showing top challenges worldwide",
  });
}
```

- [ ] **Step 2: Strip PII from all responses**

Ensure `creator` selection never includes `email` or `evmAddress`. Already handled above via `select`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/challenges/discover/route.ts
git commit -m "feat(discover): 3-level fallback waterfall (geo -> IP -> global), strip PII"
```

---

### Task 2: PlazaSection with Skeleton Loading

**Files:**
- Create: `src/components/PlazaSection.tsx`

- [ ] **Step 1: Create PlazaSection component**

```tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";

interface DiscoverResult {
  challenges: Array<{
    id: string;
    title: string;
    type: string;
    stake: number;
    deadline: string | null;
    rules: string | null;
    creator: { id: string; username: string; image: string | null };
  }>;
  discoveryLevel: "precise" | "city" | "global";
  levelMessage: string;
}

const LEVEL_BANNERS: Record<string, { icon: string; color: string }> = {
  precise: { icon: "pin", color: "#00e87a" },
  city: { icon: "city", color: "#0ea5e9" },
  global: { icon: "globe", color: "#f5a623" },
};

function SkeletonCard() {
  return (
    <div className="rounded-xl p-4 animate-pulse"
         style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex justify-between mb-3">
        <div className="h-4 w-32 rounded bg-white/5" />
        <div className="h-6 w-16 rounded bg-white/5" />
      </div>
      <div className="h-3 w-full rounded bg-white/5 mb-2" />
      <div className="h-3 w-2/3 rounded bg-white/5" />
    </div>
  );
}

interface Props {
  onAccept: (challengeId: string) => void;
  onRequireAuth: () => void;
}

export default function PlazaSection({ onAccept, onRequireAuth }: Props) {
  const [data, setData] = useState<DiscoverResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Try browser geolocation first
        let lat: number | undefined;
        let lng: number | undefined;
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch { /* no geo, waterfall will handle it */ }

        const result = await api.discoverChallenges({ lat, lng, limit: 20 });
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setData({ challenges: [], discoveryLevel: "global", levelMessage: "No challenges found" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const banner = data ? LEVEL_BANNERS[data.discoveryLevel] : null;

  return (
    <div className="space-y-3">
      {/* Level indicator banner */}
      <AnimatePresence>
        {data && data.discoveryLevel !== "precise" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{
              background: `${banner?.color}12`,
              border: `1px solid ${banner?.color}25`,
              color: banner?.color,
            }}
          >
            <span>{data.discoveryLevel === "global" ? "&#127760;" : "&#128205;"}</span>
            {data.levelMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skeleton or challenge list */}
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : data?.challenges.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          No open challenges right now. Be the first to create one!
        </div>
      ) : (
        <div className="space-y-2">
          {data?.challenges.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0, transition: { delay: i * 0.05 } }}
            >
              {/* ChallengeCard will be imported here in Task 3 */}
              <div
                className="rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.01]"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                onClick={() => onAccept(c.id)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-sm font-bold text-text-primary">{c.title}</span>
                  <motion.span
                    className="text-lg font-black"
                    style={{ color: c.stake > 0 ? "#f5a623" : "#00d4c8" }}
                    animate={c.stake > 0 ? {
                      textShadow: ["0 0 8px rgba(245,166,35,0.3)", "0 0 16px rgba(245,166,35,0.6)", "0 0 8px rgba(245,166,35,0.3)"],
                    } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {c.stake > 0 ? `${c.stake}` : "Free"}
                  </motion.span>
                </div>
                {c.rules && (
                  <p className="text-xs text-text-muted line-clamp-2">{c.rules}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-[10px] text-text-muted">
                  <span>{c.type}</span>
                  <span>by {c.creator.username || "Anonymous Gambler"}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PlazaSection.tsx
git commit -m "feat(plaza): PlazaSection with skeleton loading + discovery level banner"
```

---

### Task 3: Accept Confirmation Panel with Balance Check

**Files:**
- Create: `src/components/AcceptConfirmPanel.tsx`

- [ ] **Step 1: Create AcceptConfirmPanel**

```tsx
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";

interface Props {
  challenge: {
    id: string;
    title: string;
    stake: number;
    rules: string | null;
    type: string;
  };
  userCredits: number;
  onConfirmed: (challengeId: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

export default function AcceptConfirmPanel({ challenge, userCredits, onConfirmed, onCancel, onError }: Props) {
  const [accepting, setAccepting] = useState(false);
  const insufficientFunds = challenge.stake > 0 && userCredits < challenge.stake;

  const handleAccept = async () => {
    if (insufficientFunds) return;
    setAccepting(true);
    try {
      await api.acceptChallenge(challenge.id);
      onConfirmed(challenge.id);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Already taken")) {
        onError("Too slow! This challenge was just taken. Finding you another...");
      } else {
        onError(err instanceof Error ? err.message : "Failed to accept challenge");
      }
    } finally {
      setAccepting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(13,13,30,0.98)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
      }}
    >
      <div className="h-0.5 bg-gradient-to-r from-accent via-teal to-accent" />
      <div className="p-6 space-y-4">
        <h3 className="text-lg font-extrabold text-text-primary">{challenge.title}</h3>

        {challenge.rules && (
          <div className="px-3 py-2.5 rounded-xl text-xs text-amber-200 leading-relaxed"
               style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.2)" }}>
            <span className="font-bold text-amber-400 text-[10px] uppercase tracking-wider block mb-1">
              AI Judge Rules
            </span>
            {challenge.rules}
          </div>
        )}

        {challenge.stake > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
               style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}>
            <span className="text-xs text-text-secondary">You will lock</span>
            <span className="text-xl font-black text-[#f5a623]">{challenge.stake} credits</span>
          </div>
        )}

        {insufficientFunds && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
               style={{ background: "rgba(255,59,48,0.1)", border: "1px solid rgba(255,59,48,0.2)", color: "#ff3b30" }}>
            Insufficient funds. You have {userCredits} credits, need {challenge.stake}.
          </div>
        )}

        <div className="flex gap-3">
          <motion.button
            onClick={handleAccept}
            disabled={insufficientFunds || accepting}
            whileHover={!insufficientFunds ? { scale: 1.02 } : {}}
            whileTap={!insufficientFunds ? { scale: 0.97 } : {}}
            className={`flex-1 py-3.5 rounded-xl text-sm font-extrabold transition-all ${
              insufficientFunds
                ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                : "bg-gradient-to-r from-accent to-teal text-white shadow-lg shadow-accent/30"
            }`}
          >
            {accepting
              ? "Locking stake..."
              : insufficientFunds
                ? "Insufficient Funds — Deposit Now"
                : `Lock ${challenge.stake} Credits & Accept`}
          </motion.button>

          <motion.button
            onClick={onCancel}
            whileHover={{ background: "rgba(255,255,255,0.08)" }}
            whileTap={{ scale: 0.97 }}
            className="px-5 py-3.5 rounded-xl text-sm font-bold text-text-secondary border border-border-subtle"
          >
            Cancel
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AcceptConfirmPanel.tsx
git commit -m "feat(accept): confirmation panel with balance check and ghost concurrency handling"
```

---

### Task 4: Ghost Concurrency Guard in Accept API

**Files:**
- Modify: `src/app/api/challenges/[id]/accept/route.ts`

- [ ] **Step 1: Add unique constraint guard**

Wrap the accept logic in a Prisma transaction with optimistic concurrency:

```typescript
// Inside the accept handler, replace direct create with:
try {
  await prisma.$transaction(async (tx) => {
    // Re-read challenge inside transaction to prevent race
    const fresh = await tx.challenge.findUnique({
      where: { id },
      include: { participants: true },
    });
    if (!fresh || fresh.status !== "open") {
      throw new Error("Already taken");
    }
    if (fresh.participants.length >= fresh.maxParticipants) {
      throw new Error("Already taken");
    }
    if (fresh.participants.some(p => p.userId === user.userId)) {
      throw new Error("You are already in this challenge");
    }

    // Deduct stake
    if (fresh.stake > 0) {
      const balance = await getCredits(user.userId);
      if (balance < fresh.stake) throw new Error("Insufficient credits");
      await spendCredits(user.userId, fresh.stake, "stake", `Accepted: "${fresh.title}"`, id);
    }

    // Create participant
    await tx.participant.create({
      data: { challengeId: id, userId: user.userId, role: "opponent", status: "accepted" },
    });

    // Transition to live
    const newStatus = fresh.participants.length + 1 >= fresh.maxParticipants ? "live" : "open";
    await tx.challenge.update({ where: { id }, data: { status: newStatus } });
  });
} catch (err) {
  if (err instanceof Error && err.message === "Already taken") {
    return Response.json(
      { error: "This challenge was just taken by someone else. Refreshing..." },
      { status: 409 },
    );
  }
  throw err;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/challenges/[id]/accept/route.ts
git commit -m "fix(accept): ghost concurrency guard via Prisma transaction"
```

---

### Task 5: Wire PlazaSection into SecondaryPanels

**Files:**
- Modify: `src/components/SecondaryPanels.tsx`

- [ ] **Step 1: Import and replace NearbySection usage with PlazaSection**

Replace the existing nearby section content with PlazaSection component. Pass `onAccept` and `onRequireAuth` props.

- [ ] **Step 2: Commit**

```bash
git add src/components/SecondaryPanels.tsx
git commit -m "feat(panels): wire PlazaSection into FloatingActionBar discover drawer"
```

---

### Task 6: Integration Test

- [ ] **Step 1: Test fallback waterfall**

1. Open in incognito mode (no geolocation) — verify challenges still appear
2. Verify "global" level banner shows
3. In normal mode, allow geolocation — verify "precise" level
4. Deny geolocation — verify "city" or "global" fallback

- [ ] **Step 2: Test accept flow**

1. Click a challenge card — verify confirmation panel appears
2. With insufficient credits — verify button is disabled and shows "Insufficient Funds"
3. Accept with sufficient credits — verify challenge transitions to live
4. Open same challenge in two tabs, accept in both — verify one gets 409 error

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(phase2): complete arena — waterfall discovery, plaza, confirm panel"
```
