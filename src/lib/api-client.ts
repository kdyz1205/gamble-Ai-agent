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
  createdAt: string;
  creator: { id: string; username: string; image: string | null; credits?: number };
  participants: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; username: string; image: string | null };
  }>;
  _count?: { evidence: number; judgments: number };
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

export async function getChallenge(id: string): Promise<{ challenge: ChallengeData }> {
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

export async function judgeChallenge(id: string, tier: 1 | 2 | 3 = 1): Promise<{
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
    body: JSON.stringify({ tier }),
  });
}

/* ── AI Parse ── */

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
}

export async function parseChallenge(input: string, tier: 1 | 2 | 3 = 1): Promise<{
  parsed: ParsedChallenge;
  clarifications: Array<{ question: string; options: string[] }>;
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRemaining: number;
  txHash: string | null;
}> {
  return apiFetch("/challenges/parse", {
    method: "POST",
    body: JSON.stringify({ input, tier }),
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

/* ── Nearby ── */

export async function getNearbyUsers(lat: number, lng: number, radius = 10): Promise<{
  users: Array<{
    id: string; username: string; image: string | null;
    distance: number; isOnline: boolean; challengeCount: number;
  }>;
}> {
  return apiFetch(`/users/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
}

/* ── Type aliases for backwards compat ── */
export type ChallengeDetail = ChallengeData;

/* ── Stubs for features not yet wired ── */
export async function presignEvidenceUpload(_challengeId: string, _filename: string): Promise<{ url: string; pathname: string }> {
  return apiFetch(`/uploads/evidence-presign`, {
    method: "POST",
    body: JSON.stringify({ challengeId: _challengeId, filename: _filename }),
  });
}

export async function judgeChallengeAsync(id: string, tier: 1 | 2 | 3 = 1, _prefs?: Record<string, unknown>): Promise<{ jobId: string }> {
  return apiFetch(`/challenges/${id}/judge/async`, {
    method: "POST",
    body: JSON.stringify({ tier }),
  });
}

export async function getJudgeJob(jobId: string): Promise<{ job: { id: string; status: string; resultJson?: string; error?: string } }> {
  return apiFetch(`/judge-jobs/${jobId}`);
}
