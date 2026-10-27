import assert from "node:assert/strict";
import { createAuthAttemptController, credentialsSignInSucceeded, safeAuthReturnTo } from "../src/lib/auth-client-flow";

let checks = 0;
const eq = (actual: unknown, expected: unknown, message: string) => { assert.equal(actual, expected, message); checks++; };
for (const result of [undefined, null, {}, { ok: false, status: 200 }, { ok: true, status: 500 }, { ok: true, status: 200, error: "CredentialsSignin" }, { ok: true }, { status: 200 }, { ok: "true", status: 200 }]) {
  eq(credentialsSignInSucceeded(result), false, "Missing/error/non-success response cannot mark a user signed in");
}
eq(credentialsSignInSucceeded({ ok: true, status: 200, error: null }), true, "Actual successful NextAuth response is accepted");
const lifecycle = createAuthAttemptController();
const first = lifecycle.begin()!;
eq(lifecycle.begin(), null, "Synchronous double submit has only one owner");
lifecycle.invalidate();
const second = lifecycle.begin()!;
eq(lifecycle.current(first), false, "Closing/reopening invalidates old response and timer");
lifecycle.finish(first);
eq(lifecycle.begin(), null, "Old finally cannot unlock the new pending action");
eq(lifecycle.current(second), true, "New action remains valid");
lifecycle.finish(second);
eq(lifecycle.current(second), true, "Success timer remains valid until a new lifecycle starts");
const third = lifecycle.begin()!;
eq(lifecycle.current(second), false, "New action invalidates previous success timer");
eq(lifecycle.current(third), true, "New action owns the dialog");
lifecycle.invalidate();
eq(lifecycle.current(third), false, "Unmount invalidates last completion");
const origin = "https://summoner.world";
for (const target of [undefined, "", "//evil.example/", "https://evil.example/app/today", "javascript:alert(1)", "/\\evil.example", "/%5c%5cevil.example", "/%2f%2fevil.example", "/auth/signin", "/api/auth/callback/google", "/app\n/today", "https://summoner.world@evil.example/", "https://x:y@summoner.world/app/today", "relative/path"]) {
  eq(safeAuthReturnTo(target, origin), "/app/today", "Unsafe/external/auth-loop destinations are refused");
}
eq(safeAuthReturnTo("/join/quest-123?invite=abc#proof", origin), "/join/quest-123?invite=abc#proof", "Quest invitation destination is preserved");
eq(safeAuthReturnTo("https://summoner.world/app/quiz?id=q1", origin), "/app/quiz?id=q1", "Same-origin absolute NextAuth callback is preserved");
eq(safeAuthReturnTo("/app/quests"), "/app/quests", "Relative destinations work before client hydration");
eq(safeAuthReturnTo("https://summoner.world/app/quiz"), "/app/today", "Absolute destination requires a verified current origin");
console.log(`PASS auth client flow: ${checks} assertions covering missing success receipts, double-submit, stale completion/finally/timer, and safe quest return URLs`);
