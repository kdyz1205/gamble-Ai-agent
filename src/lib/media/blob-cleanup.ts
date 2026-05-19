import { del, list } from "@vercel/blob";

export interface EvidenceBlobSnapshot {
  evidenceId: string;
  url?: string | null;
  preparedFrames?: string | null;
  currentUrl?: string | null;
}

export interface BlobCleanupResult {
  deletedCount: number;
  skippedCount: number;
  reason?: string;
}

function blobToken() {
  return process.env.BLOB_READ_WRITE_TOKEN?.trim() || null;
}

function parsePreparedFrameUrls(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function blobPathname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith(".blob.vercel-storage.com")) return null;
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function isSafeEvidenceBlob(url: string, challengeId: string) {
  const pathname = blobPathname(url);
  return Boolean(pathname && pathname.startsWith(`evidence/${challengeId}/`));
}

function isSafeFrameBlob(url: string, challengeId: string, evidenceId?: string) {
  const pathname = blobPathname(url);
  if (!pathname) return false;
  const prefix = evidenceId
    ? `evidence-frames/${challengeId}/${evidenceId}/`
    : `evidence-frames/${challengeId}/`;
  return pathname.startsWith(prefix);
}

async function deleteSafeUrls(urls: string[], skippedCount: number, label: string): Promise<BlobCleanupResult> {
  const token = blobToken();
  const unique = [...new Set(urls)];
  if (unique.length === 0) {
    console.log(`[blob-cleanup] ${label} deleted=0 skipped=${skippedCount}`);
    return { deletedCount: 0, skippedCount };
  }
  if (!token) {
    const result = { deletedCount: 0, skippedCount: skippedCount + unique.length, reason: "BLOB_READ_WRITE_TOKEN not set" };
    console.log(`[blob-cleanup] ${label} deleted=0 skipped=${result.skippedCount} reason="${result.reason}"`);
    return result;
  }

  let deletedCount = 0;
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    await del(batch, { token });
    deletedCount += batch.length;
  }
  console.log(`[blob-cleanup] ${label} deleted=${deletedCount} skipped=${skippedCount}`);
  return { deletedCount, skippedCount };
}

export async function cleanupReplacedEvidenceBlobs(
  challengeId: string,
  oldRows: EvidenceBlobSnapshot[],
): Promise<BlobCleanupResult> {
  const urls: string[] = [];
  let skippedCount = 0;

  for (const row of oldRows) {
    if (row.url && row.url !== row.currentUrl && isSafeEvidenceBlob(row.url, challengeId)) {
      urls.push(row.url);
    } else if (row.url && row.url !== row.currentUrl) {
      skippedCount += 1;
    }

    for (const frameUrl of parsePreparedFrameUrls(row.preparedFrames)) {
      if (isSafeFrameBlob(frameUrl, challengeId)) urls.push(frameUrl);
      else skippedCount += 1;
    }
  }

  return deleteSafeUrls(urls, skippedCount, `replaced-evidence challenge=${challengeId}`);
}

export async function cleanupChallengeFrameBlobs(challengeId: string): Promise<BlobCleanupResult> {
  const token = blobToken();
  if (!token) {
    const result = { deletedCount: 0, skippedCount: 0, reason: "BLOB_READ_WRITE_TOKEN not set" };
    console.log(`[blob-cleanup] challenge-frames challenge=${challengeId} deleted=0 skipped=0 reason="${result.reason}"`);
    return result;
  }

  const prefix = `evidence-frames/${challengeId}/`;
  const urls: string[] = [];
  let skippedCount = 0;
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, cursor, limit: 1000, token });
    for (const blob of page.blobs) {
      if (isSafeFrameBlob(blob.url, challengeId)) urls.push(blob.url);
      else skippedCount += 1;
    }
    cursor = page.cursor;
    if (!page.hasMore) break;
  } while (cursor);

  return deleteSafeUrls(urls, skippedCount, `challenge-frames challenge=${challengeId}`);
}
