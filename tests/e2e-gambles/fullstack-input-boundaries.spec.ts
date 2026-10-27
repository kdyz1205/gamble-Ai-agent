import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

test("malformed requests are rejected without server crashes, credit changes or implicit location writes", async ({ playwright }) => {
  const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  expect(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification").toBe(true);
  expect(["localhost", "127.0.0.1"].includes(new URL(BASE).hostname)).toBe(true);
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const api = await playwright.request.newContext();
  const token = randomUUID().replaceAll("-", "");
  const email = `input-${token}@example.invalid`;
  let userId: string | undefined;
  const reports: string[] = [];
  const judgmentFixture = `judge_input_${token}`;
  let checks = 0;
  try {
    for (const endpoint of ["/api/challenges", "/api/challenges/discover"]) {
      for (const limit of ["-1", "0", "nope", "1.5", "9007199254740993"]) {
        expect((await api.get(BASE + endpoint + `?limit=${limit}`)).status()).toBe(400); checks++;
      }
    }
    for (const offset of ["-1", "NaN", "2junk", "2147483648"]) {
      expect((await api.get(BASE + `/api/challenges?offset=${offset}`)).status()).toBe(400); checks++;
    }
    expect((await api.get(BASE + "/api/users/nearby?lat=0&lng=0")).status()).toBe(401); checks++;
    const { csrfToken } = await (await api.get(BASE + "/api/auth/csrf")).json();
    const signup = await api.post(BASE + "/api/auth/callback/credentials", { form: {
      csrfToken, email, username: `input_${token}`, password: randomUUID() + "Aa9!", action: "register", json: "true", callbackUrl: BASE + "/app/today",
    } });
    expect(signup.status()).toBe(200);
    const session = await (await api.get(BASE + "/api/auth/session")).json();
    userId = session.user.id;
    const before = (await db.query('SELECT credits,latitude,longitude,"locationUpdatedAt" FROM "User" WHERE id=$1', [userId])).rows[0];
    await db.query('INSERT INTO "Challenge" (id,"creatorId",title,type,status,stake,"updatedAt") VALUES ($1,$2,$3,$4,$5,0,NOW())',
      [judgmentFixture, userId, "Synthetic invalid-judgment input fixture", "General", "cancelled"]);
    for (const suffix of ["judge", "judge/async"]) {
      for (const body of ["null", "[]", "{", "true", "7"]) {
        const invalid = await api.post(`${BASE}/api/challenges/${judgmentFixture}/${suffix}`, {
          data: body, headers: { "content-type": "application/json" },
        });
        expect(invalid.status(), `${suffix}: ${body}`).toBe(400);
        expect((await invalid.json()).error).toBe("A JSON object is required"); checks++;
      }
      // Empty bodies retain legacy default options; the cancelled fixture is
      // rejected by the existing lifecycle gate, never sent to an AI provider.
      const defaulted = await api.post(`${BASE}/api/challenges/${judgmentFixture}/${suffix}`);
      expect([400, 409]).toContain(defaulted.status());
      expect((await defaulted.json()).error).not.toBe("A JSON object is required"); checks++;
    }
    expect((await db.query('SELECT COUNT(*)::integer AS count FROM "Judgment" WHERE "challengeId"=$1', [judgmentFixture])).rows[0].count).toBe(0); checks++;
    expect((await db.query('SELECT COUNT(*)::integer AS count FROM "JudgeJob" WHERE "challengeId"=$1', [judgmentFixture])).rows[0].count).toBe(0); checks++;
    expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [judgmentFixture])).rows[0].status).toBe("cancelled"); checks++;
    const endpoints = ["/api/me/location", "/api/agent/respond", "/api/challenges/parse", "/api/challenges/adjust-draft",
      "/api/challenges/input_dummy_20261027/verdict-response", "/api/reviews/input_dummy_20261027/resolve"];
    for (const path of endpoints) {
      for (const body of ["null", "[]", "{"]) {
        const response = await api.post(BASE + path, { data: body, headers: { "content-type": "application/json" } });
        expect(response.status(), `${path}: ${body}`).toBe(400);
        expect((await response.json()).error).toBeTruthy(); checks++;
      }
    }
    for (const body of [{ instruction: "change it", draft: [] }, { instruction: "change it", draft: "not an object" }, { instruction: "   ", draft: {} }]) {
      expect((await api.post(BASE + "/api/challenges/adjust-draft", { data: body })).status()).toBe(400); checks++;
    }
    for (const query of ["lat=NaN&lng=0", "lat=91&lng=0", "lat=0&lng=181", "lat=0&lng=0&radius=-1", "lat=0&lng=0&radius=Infinity"]) {
      expect((await api.get(BASE + "/api/users/nearby?" + query)).status()).toBe(400); checks++;
    }
    const nearby = await api.get(BASE + "/api/users/nearby?lat=37.5&lng=-121.9&radius=10");
    expect(nearby.status()).toBe(200);
    expect(Array.isArray((await nearby.json()).users)).toBe(true);
    expect((await db.query('SELECT credits,latitude,longitude,"locationUpdatedAt" FROM "User" WHERE id=$1', [userId])).rows[0]).toEqual(before); checks++;
    const explicit = await api.post(BASE + "/api/me/location", { data: { lat: 0, lng: 0 } });
    expect(explicit.status()).toBe(200);
    const saved = (await db.query('SELECT latitude,longitude,credits FROM "User" WHERE id=$1', [userId])).rows[0];
    expect(saved).toEqual({ latitude: 0, longitude: 0, credits: before.credits }); checks++;
    for (const kind of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect((await api.post(BASE + "/api/support/report", { data: { kind, reason: "Synthetic invalid enum regression" } })).status()).toBe(400); checks++;
    }
    const report = await api.post(BASE + "/api/support/report", { data: { kind: "support_request", reason: "Synthetic support receipt regression", target: token } });
    expect(report.status()).toBe(200);
    const receipt = await report.json();
    expect(receipt.ok).toBe(true); expect(typeof receipt.reportId).toBe("string");
    reports.push(receipt.reportId);
    expect((await db.query('SELECT action FROM "AuditLog" WHERE id=$1', [receipt.reportId])).rows).toEqual([{ action: "support.support_request" }]); checks++;
    expect((await db.query('SELECT credits FROM "User" WHERE id=$1', [userId])).rows[0].credits).toBe(before.credits); checks++;
    console.log(`FULLSTACK_INPUT_HTTP_PASS ${checks} boundary checks with a real signed-in fixture, no AI calls, no balance changes`);
  } finally {
    await api.dispose();
    if (reports.length) await db.query('DELETE FROM "AuditLog" WHERE id=ANY($1::text[])', [reports]);
    const ids = (await db.query('SELECT id FROM "User" WHERE email=$1', [email])).rows.map((row: { id: string }) => row.id);
    if (ids.length) {
      await db.query('DELETE FROM "Challenge" WHERE id=$1 AND "creatorId"=ANY($2::text[])', [judgmentFixture, ids]);
      await db.query('DELETE FROM "CreditTx" WHERE "userId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "ActivityEvent" WHERE "userId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])', [ids]);
      await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]);
    }
    await db.end();
  }
});
