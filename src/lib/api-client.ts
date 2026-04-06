/**
 * Frontend API Client — Credits-based economy
 * Uses NextAuth sessions + typed fetch wrappers.
 */

const BASE = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data as T;
}

/* ── Credits ── */

export interface CreditsData {
  credits: number;
  available: number;
  lockedInStake: number;
  aiSpend: number;
  stats: { won: number; lost: number; bought: number };
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
    challengeId: string | null;
    x402TxHash: string | null;
  }>;
}

export async function getCreditsBreakdown(): Promise<CreditsData> {
  return apiFetch("/credits");
}

/* ── USAGE Tokens / Credits ── */

export interface TierBalance {
  id: number;
  name: string;
  balance: number;
  valueUsd: number;
}

export interface TierInfo {
  id: number;
  name: string;
  priceUsd: number;
  creditCost: number;
  model: string;
}

export interface TokenData {
  offChain: {
    credits: number;
    stats: { won: number; lost: number; bought: number };
  };
  onChain: {
    balances: TierBalance[];
    totalValueUsd: number;
    tokenAddress: string;
    explorerLink: string | null;
    network: string;
  } | null;
  isOnChainEnabled: boolean;
  evmAddress: string | null;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
    challengeId: string | null;
    x402TxHash: string | null;
  }>;
  tiers: {
    haiku: TierInfo;
    sonnet: TierInfo;
    opus: TierInfo;
  };
}

export async function getTokenStatus(): Promise<TokenData> {
  return apiFetch("/tokens");
}

export async function linkWallet(address: string): Promise<{ success: boolean }> {
  return apiFetch("/tokens/link-wallet", {
    method: "POST",
    body: JSON.stringify({ address }),
  });
}

export async function topUpCredits(usdcAmount: number, txHash: string): Promise<{
  credits: number; added: number; usdcPaid: number; rate: string;
}> {
  return apiFetch("/credits/topup", {
    method: "POST",
    body: JSON.stringify({ usdcAmount, txHash }),
  });
}

/* ── Challenges ── */

export type ChallengeDiscoveryMeta = {
  distanceMiles: number | null;
  source: "snapshot" | "creator_live" | "none";
};

export interface ChallengeData {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  type: string;
  status: string;
  stake: number;
  deadline: string | null;
  rules: string | null;
  evidenceType: string;
  aiReview: boolean;
  isPublic: boolean;
  maxParticipants: number;
  aiModel?: string | null;
  livenessPrompt?: string | null;
  createdAt: string;
  discoveryLat?: number | null;
  discoveryLng?: number | null;
  discoveryCapturedAt?: string | null;
  /** Present on /api/users/nearby and /api/challenges/discover when geo sorting applies. */
  discovery?: ChallengeDiscoveryMeta;
  creator: {
    id: string;
    username: string;
    image: string | null;
    credits?: number;
    latitude?: number | null;
    longitude?: number | null;
  };
  participants: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; username: string; image: string | null };
  }>;
  _count?: { evidence: number; judgments: number };
}

export async function discoverChallenges(params?: {
  lat?: number;
  lng?: number;
  limit?: number;
}): Promise<{
  challenges: ChallengeData[];
  mode: string;
  reason: string;
}> {
  const q = new URLSearchParams();
  if (params?.lat != null && Number.isFinite(params.lat)) q.set("lat", String(params.lat));
  if (params?.lng != null && Number.isFinite(params.lng)) q.set("lng", String(params.lng));
  if (params?.limit != null) q.set("limit", String(params.limit));
  return apiFetch(`/challenges/discover?${q.toString()}`);
}

export async function listChallenges(params?: {
  status?: string; type?: string; mine?: boolean; limit?: number; offset?: number;
}): Promise<{ challenges: ChallengeData[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.type) q.set("type", params.type);
  if (params?.mine) q.set("mine", "true");
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.offset) q.set("offset", String(params.offset));
  return apiFetch(`/challenges?${q.toString()}`);
}

/** Full challenge for verdict / evidence UI (matches GET /api/challenges/[id]) */
export interface EvidenceRow {
  id: string;
  type: string;
  description: string | null;
  url: string | null;
  userId: string;
  createdAt: string;
  user: { id: string; username: string; image: string | null };
}

export interface JudgmentRow {
  id: string;
  winnerId: string | null;
  method: string;
  aiModel: string | null;
  reasoning: string | null;
  confidence: number | null;
  status: string;
  createdAt: string;
  winner?: { id: string; username: string } | null;
}

export type ChallengeDetail = Omit<ChallengeData, "_count"> & {
  evidence: EvidenceRow[];
  judgments: JudgmentRow[];
  _count?: { evidence: number; participants: number; judgments?: number };
};

export async function getChallenge(id: string): Promise<{ challenge: ChallengeDetail }> {
  return apiFetch(`/challenges/${id}`);
}

export async function createChallenge(data: {
  title: string;
  description?: string;
  type?: string;
  stake?: number;
  deadline?: string;
  rules?: string;
  evidenceType?: string;
  aiReview?: boolean;
  isPublic?: boolean;
}): Promise<{ challenge: ChallengeData }> {
  return apiFetch("/challenges", { method: "POST", body: JSON.stringify(data) });
}

export async function acceptChallenge(id: string): Promise<{ challenge: ChallengeData }> {
  return apiFetch(`/challenges/${id}/accept`, { method: "POST" });
}

export async function submitEvidence(id: string, data: {
  type?: string; url?: string; description?: string; metadata?: Record<string, unknown>;
}): Promise<{ evidence: unknown }> {
  return apiFetch(`/challenges/${id}/evidence`, { method: "POST", body: JSON.stringify(data) });
}

export async function judgeChallenge(
  id: string,
  tier: 1 | 2 | 3 = 1,
  opts?: { providerId?: string; model?: string },
): Promise<{
  judgment: unknown;
  settlement: { success: boolean; error?: string; txHash?: string };
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRemaining: number;
  txHash: string | null;
}> {
  return apiFetch(`/challenges/${id}/judge`, {
    method: "POST",
    body: JSON.stringify({ tier, ...opts }),
  });
}

/** 202 + background job (ffmpeg/vision/settle). Poll `getJudgeJob`. */
export async function judgeChallengeAsync(
  id: string,
  tier: 1 | 2 | 3 = 1,
  opts?: { providerId?: string; model?: string; webhookUrl?: string },
): Promise<{
  status: string;
  jobId: string;
  pollUrl: string;
  pollUrlAbsolute?: string;
  message?: string;
}> {
  return apiFetch(`/challenges/${id}/judge/async`, {
    method: "POST",
    body: JSON.stringify({ tier, ...opts }),
  });
}

export async function getJudgeJob(jobId: string): Promise<{
  jobId: string;
  challengeId: string;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  result: unknown;
}> {
  return apiFetch(`/judge-jobs/${jobId}`);
}

/** Presigned PUT for direct-to-S3 upload (optional; 503 if not configured). */
export async function presignEvidenceUpload(body: {
  challengeId: string;
  contentType: string;
  filename?: string;
}): Promise<{
  configured: boolean;
  uploadUrl?: string;
  publicUrl?: string;
  key?: string;
  expiresIn?: number;
  method?: string;
  headers?: Record<string, string>;
  error?: string;
}> {
  const res = await fetch(`${BASE}/uploads/evidence-presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    configured?: boolean;
    error?: string;
    uploadUrl?: string;
    publicUrl?: string;
    key?: string;
    expiresIn?: number;
    method?: string;
    headers?: Record<string, string>;
  };
  if (res.status === 503 && data.configured === false) {
    return { configured: false, error: data.error };
  }
  if (!res.ok) {
    throw new Error(data.error || "API Error");
  }
  return data as {
    configured: boolean;
    uploadUrl?: string;
    publicUrl?: string;
    key?: string;
    expiresIn?: number;
    method?: string;
    headers?: Record<string, string>;
    error?: string;
  };
}

/* ── AI Parse ── */

export type JudgingMethod = "vision" | "api" | "hybrid";

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  currency: string;
  durationMinutes: number;
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
  judgingMethod: JudgingMethod;
}

export async function parseChallenge(
  input: string,
  tier: 1 | 2 | 3 = 1,
  opts?: { providerId?: string; model?: string },
): Promise<{
  betDraft: ParsedChallenge & { stake: number };
  confirmationPrompt: string;
  parsed: ParsedChallenge;
  clarifications: Array<{ question: string; options: string[] }>;
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRemaining: number;
  txHash: string | null;
}> {
  const res = await fetch(`${BASE}/challenges/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input, tier, ...opts }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.suggestion || data.error || "Failed to parse challenge");
  }
  return res.json();
}

/* ── Draft Adjustment (AI-powered, free) ── */

export async function adjustDraft(
  instruction: string,
  draft: { title: string; type: string; stake: number; deadline: string; rules: string; evidence: string; isPublic: boolean },
): Promise<{
  changes: Record<string, unknown>;
  message: string;
  credits?: number;
}> {
  return apiFetch("/challenges/adjust-draft", {
    method: "POST",
    body: JSON.stringify({ instruction, draft }),
  });
}

/* ── Feed ── */

export interface ActivityEventData {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  user: { id: string; username: string; image: string | null } | null;
  challenge: { id: string; title: string; type: string; status: string; stake: number } | null;
}

export async function getFeed(limit = 20): Promise<{ events: ActivityEventData[]; total: number }> {
  return apiFetch(`/feed?limit=${limit}`);
}

/* ── Location ── */

export async function updateLocation(lat: number, lng: number): Promise<{ success: boolean }> {
  return apiFetch("/me/location", {
    method: "POST",
    body: JSON.stringify({ lat, lng }),
  });
}

/* ── Nearby ── */

export type DiscoverReason = "anonymous" | "no_coordinates" | "geo";

export async function getDiscoverNearby(params?: {
  lat?: number;
  lng?: number;
  radius?: number;
}): Promise<{
  users: Array<{
    id: string;
    username: string;
    image: string | null;
    distance: number;
    isOnline: boolean;
    challengeCount: number;
  }>;
  challenges: ChallengeData[];
  mode: string;
  reason: DiscoverReason | string;
}> {
  const q = new URLSearchParams();
  if (params?.lat != null && Number.isFinite(params.lat)) q.set("lat", String(params.lat));
  if (params?.lng != null && Number.isFinite(params.lng)) q.set("lng", String(params.lng));
  if (params?.radius != null) q.set("radius", String(params.radius));
  return apiFetch(`/users/nearby?${q.toString()}`);
}

export async function getNearbyUsers(lat: number, lng: number, radius = 10) {
  return getDiscoverNearby({ lat, lng, radius });
}
