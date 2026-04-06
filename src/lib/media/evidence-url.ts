/**
 * Safe fetching for user-submitted evidence URLs (SSRF mitigation).
 * Server-side only.
 */

const DEFAULT_IMAGE_MAX = 12 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 90_000;

function parseHostname(hostname: string): { isIp: boolean; ipv4?: string } {
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = hostname.match(ipv4);
  if (m) return { isIp: true, ipv4: hostname };
  return { isIp: false };
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/**
 * Returns true if the URL may be fetched by the evidence pipeline.
 */
export function isEvidenceUrlAllowed(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;

  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "0.0.0.0") return false;

  const { isIp, ipv4 } = parseHostname(host);
  if (isIp && ipv4 && isPrivateOrReservedIpv4(ipv4)) return false;

  const allow = process.env.EVIDENCE_URL_HOST_ALLOWLIST?.trim();
  if (allow) {
    const ok = allow.split(",").some((h) => host === h.trim().toLowerCase() || host.endsWith(`.${h.trim().toLowerCase()}`));
    if (!ok) return false;
  }

  return true;
}

export function isYouTubeUrl(raw: string): boolean {
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return h === "youtu.be" || h.endsWith(".youtube.com") || h === "youtube.com" || h.endsWith(".youtube-nocookie.com");
  } catch {
    return false;
  }
}

export async function fetchBinaryCapped(
  url: string,
  maxBytes: number = DEFAULT_IMAGE_MAX,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<{ buffer: Buffer; contentType: string | null }> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { Accept: "image/*,video/*,application/octet-stream,*/*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type");
    const len = res.headers.get("content-length");
    if (len && Number(len) > maxBytes) {
      throw new Error(`Content-Length ${len} exceeds cap ${maxBytes}`);
    }
    if (!res.body) throw new Error("No body");
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          throw new Error(`Stream exceeded ${maxBytes} bytes`);
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { buffer: Buffer.concat(chunks), contentType: ct };
  } finally {
    clearTimeout(t);
  }
}

export function looksLikeImageMime(ct: string | null, pathOrUrl: string): boolean {
  const c = (ct || "").toLowerCase();
  if (c.startsWith("image/")) return true;
  const u = pathOrUrl.toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(u);
}

export function looksLikeVideoMime(ct: string | null, pathOrUrl: string): boolean {
  const c = (ct || "").toLowerCase();
  if (c.startsWith("video/")) return true;
  const u = pathOrUrl.toLowerCase();
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(u);
}
