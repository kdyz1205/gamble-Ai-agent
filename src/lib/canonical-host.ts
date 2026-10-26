/** Canonical public origin for auth cookies and OAuth callbacks. */
export const CANONICAL_SITE_ORIGIN = "https://summoner.world";

const REDIRECT_HOSTS = new Set([
  "www.summoner.world",
  "gamble-ai-agent.vercel.app",
  "www.gamble-ai-agent.vercel.app",
  "stepone-ai.vercel.app",
  "www.stepone-ai.vercel.app",
]);

/** Return a canonical URL only for known owned legacy/www hosts. */
export function canonicalRedirectUrl(rawUrl: string): string | null {
  const target = new URL(rawUrl);
  if (!REDIRECT_HOSTS.has(target.hostname.toLowerCase())) return null;
  target.protocol = "https:";
  target.hostname = "summoner.world";
  target.port = "";
  return target.toString();
}
