import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hash,
  keccak256,
  toHex,
  stringToBytes,
} from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

/**
 * On-chain AI Model Token integration (ERC-1155).
 *
 * Token IDs:
 *   1 = HAIKU   ($0.01/token)  → fast, cheap inference
 *   2 = SONNET  ($0.05/token)  → balanced
 *   3 = OPUS    ($0.25/token)  → most powerful
 *
 * ChallengeEscrow v2: uint256 challenge key = uint256(keccak256(utf8(offChainId))) aligned with `keccak256(toHex(id))` in viem.
 */

const chain = process.env.X402_NETWORK === "base" ? base : baseSepolia;

export const ESCROW_STATES = ["Created", "Active", "Judging", "Settled", "Disputed"] as const;

export const MODEL_TIERS = {
  HAIKU: { id: 1, name: "Haiku", model: "claude-haiku-4-5-20251001", priceUsd: 0.01 },
  SONNET: { id: 2, name: "Sonnet", model: "claude-sonnet-4-20250514", priceUsd: 0.05 },
  OPUS: { id: 3, name: "Opus", model: "claude-opus-4-20250514", priceUsd: 0.25 },
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

const USAGE_TOKEN_ABI = parseAbi([
  "function balanceOf(address, uint256) view returns (uint256)",
  "function balanceOfBatch(address[], uint256[]) view returns (uint256[])",
  "function burnForInference(address user, uint256 modelId, uint256 amount, string action, bytes32 requestId) external",
  "function burnSelf(uint256 modelId, uint256 amount, string action, bytes32 requestId) external",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data) external",
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function pricePerToken(uint256) view returns (uint256)",
  "event InferenceBurned(address indexed user, uint256 indexed modelId, uint256 amount, string action, bytes32 requestId)",
  "event TokensMinted(address indexed user, uint256 indexed modelId, uint256 usdcPaid, uint256 tokensMinted)",
]);

const ESCROW_ABI = parseAbi([
  "function createChallenge(uint256 challengeId, uint256 modelId, uint256 stake) external",
  "function acceptChallenge(uint256 challengeId) external",
  "function cancel(uint256 challengeId) external",
  "function beginJudging(uint256 challengeId) external",
  "function settle(uint256 challengeId, address winner, bytes32 evidenceHash) external",
  "function markDisputed(uint256 challengeId) external",
  "function resolveDispute(uint256 challengeId, address winner, bytes32 evidenceHash) external",
  "function challenges(uint256) view returns (uint256 id, address creator, address opponent, uint256 modelId, uint256 stake, uint8 state, address winner, bytes32 evidenceHash)",
  "function judgeAddress() view returns (address)",
  "event ChallengeCreated(uint256 indexed id, address indexed creator, uint256 modelId, uint256 stake)",
  "event ChallengeSettled(uint256 indexed id, address indexed winner, uint256 modelId, uint256 payout, bytes32 evidenceHash)",
]);

const USAGE_TOKEN_ADDRESS = (process.env.USAGE_TOKEN_ADDRESS || "") as Address;
const ESCROW_ADDRESS = (process.env.ESCROW_ADDRESS || "") as Address;

export const publicClient = createPublicClient({
  chain,
  transport: http(process.env.RPC_URL || undefined),
});

function getServerWallet() {
  const key = process.env.SERVER_PRIVATE_KEY;
  if (!key) throw new Error("SERVER_PRIVATE_KEY not configured");
  const account = privateKeyToAccount(key as `0x${string}`);
  return createWalletClient({ account, chain, transport: http(process.env.RPC_URL || undefined) });
}

// ── Token Reads ──

export interface TierBalance { id: TierId; name: string; balance: number; valueUsd: number }

export async function getAllBalances(userAddress: Address): Promise<TierBalance[]> {
  const addresses = [userAddress, userAddress, userAddress] as const;
  const ids = [BigInt(1), BigInt(2), BigInt(3)] as const;

  const balances = await publicClient.readContract({
    address: USAGE_TOKEN_ADDRESS,
    abi: USAGE_TOKEN_ABI,
    functionName: "balanceOfBatch",
    args: [addresses as unknown as readonly Address[], ids as unknown as readonly bigint[]],
  });

  return [
    { id: 1, name: "Haiku", balance: Number(balances[0]), valueUsd: Number(balances[0]) * 0.01 },
    { id: 2, name: "Sonnet", balance: Number(balances[1]), valueUsd: Number(balances[1]) * 0.05 },
    { id: 3, name: "Opus", balance: Number(balances[2]), valueUsd: Number(balances[2]) * 0.25 },
  ];
}

export async function getBalance(userAddress: Address, modelId: TierId): Promise<number> {
  const raw = await publicClient.readContract({
    address: USAGE_TOKEN_ADDRESS,
    abi: USAGE_TOKEN_ABI,
    functionName: "balanceOf",
    args: [userAddress, BigInt(modelId)],
  });
  return Number(raw);
}

// ── Token Burns (server-side) ──

export async function burnForInference(
  userAddress: Address,
  modelId: TierId,
  action: string,
  _challengeId?: string,
): Promise<{ txHash: Hash; requestId: string }> {
  const wallet = getServerWallet();
  const requestId = keccak256(toHex(`${userAddress}-${modelId}-${action}-${Date.now()}-${Math.random()}`));

  const txHash = await wallet.writeContract({
    address: USAGE_TOKEN_ADDRESS,
    abi: USAGE_TOKEN_ABI,
    functionName: "burnForInference",
    args: [userAddress, BigInt(modelId), BigInt(1), action, requestId],
  });

  return { txHash, requestId };
}

// ── Escrow (AI oracle wallet = onlyJudge) ──

/** Same as historical bytes32 id: keccak over UTF-8 string hex; cast to uint256 for the new escrow ABI. */
export function challengeIdToUint256(id: string): bigint {
  return BigInt(keccak256(toHex(id)));
}

/** Commitment stored on-chain with settle() — binds verdict payload without putting full text on-chain. */
export function verdictCommitmentHash(parts: {
  challengeId: string;
  winnerId: string | null;
  reasoning: string;
  confidence: number;
}): `0x${string}` {
  const payload = JSON.stringify({
    v: 1,
    challengeId: parts.challengeId,
    winnerId: parts.winnerId,
    reasoning: parts.reasoning.slice(0, 4000),
    confidence: parts.confidence,
  });
  return keccak256(stringToBytes(payload));
}

export async function settleOnChain(
  challengeId: string,
  winnerAddress: Address | null,
  evidenceHash: `0x${string}`,
): Promise<Hash> {
  const wallet = getServerWallet();
  const numericId = challengeIdToUint256(challengeId);
  const winner = winnerAddress || ("0x0000000000000000000000000000000000000000" as Address);

  const row = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "challenges",
    args: [numericId],
  });

  const state = Number(row[5]);
  // 1 = Active → oracle must lock before settle
  if (state === 1) {
    const beginHash = await wallet.writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: "beginJudging",
      args: [numericId],
    });
    await publicClient.waitForTransactionReceipt({ hash: beginHash });
  }

  return wallet.writeContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "settle",
    args: [numericId, winner, evidenceHash],
  });
}

export async function getOnChainChallenge(challengeId: string) {
  const numericId = challengeIdToUint256(challengeId);
  const r = await publicClient.readContract({
    address: ESCROW_ADDRESS,
    abi: ESCROW_ABI,
    functionName: "challenges",
    args: [numericId],
  });
  const tier = tierById(Number(r[3]) as TierId);
  const stateIdx = Number(r[5]) as 0 | 1 | 2 | 3 | 4;
  return {
    id: r[0],
    creator: r[1],
    opponent: r[2],
    modelId: Number(r[3]),
    modelName: tier.name,
    stake: Number(r[4]),
    stakeValueUsd: Number(r[4]) * tier.priceUsd,
    status: ESCROW_STATES[stateIdx] ?? `Unknown(${stateIdx})`,
    winner: r[6],
    evidenceHash: r[7],
  };
}

// ── Helpers ──

export function isOnChainEnabled(): boolean {
  return !!(USAGE_TOKEN_ADDRESS && ESCROW_ADDRESS && process.env.SERVER_PRIVATE_KEY);
}

export function txLink(hash: string): string {
  const explorer = chain.id === base.id ? "https://basescan.org" : "https://sepolia.basescan.org";
  return `${explorer}/tx/${hash}`;
}

export function tokenLink(address: string): string {
  const explorer = chain.id === base.id ? "https://basescan.org" : "https://sepolia.basescan.org";
  return `${explorer}/token/${USAGE_TOKEN_ADDRESS}?a=${address}`;
}
