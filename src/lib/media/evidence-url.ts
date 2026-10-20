/**
 * Safe fetching for user-submitted evidence URLs (SSRF mitigation).
 * Server-side only.
 */

import { lookup } from "node:dns/promises";
import { request } from "node:https";

const DEFAULT_IMAGE_MAX = 12 * 1024 * 1024;
const DEFAULT_FETCH_TIMEOUT_MS = 90_000;

function parseHostname(hostname: string): { isIp: boolean; ipv4?: string; ipv6?: string } {
  // IPv4 literal
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  if (ipv4.test(hostname)) return { isIp: true, ipv4: hostname };

  // IPv6 literal, bracketed or bare. URL().hostname strips brackets for us.
  if (hostname.includes(":")) {
    // crude but adequate — real validation is via the downstream private
    // check; if we can't understand it we reject.
    return { isIp: true, ipv6: hostname };
  }
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
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 192 && (b === 0 || b === 2)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Reject ALL IPv6 literals by default — the surface area for reliable
 * private-range detection in pure JS is wide (link-local fe80::/10, unique
 * local fc00::/7, loopback ::1, IPv4-mapped ::ffff:127.0.0.1, documentation
 * 2001:db8::/32, ...). Operators who genuinely need IPv6 fetching can allow
 * specific hosts via EVIDENCE_URL_HOST_ALLOWLIST.
 */
function isPrivateOrReservedIpv6(ip: string): boolean {
  const v = ip.toLowerCase();
  // Loopback
  if (v === "::1" || v === "0:0:0:0:0:0:0:1") return true;
  // Unspecified
  if (v === "::" || v === "0:0:0:0:0:0:0:0") return true;
  // IPv4-mapped ::ffff:a.b.c.d — treat as the embedded IPv4.
  const mapped = v.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateOrReservedIpv4(mapped[1]);
  // Link-local fe80::/10 + multicast ff00::/8 + unique-local fc00::/7 + doc 2001:db8::/32.
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  if (v.startsWith("ff")) return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("2001:db8")) return true;
  // Anything else we can't confidently rule in — reject by default.
  return true;
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
  if (u.username || u.password || (u.port && u.port !== "443")) return false;

  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "0.0.0.0") return false;
  // Reject `.local`, `.internal`, `.lan` etc. commonly used for intranet.
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home")) return false;

  const { isIp, ipv4, ipv6 } = parseHostname(host);
  if (isIp) {
    if (ipv4 && isPrivateOrReservedIpv4(ipv4)) return false;
    if (ipv6 && isPrivateOrReservedIpv6(ipv6)) return false;
  }

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
  options?: { method: "POST"; body: string },
): Promise<{ buffer: Buffer; contentType: string | null }> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid evidence download budget");
  }
  const deadline = Date.now() + timeoutMs;
  for (let redirects = 0; redirects <= 4; redirects++) {
    if (!isEvidenceUrlAllowed(url)) throw new Error("Evidence URL rejected: public HTTPS media required");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Evidence download timeout");
    const result = await new Promise<{ buffer: Buffer; contentType: string | null } | { redirect: string }>((resolve, reject) => {
      // Resolve inside the transport's lookup and pin the actual socket to a
      // vetted address. A preflight DNS check followed by fetch would permit
      // DNS rebinding between validation and connection.
      const req = request(url, {
        agent: false,
        method: options?.method ?? "GET",
        headers: { Accept: "image/*,video/*,application/octet-stream", ...(options ? { "Content-Type": "application/json" } : {}) },
        lookup(host, _options, callback) {
          lookup(host, { family: 4, all: true }).then((addresses) => {
            if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIpv4(address))) {
              callback(new Error("Evidence host resolves to a private or reserved address"), []);
              return;
            }
            // Node may request all addresses (autoSelectFamily). Never hand
            // the connector an address that was not checked above.
            if (_options.all) callback(null, addresses);
            else callback(null, addresses[0].address, 4);
          }, (error: Error) => callback(error, []));
        },
      });
      const timer = setTimeout(() => req.destroy(new Error("Evidence download timeout")), remaining);
      req.once("error", reject);
      req.once("close", () => clearTimeout(timer));
      req.once("response", (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          if (options) {
            res.destroy();
            reject(new Error("Webhook redirects are forbidden"));
            return;
          }
          try {
            const next = new URL(res.headers.location, url).href;
            res.destroy();
            resolve({ redirect: next });
          } catch {
            res.destroy();
            reject(new Error("Evidence redirect URL is malformed"));
          }
          return;
        }
        if (status < 200 || status >= 300) {
          res.destroy();
          reject(new Error(`Evidence HTTP ${status}`));
          return;
        }
        const length = Number(res.headers["content-length"]);
        if (Number.isFinite(length) && length > maxBytes) {
          res.destroy();
          reject(new Error(`Evidence Content-Length exceeds cap ${maxBytes}`));
          return;
        }
        let total = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy(new Error(`Evidence stream exceeded ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.once("error", reject);
        res.once("aborted", () => reject(new Error("Evidence response interrupted")));
        res.once("end", () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers["content-type"] ?? null }));
      });
      req.end(options?.body);
    });
    if (!("redirect" in result)) return result;
    url = result.redirect;
  }
  throw new Error("Evidence redirect limit exceeded");
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
