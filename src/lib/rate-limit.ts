import type { NextRequest } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

function actorKey(req: NextRequest, scope: string, actorId?: string | null) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${actorId || ip}`;
}

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function rateLimitResponse(retryAfter: number) {
  return Response.json(
    {
      error: "Too many requests. Please wait a moment and try again.",
      retryAfterSeconds: retryAfter,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    },
  );
}

async function upstashRateLimit(key: string, limit: number, windowMs: number): Promise<Response | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const redisKey = `rl:${key}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const pipeline = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers,
    body: JSON.stringify([["INCR", redisKey], ["PTTL", redisKey]]),
    cache: "no-store",
  });
  if (!pipeline.ok) throw new Error(`Redis rate-limit failed: ${pipeline.status}`);
  const data = await pipeline.json() as Array<{ result?: number }>;
  const count = Number(data[0]?.result ?? 0);
  let ttl = Number(data[1]?.result ?? -1);
  if (count === 1 || ttl < 0) {
    await fetch(`${url}/pexpire/${encodeURIComponent(redisKey)}/${windowMs}`, {
      method: "POST",
      headers,
      cache: "no-store",
    });
    ttl = windowMs;
  }
  if (count <= limit) return null;
  return rateLimitResponse(Math.max(1, Math.ceil(ttl / 1000)));
}

function memoryRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  prune(now);

  const current = buckets.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count <= limit) return null;

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return rateLimitResponse(retryAfter);
}

export async function rateLimit(
  req: NextRequest,
  {
    scope,
    actorId,
    limit,
    windowMs,
  }: {
    scope: string;
    actorId?: string | null;
    limit: number;
    windowMs: number;
  },
): Promise<Response | null> {
  const key = actorKey(req, scope, actorId);
  try {
    const distributed = await upstashRateLimit(key, limit, windowMs);
    if (distributed) return distributed;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  } catch {
    // Keep the app available if Redis has a transient failure; local fallback
    // still protects a single instance and test environments.
  }
  return memoryRateLimit(key, limit, windowMs);
}
