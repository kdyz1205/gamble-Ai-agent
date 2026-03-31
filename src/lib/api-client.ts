/**
 * Frontend API Client
 * Wraps all backend endpoints with typed functions.
 */

const BASE = "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("challengeai_token");
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "API Error");
  return data as T;
}

/* ── Auth ── */

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar: string | null;
  wallet: { balance: number; escrow: number; totalWon: number; totalLost: number } | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function register(email: string, username: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
  localStorage.setItem("challengeai_token", data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const data = await apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("challengeai_token", data.token);
  return data;
}

export async function getMe(): Promise<{ user: AuthUser & { activeChallenges: number } }> {
  return apiFetch("/auth/me");
}

export function logout() {
  localStorage.removeItem("challengeai_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
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
  currency: string;
  deadline: string | null;
  rules: string | null;
  evidenceType: string;
  aiReview: boolean;
  isPublic: boolean;
  createdAt: string;
  creator: { id: string; username: string; avatar: string | null };
  participants: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; username: string; avatar: string | null };
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
  currency?: string;
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

export async function judgeChallenge(id: string): Promise<{ judgment: unknown }> {
  return apiFetch(`/challenges/${id}/judge`, { method: "POST" });
}

/* ── AI Parse ── */

export interface ParsedChallenge {
  title: string;
  type: string;
  suggestedStake: number;
  currency: string;
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;
}

export async function parseChallenge(input: string): Promise<{
  parsed: ParsedChallenge;
  clarifications: Array<{ question: string; options: string[] }>;
}> {
  return apiFetch("/challenges/parse", { method: "POST", body: JSON.stringify({ input }) });
}

/* ── Wallet ── */

export interface WalletData {
  balance: number;
  escrow: number;
  totalWon: number;
  totalLost: number;
}

export async function getWallet(): Promise<{ wallet: WalletData }> {
  return apiFetch("/wallet");
}

export async function walletAction(action: "deposit" | "withdraw", amount: number): Promise<{ wallet: WalletData }> {
  return apiFetch("/wallet", { method: "POST", body: JSON.stringify({ action, amount }) });
}

export async function getTransactions(limit = 20): Promise<{
  transactions: Array<{
    id: string; type: string; amount: number; balanceAfter: number;
    description: string | null; createdAt: string;
    challenge: { id: string; title: string; type: string } | null;
  }>;
  total: number;
}> {
  return apiFetch(`/wallet/transactions?limit=${limit}`);
}

/* ── Feed ── */

export interface ActivityEventData {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  user: { id: string; username: string; avatar: string | null } | null;
  challenge: { id: string; title: string; type: string; status: string; stake: number } | null;
}

export async function getFeed(limit = 20): Promise<{ events: ActivityEventData[]; total: number }> {
  return apiFetch(`/feed?limit=${limit}`);
}

/* ── Nearby ── */

export async function getNearbyUsers(lat: number, lng: number, radius = 10): Promise<{
  users: Array<{
    id: string; username: string; avatar: string | null;
    distance: number; isOnline: boolean; challengeCount: number;
  }>;
}> {
  return apiFetch(`/users/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
}
