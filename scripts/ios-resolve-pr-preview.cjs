/**
 * Resolve the real current-PR Vercel branch preview for read-only native iOS
 * Simulator QA. Do not silently reuse a pinned integration preview: that
 * would test a different UI commit even when xcodebuild itself succeeded.
 *
 * Uses the verified Vercel GitHub bot comment and an exact-head Vercel status.
 * No writes to production, App Store Connect or live user data.
 */
const fs = require("node:fs");
const path = require("node:path");
const { validate } = require("./ios-verify-target.cjs");

function pickPreviewUrl(comments) {
  const sorted = [...comments]
    .filter(c => c?.user?.login === "vercel[bot]")
    .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
  for (const comment of sorted) {
    const rows = String(comment.body || "").split(/\r?\n/);
    const row = rows.find(line => line.includes("[stubborn](") && line.includes("[Preview]("));
    if (!row || !row.includes("[Ready](")) continue;
    const match = row.match(/\[Preview\]\((https:\/\/[^)\s]+)\)/);
    if (!match) continue;
    try {
      const bare = new URL(match[1]);
      if (bare.pathname !== "/" || bare.search || bare.hash) continue;
      return validate("preview", bare.origin + "/app").url;
    } catch { /* Refuse untrusted/malformed preview URLs. */ }
  }
  throw new Error("No Ready, authorized SUM preview in the Vercel bot's PR comment");
}

function statusMatchesHead(payload) {
  return Array.isArray(payload?.statuses) &&
    payload.statuses.some(s => s.context === "Vercel" && s.state === "success");
}

async function github(pathname, token) {
  const api = process.env.GITHUB_API_URL || "https://api.github.com";
  const response = await fetch(api + pathname, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "summonworld-ios-exact-pr-preview"
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("GitHub API " + response.status + " for " + pathname.split("?")[0]);
  return response.json();
}

async function resolveFromEvent(event, repo, token) {
  const number = event?.pull_request?.number;
  const sha = event?.pull_request?.head?.sha;
  if (!Number.isInteger(number) || !/^[a-f0-9]{40}$/.test(String(sha)))
    throw new Error("An exact PR number and 40-character head SHA are required");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !token) throw new Error("GitHub repository/token unavailable");

  for (let attempt = 0; attempt < 24; attempt++) {
    const [state, comments] = await Promise.all([
      github("/repos/" + repo + "/commits/" + sha + "/status", token),
      github("/repos/" + repo + "/issues/" + number + "/comments?per_page=100", token)
    ]);
    if (statusMatchesHead(state)) {
      try { return { sha, number, url: pickPreviewUrl(comments) }; } catch {}
    }
    if (attempt === 23) break;
    console.log("IOS_EXACT_HEAD_PREVIEW_PENDING", attempt + 1);
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error("Current PR Vercel preview is not Ready; refusing stale host fallback");
}

async function main() {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  const result = await resolveFromEvent(event, process.env.GITHUB_REPOSITORY, process.env.GITHUB_TOKEN);
  if (!process.env.GITHUB_ENV) throw new Error("GITHUB_ENV is unavailable");
  fs.appendFileSync(process.env.GITHUB_ENV, "\nSUM_IOS_APP_URL=" + result.url + "\n");
  const directory = path.resolve("ios/build/simulator-evidence");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "resolved-target.json"),
    JSON.stringify({ ...result, resolvedAt: new Date().toISOString() }, null, 2));
  console.log("IOS_SIMULATOR_TARGET_EXACT_PR_HEAD", result.sha, result.number, result.url);
}

if (require.main === module) {
  main().catch(error => { console.error("IOS_TARGET_RESOLVE_FAILED:", error.message); process.exitCode = 1; });
}
module.exports = { pickPreviewUrl, statusMatchesHead, resolveFromEvent };
