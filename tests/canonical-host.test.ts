import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { canonicalRedirectUrl } from "../src/lib/canonical-host";
import { proxy } from "../src/proxy";

test("www requests retain path/query and redirect to one canonical OAuth origin", () => {
  assert.equal(
    canonicalRedirectUrl("https://www.summoner.world/api/auth/signin/google?callbackUrl=%2Fapp%2Ftoday"),
    "https://summoner.world/api/auth/signin/google?callbackUrl=%2Fapp%2Ftoday",
  );
  assert.equal(
    canonicalRedirectUrl("https://www.summoner.world/api/auth/callback/google?code=abc&state=xyz"),
    "https://summoner.world/api/auth/callback/google?code=abc&state=xyz",
  );
});

test("the proxy redirects legacy public domains, including OAuth paths", () => {
  const response = proxy(new NextRequest("https://gamble-ai-agent.vercel.app/api/auth/csrf"));
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "https://summoner.world/api/auth/csrf");
});

test("the canonical production host and local development remain untouched", () => {
  for (const url of ["https://summoner.world/app/today", "http://localhost:3000/api/auth/providers"]) {
    assert.equal(canonicalRedirectUrl(url), null);
    const response = proxy(new NextRequest(url));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  }
});

test("unknown hosts are not redirected to avoid rewriting external preview URLs", () => {
  assert.equal(canonicalRedirectUrl("https://preview.example.com/enter"), null);
});
