import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";

test("real credentials registration records one welcome bonus; duplicate and wrong-password requests are safe", async ({ playwright }) => {
  const url = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  test.skip(!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/summoner_verification", "Requires explicit isolated verification database");
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const run = randomUUID().replaceAll("-", "");
  const email = `registration-${run}@example.invalid`;
  const username = `registration_${run}`;
  const password = randomUUID() + "Aa9!";
  const first = await playwright.request.newContext();
  const second = await playwright.request.newContext();
  async function credentials(context: APIRequestContext, action: string, candidatePassword = password) {
    const { csrfToken } = await (await context.get(`${BASE}/api/auth/csrf`)).json();
    return context.post(`${BASE}/api/auth/callback/credentials`, {
      form: { csrfToken, email, username, password: candidatePassword, action, callbackUrl: `${BASE}/summons`, json: "true" },
    });
  }
  try {
    const registered = await credentials(first, "register");
    expect(registered.status()).toBe(200);
    const session = await (await first.get(`${BASE}/api/auth/session`)).json();
    expect(session.user.email).toBe(email);
    const id = session.user.id;
    const bonus = await db.query('SELECT amount,"balanceAfter" FROM "CreditTx" WHERE "userId"=$1 AND type=\'bonus\'', [id]);
    expect(bonus.rows).toEqual([{ amount: 50, balanceAfter: 50 }]);
    expect((await db.query('SELECT credits FROM "User" WHERE id=$1', [id])).rows).toEqual([{ credits: 50 }]);
    expect((await db.query('SELECT COUNT(*)::int AS count FROM "ActivityEvent" WHERE "userId"=$1 AND type=\'user_joined\'', [id])).rows[0].count).toBe(1);

    const duplicate = await credentials(second, "register");
    expect(duplicate.status()).toBe(401);
    const failure = await duplicate.json();
    expect(new URL(failure.url).searchParams.get("error")).toBe("Email already taken");
    expect((await db.query('SELECT COUNT(*)::int AS count FROM "CreditTx" WHERE "userId"=$1 AND type=\'bonus\'', [id])).rows[0].count).toBe(1);
    const wrongPassword = await credentials(second, "login", randomUUID());
    expect(wrongPassword.status()).toBe(401);
    expect((await (await second.get(`${BASE}/api/auth/session`)).json()).user).toBeUndefined();
    const loggedIn = await credentials(second, "login");
    expect(loggedIn.status()).toBe(200);
    expect((await (await second.get(`${BASE}/api/auth/session`)).json()).user.id).toBe(id);
    console.log(JSON.stringify({ registrationHttp: registered.status(), duplicateHttp: duplicate.status(), wrongPasswordHttp: wrongPassword.status(), loginHttp: loggedIn.status(), bonusRows: 1, credits: 50 }));
  } finally {
    await first.dispose(); await second.dispose();
    const ids = (await db.query('SELECT id FROM "User" WHERE email=$1', [email])).rows.map((row: { id: string }) => row.id);
    if (ids.length) {
      await db.query('DELETE FROM "CreditTx" WHERE "userId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "ActivityEvent" WHERE "userId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
    }
    await db.end();
  }
});
