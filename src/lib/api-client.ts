import type { ProtocolPreviewV2, ProtocolSpecV2 } from "@/lib/protocol-spec-v2";

export type { ProtocolPreviewV2, ProtocolSpecV2 };

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
  const text = await res.text();
  let data: unknown = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      const preview = text.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`API returned non-JSON (${res.status}) from ${path}: ${preview || "empty response"}`);
    }
  }
  if (!res.ok) {
    const error = data && typeof data === "object" && "error" in data
      ? String((data as { error?: unknown }).error)
      : `API request failed (${res.status})`;
    throw new Error(error);
  }
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

export interface DailyAiQuotaStatus {
  dateKey: string;
  resetsAt: string;
  spec: { used: number; limit: number; remaining: number };
  judge: { used: number; limit: number; remaining: number };
  videoJudge: { used: number; limit: number; remaining: number };
}

export async function getTokenStatus(): Promise<TokenData> {
  return apiFetch("/tokens");
}

export async function getCredits(): Promise<{
  credits: number;
  stats: { won: number; lost: number; bought: number };
  dailyQuota: DailyAiQuotaStatus;
  transactions: Array<{
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
    challengeId: string | null;
  }>;
}> {
  return apiFetch("/credits");
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

export interface LocationSnapshot {
  lat: number;
  lng: number;
}

export interface ChallengeSpec {
  challenge_title: string;
  challenge_type: string;
  participants: Array<{ role: "creator" | "opponent"; label: string; user_id?: string | null }>;
  stake_amount: number;
  currency_or_points: "points" | "credits";
  public_or_private: "public" | "private";
  invite_mode: "nearby" | "invite_link" | "direct_friend" | "same_device";
  participation_mode: "remote_async" | "remote_live" | "same_camera" | "in_person";
  objective: string;
  winning_condition: string;
  required_evidence: string;
  video_capture_instructions: string;
  start_condition: string;
  end_condition: string;
  timing_method: string;
  valid_repetition_definition: string;
  scoring_method: string;
  allowed_attempts: string;
  anti_cheat_rules: string[];
  ai_judging_method: string;
  dispute_window: string;
  fallback_manual_review: string;
  payout_rule: string;
  safety_warning: string;
  legal_compliance_flag: "internal_points_only" | "requires_legal_review";
  mode_options?: Array<{ label: string; value: string; description: string }>;
}

export interface ChallengeData {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  marketType: string;
  proposition: string | null;
  rawPrompt?: string | null;
  challengeSpecJson?: string | null;
  inviteCode?: string | null;
  currencyType?: string | null;
  participationMode?: string | null;
  type: string;
  status: string;
  stake: number;
  stakeToken: string;
  deadline: string | null;
  eventTime: string | null;
  joinWindow: string | null;
  proofWindow: string | null;
  rules: string | null;
  evidenceType: string;
  livenessPrompt?: string | null;
  protocolVersion?: string | null;
  participantMode?: string | null;
  outcomeType?: string | null;
  evidenceMode?: string | null;
  identityMode?: string | null;
  locationMode?: string | null;
  settlementProtocolMode?: string | null;
  riskLevel?: string | null;
  compilerProviderId?: string | null;
  compilerModel?: string | null;
  settlementMode: string;
  proofSource: string | null;
  arbiter: string | null;
  fallbackRule: string | null;
  disputeWindow: string | null;
  aiReview: boolean;
  isPublic: boolean;
  visibility: string;
  maxParticipants: number;
  createdAt: string;
  discovery?: { distanceMiles: number | null; source: "snapshot" | "creator_live" | "none" };
  creator: { id: string; username: string; image: string | null; credits?: number };
  participants: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; username: string; image: string | null };
  }>;
  evidence?: Array<{
    id: string;
    userId: string;
    type: string;
    url: string | null;
    description: string | null;
    metadata?: string | null;
    createdAt: string;
    user?: { id: string; username: string; image?: string | null };
  }>;
  judgments?: Array<{
    id: string;
    winnerId: string | null;
    method: string;
    aiModel: string | null;
    reasoning: string | null;
    confidence: number | null;
    metricsJson?: string | null;
    status: string;
    createdAt: string;
    winner?: { id: string; username: string } | null;
  }>;
  _count?: { evidence: number; judgments?: number; participants?: number };
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

export async function discoverChallenges(params?: {
  lat?: number; lng?: number; radiusMiles?: number; limit?: number;
}): Promise<{
  challenges: ChallengeData[];
  discoveryLevel: "precise" | "global";
  levelMessage: string;
}> {
  const q = new URLSearchParams();
  if (params?.lat !== undefined) q.set("lat", String(params.lat));
  if (params?.lng !== undefined) q.set("lng", String(params.lng));
  if (params?.radiusMiles !== undefined) q.set("radiusMiles", String(params.radiusMiles));
  if (params?.limit) q.set("limit", String(params.limit));
  return apiFetch(`/challenges/discover?${q.toString()}`);
}

export async function updateMyLocation(snapshot: LocationSnapshot): Promise<{ success: boolean }> {
  return apiFetch("/me/location", {
    method: "POST",
    body: JSON.stringify(snapshot),
  });
}

export async function getChallenge(id: string): Promise<{ challenge: ChallengeData }> {
  return apiFetch(`/challenges/${id}`);
}

export async function getChallengeProtocol(id: string): Promise<{
  challengeId: string;
  protocol: ProtocolSpecV2 | null;
  participantBindings: Array<{
    id: string;
    challengeId: string;
    userId: string;
    participantId: string | null;
    role: string;
    displayName: string | null;
    expectedPosition: string | null;
    bindingStatus: string;
    identityConfidence: number | null;
    verifiedAt: string | null;
    createdAt: string;
    updatedAt: string;
    livenessCode: string | null;
    qrTokenHash: string | null;
  }>;
}> {
  return apiFetch(`/challenges/${id}/protocol`);
}

export async function generateChallengeSpec(inputText: string, prefs?: {
  providerId?: string;
  model?: string | null;
  language?: string;
  context?: Record<string, unknown>;
}): Promise<{
  rawPrompt: string;
  spec: ChallengeSpec;
  protocol?: ProtocolSpecV2;
  preview?: ProtocolPreviewV2;
  model: string;
  source?: "llm" | "fallback" | "error";
  providerId?: string;
  externalApiCharged?: boolean;
  providerCall?: unknown;
  fallbackReason?: string;
  dailyQuota?: DailyAiQuotaStatus;
}> {
  return apiFetch("/challenges/generate-spec", {
    method: "POST",
    body: JSON.stringify({ inputText, ...prefs }),
  });
}

export async function compileChallengeProtocol(inputText: string, prefs?: {
  providerId?: string;
  model?: string | null;
  language?: "en" | "zh" | "auto";
  context?: Record<string, unknown>;
}): Promise<{
  rawPrompt: string;
  protocol: ProtocolSpecV2;
  preview: ProtocolPreviewV2;
  source: "llm" | "error";
  providerId: string;
  model: string;
  externalApiCharged?: boolean;
  providerCall?: unknown;
  dailyQuota?: DailyAiQuotaStatus;
}> {
  return apiFetch("/challenges/compile", {
    method: "POST",
    body: JSON.stringify({ inputText, ...prefs }),
  });
}

export async function createChallenge(data: {
  title: string;
  description?: string;
  rawPrompt?: string;
  challengeSpecJson?: string;
  protocol?: ProtocolSpecV2;
  compilerProviderId?: string;
  compilerModel?: string;
  inviteCode?: string;
  currencyType?: string;
  participationMode?: string;
  marketType?: string;
  proposition?: string;
  type?: string;
  stake?: number;
  stakeToken?: string;
  deadline?: string;
  eventTime?: string;
  joinWindow?: string | null;
  proofWindow?: string | null;
  rules?: string;
  evidenceType?: string;
  settlementMode?: string;
  proofSource?: string | null;
  arbiter?: string | null;
  fallbackRule?: string | null;
  disputeWindow?: string | null;
  aiReview?: boolean;
  isPublic?: boolean;
  visibility?: string;
  discoveryLat?: number;
  discoveryLng?: number;
}): Promise<{ challenge: ChallengeData }> {
  return apiFetch("/challenges", { method: "POST", body: JSON.stringify(data) });
}

export async function acceptChallenge(id: string): Promise<{ challenge: ChallengeData }> {
  return apiFetch(`/challenges/${id}/accept`, { method: "POST" });
}

export async function deleteChallenge(id: string): Promise<{ ok: true; deletedId: string; refundedStake: number }> {
  return apiFetch(`/challenges/${id}`, { method: "DELETE" });
}

export async function submitEvidence(id: string, data: {
  type?: string; url?: string; description?: string; metadata?: Record<string, unknown>;
}): Promise<{ evidence: unknown; sharedEvidenceCount?: number }> {
  return apiFetch(`/challenges/${id}/evidence`, { method: "POST", body: JSON.stringify(data) });
}

export async function judgeChallenge(id: string, tier: 1 | 2 | 3 = 1, prefs?: {
  providerId?: string;
  model?: string;
  autoSettle?: boolean;
  rejudge?: boolean;
  reason?: string;
}): Promise<{
  status: "ai_verdict_ready" | "ai_inconclusive" | "manual_review_required" | "settled";
  winnerId: string | null;
  confidence: number;
  reasoning: string;
  evidenceQuality: "good" | "unclear" | "insufficient" | "invalid";
  recommendation: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
  settlementRecommendation: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
  blockingIssues: string[];
  source?: string;
  providerCall?: unknown;
  videoMetrics?: unknown;
  verdict: {
    status: "ai_verdict_ready" | "ai_inconclusive" | "manual_review_required" | "settled";
    winnerId: string | null;
    confidence: number;
    reasoning: string;
    evidenceQuality: "good" | "unclear" | "insufficient" | "invalid";
    recommendation: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
    settlementRecommendation: "settle_winner" | "needs_review" | "invalid_evidence" | "tie_or_no_winner";
    blockingIssues: string[];
    source?: string;
    providerCall?: unknown;
    videoMetrics?: unknown;
  };
  judgment: unknown;
  settlement: { success: boolean; error?: string; txHash?: string };
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRefunded?: number;
  creditsRemaining: number;
  dailyQuota?: DailyAiQuotaStatus;
  txHash: string | null;
}> {
  return apiFetch(`/challenges/${id}/judge`, {
    method: "POST",
    body: JSON.stringify({ tier, ...prefs }),
  });
}

export async function confirmVerdict(id: string): Promise<{
  challenge: ChallengeData;
  judgment: unknown;
  settlement: { success: boolean; error?: string; txHash?: string };
}> {
  return apiFetch(`/challenges/${id}/confirm-verdict`, { method: "POST" });
}

export async function disputeChallenge(id: string, data?: { reason?: string }): Promise<{
  challenge: ChallengeData;
  review: { status: string; reason: string | null; latestJudgmentId: string | null };
}> {
  return apiFetch(`/challenges/${id}/dispute`, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
}

export async function manualResolveChallenge(id: string, data: {
  outcome: "winner" | "refund" | "void";
  winnerId?: string | null;
  reason?: string;
}): Promise<{
  challenge: ChallengeData;
  judgment: unknown;
  settlement: { success: boolean; error?: string; txHash?: string };
  manualReview: { outcome: string; finalStatus: string; winnerId: string | null; reason: string };
}> {
  return apiFetch(`/challenges/${id}/manual-resolve`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/* ── AI Parse & Tweak ── */

export interface StakeOption {
  amount: number;
  label: string;
  reasoning: string;
}

export interface EvidenceOption {
  type: string;
  label: string;
  reasoning: string;
  required?: boolean;
}

export interface DeadlineOption {
  duration: string;
  reasoning: string;
}

export interface OracleAttachment {
  source: string;           // "CoinGecko" | "Open-Meteo" | ...
  label: string;            // "BTC/USD spot price"
  currentValue?: string;    // pretty string like "$77,291.00"
  oracleUrl?: string;       // public URL for humans to verify at settlement time
  queriedAt: string;        // ISO timestamp of the lookup
}

export interface ActionItem {
  type: "topup" | "adjust_stake" | "add_opponent" | "reduce_scope" | "other";
  label: string;            // in user's language; e.g. "Top up 25 credits"
  reasoning: string;
  payload?: Record<string, unknown>;
}

export interface ParsedChallenge {
  // Core
  title: string;
  type: string;
  suggestedStake: number;
  evidenceType: string;
  rules: string;
  deadline: string;
  isPublic: boolean;

  // Intent classification. "chat_reply" means AI wants to ask one follow-up
  // question before committing to a draft — UI should render the question
  // as a plain chat bubble and NOT a DraftPanel card.
  intent?: "definite_market" | "candidate_market" | "ordinary_chat" | "chat_reply";
  marketType?: "yes_no" | "threshold" | "head_to_head" | "challenge";
  proposition?: string;
  subject?: string;

  // AI-generated contextual recommendations (replaces hardcoded UI chips)
  stakeOptions?: StakeOption[];
  evidenceOptions?: EvidenceOption[];
  deadlineOptions?: DeadlineOption[];

  // AI's contextual thinking
  redFlags?: string[];
  recommendationSummary?: string;

  // What's still unclear (AI should minimize these — defaults preferred)
  missingFields?: string[];
  clarifyingQuestion?: string;

  // Oracle attachments populated when parse-time LLM called real tools
  oracles?: OracleAttachment[];
  toolInvocations?: Array<{ name: string; ok: boolean; error?: string }>;

  // Proactive clickable suggestions (AI wrote these, frontend renders buttons)
  actionItems?: ActionItem[];
}

/* ── Agent Orchestrator — the one conversational entry point ── */

export type AgentAction =
  | "ask_followup" | "show_draft" | "call_tool" | "judge" | "confirm" | "refuse_or_redirect";

export interface AgentDraftState {
  title: string | null;
  proposition: string | null;
  participants: string | null;
  stake: number | null;
  stakeType: "credits" | "none" | null;
  evidenceType: "video" | "photo" | "text" | null;
  judgeRule: string | null;
  timeWindow: string | null;
  safetyNotes: string[];
  readyToPublish: boolean;
}

export interface AgentTurn {
  role: "user" | "ai";
  content: string;
}

export interface AgentResponse {
  userVisibleReply: string;
  agentAction: AgentAction;
  draftPatch: Partial<AgentDraftState>;
  toolName: string | null;
  toolArgs: Record<string, unknown> | null;
  draftState: AgentDraftState;
  toolResult?: {
    challengeId?: string;
    shareUrl?: string;
    marketUrl?: string;
    [key: string]: unknown;
  } | unknown;
  toolError?: string;
}

export function emptyAgentDraftState(): AgentDraftState {
  return {
    title: null, proposition: null, participants: null,
    stake: null, stakeType: null, evidenceType: null,
    judgeRule: null, timeWindow: null,
    safetyNotes: [], readyToPublish: false,
  };
}

/**
 * One conversational turn with GambleAI. Frontend keeps conversationHistory
 * and draftState in React; each call sends them back for server-side merge.
 */
export async function agentRespond(
  message: string,
  conversationHistory: AgentTurn[],
  draftState: AgentDraftState,
  locationSnapshot?: LocationSnapshot | null,
): Promise<AgentResponse> {
  return apiFetch("/agent/respond", {
    method: "POST",
    body: JSON.stringify({ message, conversationHistory, draftState, locationSnapshot }),
  });
}

export async function parseChallenge(
  input: string,
  tier: 1 | 2 | 3 = 1,
  priorDraft?: ParsedChallenge | null,
): Promise<{
  parsed: ParsedChallenge;
  clarifications: Array<{ question: string; options: string[] }>;
  model: string;
  tierId: number;
  creditsUsed: number;
  creditsRemaining: number;
  dailyQuota?: DailyAiQuotaStatus;
  txHash: string | null;
}> {
  return apiFetch("/challenges/parse", {
    method: "POST",
    // `priorDraft` is an optional hint: when present, the AI sees the user's
    // previous draft alongside the new input so "再来一个" / "another one" /
    // "bigger stake" references the right prior context instead of cold-starting.
    body: JSON.stringify({ input, tier, priorDraft: priorDraft ?? undefined }),
  });
}

/**
 * Natural-language tweak: "make it 30 days", "raise stake to 100", "add witness".
 * Returns a new, fully-rethought ParsedChallenge (not just changed fields).
 */
export async function adjustDraft(
  instruction: string,
  draft: ParsedChallenge,
): Promise<{ draft: ParsedChallenge; message: string; credits: number }> {
  return apiFetch("/challenges/adjust-draft", {
    method: "POST",
    body: JSON.stringify({ instruction, draft }),
  });
}

/* ── Voice transcription ── */

export interface TranscriptionResponse {
  transcript: string;
  language: string;
  provider: string;
  usedFallback: boolean;
}

export async function transcribeAudio(
  file: Blob,
  options?: { languageHint?: "en" | "zh"; previewText?: string },
): Promise<TranscriptionResponse> {
  const form = new FormData();

  // Derive the file extension from the blob's MIME type so OpenAI can auto-
  // detect format. Previously we hard-coded .webm for every blob; iOS Safari
  // records audio/mp4 (AAC), which OpenAI's Whisper then refused to decode
  // because the extension and actual bytes disagreed, returning an empty
  // transcript — "Mic says Chinese, nothing comes back" bug.
  const t = (file.type || "").toLowerCase();
  const ext =
    t.includes("webm") ? "webm" :
    t.includes("ogg") ? "ogg" :
    t.includes("mp4") || t.includes("aac") || t.includes("mp4a") ? "m4a" :
    t.includes("mpeg") ? "mp3" :
    t.includes("wav") ? "wav" :
    "webm"; // best-effort default when blob.type is empty
  const baseName = options?.languageHint ? `voice-${options.languageHint}` : "voice";
  const filename = `${baseName}.${ext}`;
  form.append("file", file, filename);
  if (options?.languageHint) form.append("languageHint", options.languageHint);
  if (options?.previewText) form.append("previewText", options.previewText);

  const res = await fetch(`${BASE}/transcribe`, {
    method: "POST",
    body: form,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Transcription failed");
  return data as TranscriptionResponse;
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

export async function judgeChallengeAsync(id: string, tier: 1 | 2 | 3 = 1, prefs?: Record<string, unknown>): Promise<{ jobId: string; dailyQuota?: DailyAiQuotaStatus }> {
  return apiFetch(`/challenges/${id}/judge/async`, {
    method: "POST",
    body: JSON.stringify({ tier, ...prefs }),
  });
}

export async function getJudgeJob(jobId: string): Promise<{ jobId: string; status: string; result?: unknown; error?: string }> {
  return apiFetch(`/judge-jobs/${jobId}`);
}
