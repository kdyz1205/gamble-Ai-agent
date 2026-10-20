import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CredentialsConfig } from "next-auth/providers/credentials";
import type { User } from "next-auth";
import bcrypt from "bcryptjs";
import prisma from "../src/lib/db";
import { authOptions } from "../src/lib/auth-options";
import { AUTH_UNAVAILABLE_MESSAGE, OAuthLinkRequiredError } from "../src/lib/auth-provisioning";
import { COSTS } from "../src/lib/credits";

const provider = authOptions.providers.find((item) => item.id === "credentials");
assert(provider && provider.type === "credentials");
// NextAuth merges provider.options into the runtime provider. Use that exact
// installed authorize callback, rather than its factory's default null stub.
const configured = provider as CredentialsConfig & { options?: Partial<CredentialsConfig> };
const credentialsAuthorize = configured.options?.authorize ?? configured.authorize;
const request = { body: {}, query: {}, headers: {}, method: "POST" as const };
const authorize = async (input: Record<string, string>) => credentialsAuthorize(input, request);
const safeFailure = (error: unknown) => {
  assert(error instanceof Error);
  assert.equal(error.message, AUTH_UNAVAILABLE_MESSAGE);
  assert.doesNotMatch(error.message, /Prisma|private-db|not-a-real-secret|5432|SELECT|INSERT/);
  return true;
};

async function main() {
  if (process.argv.includes("--database-unavailable")) {
    await assert.rejects(() => authorize({ email: "missing@example.invalid", password: "verification" }), safeFailure);
    console.log("PASS actual credentials authorize against unavailable PostgreSQL returns only the public auth error");
    return;
  }
  const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname), "Requires an explicit isolated local database");
  const run = randomUUID().replaceAll("-", "");
  const emails: string[] = [];
  const functionName = `auth_signup_failure_${run}`;
  const triggerName = `auth_signup_trigger_${run}`;
  const email = (label: string) => { const value = `${label}-${run}@example.invalid`; emails.push(value); return value; };
  const password = `verification-${run}`;
  const register = (email: string, username: string) => authorize({ email, username, password, action: "register" });
  const signIn = authOptions.callbacks?.signIn;
  assert(signIn);
  // Only exercise our post-provider callback contract with fixture identities.
  // No OAuth tokens are invented, no Google endpoint is called, and these tests
  // do not prove third-party OAuth verification or adapter account linking.
  const google = async (address: string, id: string) => {
    const user: User = { id, email: address, name: "Callback fixture", image: null };
    const profile = { email: address, email_verified: true };
    const accepted = await signIn({ user, account: { provider: "google", type: "oauth", providerAccountId: id }, profile });
    assert.equal(accepted, true); return user;
  };
  const counts = async (userId: string) => ({
    bonus: await prisma.creditTx.count({ where: { userId, type: "bonus" } }),
    events: await prisma.activityEvent.count({ where: { userId, type: "user_joined" } }),
  });
  async function failWrite(table: "CreditTx" | "ActivityEvent", address: string, fn: () => Promise<unknown>) {
    assert.match(address, /^[a-zA-Z0-9@._-]+$/);
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION "${functionName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM "User" WHERE id=NEW."userId" AND email='${address}') THEN RAISE EXCEPTION 'Cannot connect to private-db.example:5432 password=not-a-real-secret'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION "${functionName}"()`);
    try { await assert.rejects(fn, safeFailure); }
    finally { await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "${table}"`); }
    assert.equal(await prisma.user.findUnique({ where: { email: address } }), null);
  }
  try {
    const registeredEmail = email("registered");
    const username = `registered_${run}`;
    const created = await register(registeredEmail, username); assert(created);
    const row = await prisma.user.findUniqueOrThrow({ where: { email: registeredEmail } });
    assert.equal(row.credits, COSTS.SIGNUP_BONUS);
    assert.equal(row.emailVerified, null);
    assert.notEqual(row.passwordHash, password);
    assert(await bcrypt.compare(password, row.passwordHash!));
    assert.deepEqual(await counts(row.id), { bonus: 1, events: 1 });
    const bonus = await prisma.creditTx.findFirstOrThrow({ where: { userId: row.id, type: "bonus" } });
    assert.equal(bonus.amount, COSTS.SIGNUP_BONUS); assert.equal(bonus.balanceAfter, COSTS.SIGNUP_BONUS);
    assert.equal(bonus.idempotencyKey, `signup:bonus:${row.id}`);
    assert.equal((await authorize({ email: registeredEmail, password }))?.id, row.id);
    assert.equal(await authorize({ email: registeredEmail, password: "wrong" }), null);
    const jwt = await authOptions.callbacks!.jwt!({ token: {}, user: created, account: null });
    assert.equal(jwt.userId, row.id); assert.equal(jwt.credits, COSTS.SIGNUP_BONUS); assert.equal(jwt.username, username);
    console.log("PASS actual credentials register/login/JWT callbacks preserve password identity and issue one atomic welcome ledger/activity receipt");

    await assert.rejects(() => register(registeredEmail, username), { message: "Email already taken" });
    const duplicateNameEmail = email("duplicate-name");
    await assert.rejects(() => register(duplicateNameEmail, username), { message: "Username already taken" });
    assert.equal(await prisma.user.findUnique({ where: { email: duplicateNameEmail } }), null);
    assert.deepEqual(await counts(row.id), { bonus: 1, events: 1 });
    const racedEmail = email("credentials-race");
    const raced = await Promise.allSettled(Array.from({ length: 6 }, () => register(racedEmail, `race_${run}`)));
    assert.equal(raced.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of raced) if (result.status === "rejected") assert.equal((result.reason as Error).message, "Email already taken");
    const racedUser = await prisma.user.findUniqueOrThrow({ where: { email: racedEmail } });
    assert.deepEqual(await counts(racedUser.id), { bonus: 1, events: 1 });
    assert.equal(racedUser.credits, COSTS.SIGNUP_BONUS);
    const nameRaceEmails = Array.from({ length: 6 }, (_, i) => email(`username-race-${i}`));
    const nameRace = await Promise.allSettled(nameRaceEmails.map((address) => register(address, `same_username_${run}`)));
    assert.equal(nameRace.filter((result) => result.status === "fulfilled").length, 1);
    for (const result of nameRace) if (result.status === "rejected") assert.equal((result.reason as Error).message, "Username already taken");
    const nameWinner = await prisma.user.findMany({ where: { email: { in: nameRaceEmails } } });
    assert.equal(nameWinner.length, 1);
    assert.deepEqual(await counts(nameWinner[0].id), { bonus: 1, events: 1 });
    console.log("PASS duplicate email/username and concurrent same-email/same-username registration callbacks leave one account and one welcome bonus");

    for (const table of ["CreditTx", "ActivityEvent"] as const) {
      const failedEmail = email(`credentials-${table.toLowerCase()}`);
      await failWrite(table, failedEmail, () => register(failedEmail, `failed_${table}_${run}`));
    }
    console.log("PASS real ledger/activity trigger failures roll back credentials signup completely and expose no database host/query/secret text");

    const googleEmail = email("google-callback");
    const googleUser = await google(googleEmail, `google_${run}`);
    const googleRow = await prisma.user.findUniqueOrThrow({ where: { email: googleEmail } });
    assert.equal(googleUser.id, googleRow.id); assert.equal(googleRow.passwordHash, null);
    assert(googleRow.emailVerified instanceof Date); assert.equal(googleRow.credits, COSTS.SIGNUP_BONUS);
    assert.deepEqual(await counts(googleRow.id), { bonus: 1, events: 1 });
    assert.equal((await google(googleEmail, `google_${run}`)).id, googleRow.id);
    await assert.rejects(() => google(registeredEmail, `unlinked_${run}`), OAuthLinkRequiredError);
    assert.equal(await prisma.account.count({ where: { userId: row.id } }), 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: row.id } })).passwordHash, row.passwordHash);
    assert.deepEqual(await counts(row.id), { bonus: 1, events: 1 });
    const concurrentGoogleEmail = email("google-race");
    const googleCallbacks = await Promise.all(Array.from({ length: 6 }, () => google(concurrentGoogleEmail, `google_race_${run}`)));
    assert.equal(new Set(googleCallbacks.map((user) => user.id)).size, 1);
    assert.deepEqual(await counts(googleCallbacks[0].id), { bonus: 1, events: 1 });
    console.log("PASS downstream Google callback fixtures reject unverified credential merging and converge on one verified Google identity/bonus under retries and concurrency; OAuth itself is not exercised");

    for (const table of ["CreditTx", "ActivityEvent"] as const) {
      const failedEmail = email(`google-${table.toLowerCase()}`);
      const failedId = `failed_${table}_${run}`;
      await failWrite(table, failedEmail, () => google(failedEmail, failedId));
      assert.equal(await prisma.creditTx.count({ where: { userId: failedId } }), 0);
      assert.equal(await prisma.activityEvent.count({ where: { userId: failedId } }), 0);
    }
    console.log("PASS downstream Google signup ledger/activity failures leave no partial account, balance, bonus or activity rows");

    const child = await promisify(execFile)(process.execPath, ["--import", "tsx", "scripts/test-auth-provisioning.ts", "--database-unavailable"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "postgresql://postgres:verification-only@127.0.0.1:1/no_database" }, timeout: 30_000,
    });
    assert.match(child.stdout, /PASS actual credentials authorize against unavailable PostgreSQL/);
    assert.doesNotMatch(child.stderr, /private-db|127\.0\.0\.1|Prisma|password/);
    console.log(child.stdout.trim());
    console.log(JSON.stringify({ run, expectedWelcomeBonus: COSTS.SIGNUP_BONUS, credentialsRace: 6, usernameRace: 6, googleCallbackRace: 6, injectedFailures: 4, realOAuthExercised: false }));
  } finally {
    for (const table of ["CreditTx", "ActivityEvent"]) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "${table}"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${functionName}"()`);
    const ids = (await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((user) => user.id);
    await prisma.activityEvent.deleteMany({ where: { userId: { in: ids } } });
    await prisma.creditTx.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
