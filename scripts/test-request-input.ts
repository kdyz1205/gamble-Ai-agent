import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { readJsonObject, readOptionalJsonObject, pageInteger, nearbyQuery } from "../src/lib/request-input";
import { GET as discover } from "../src/app/api/challenges/discover/route";
import { POST as support } from "../src/app/api/support/report/route";
import prisma from "../src/lib/db";
import { POST as reviewDiagnostic } from "../src/app/api/diag/review-proof/route";

async function main() {
  let checks = 0;
  for (const value of [null, [], 1, true, "text"]) {
    assert.equal(await readJsonObject({ json: async () => value }), null); checks++;
  }
  assert.equal(await readJsonObject({ json: async () => { throw new SyntaxError("bad JSON"); } }), null); checks++;
  assert.deepEqual(await readJsonObject({ json: async () => ({ lat: 0 }) }), { lat: 0 }); checks++;
  for (const value of ["-1", "0", "1.5", "3garbage", "NaN", "Infinity", "1e309", "9007199254740993", " 3", "+2"]) {
    assert.equal(pageInteger(value, 20, 1, 50, true), null); checks++;
  }
  for (const [raw, expected] of [[null, 20], ["", 20], ["1", 1], ["50", 50], ["100", 50]] as const) {
    assert.equal(pageInteger(raw, 20, 1, 50, true), expected); checks++;
  }
  assert.equal(pageInteger("2147483648", 0, 0, 2147483647), null); checks++;
  assert.equal(pageInteger("0", 0, 0, 2147483647), 0); checks++;
  for (const raw of ["", "lat=0", "lat=NaN&lng=2", "lat=91&lng=0", "lat=0&lng=181", "lat=3junk&lng=2", "lat=0&lng=0&radius=-1", "lat=0&lng=0&radius=Infinity", "lat=0&lng=0&radius=0"]) {
    assert.equal(nearbyQuery(new URLSearchParams(raw)), null); checks++;
  }
  assert.deepEqual(nearbyQuery(new URLSearchParams("lat=0&lng=0")), { latitude: 0, longitude: 0, radiusMiles: 10 }); checks++;
  assert.deepEqual(nearbyQuery(new URLSearchParams("lat=-90&lng=180&radius=2.5")), { latitude: -90, longitude: 180, radiusMiles: 2.5 }); checks++;
  for (const text of ["", " ", "{}", "{\"tier\":2}"]) {
    assert.deepEqual(await readOptionalJsonObject({ text: async () => text }), text.trim() ? JSON.parse(text) : {}); checks++;
  }
  for (const text of ["null", "[]", "true", "3", "\"text\"", "{"]) {
    assert.equal(await readOptionalJsonObject({ text: async () => text }), null); checks++;
  }
  const priorToken = process.env.DIAG_TOKEN;
  process.env.DIAG_TOKEN = "synthetic-local-unit-token-never-production";
  try {
    for (const body of ["null", "[]", "{"]) {
      const invalid = new NextRequest("http://localhost/api/diag/review-proof", {
        method: "POST", headers: { "content-type": "application/json", "x-diag-token": process.env.DIAG_TOKEN }, body,
      });
      const response = await reviewDiagnostic(invalid);
      assert.equal(response.status, 400, "Authorized malformed diagnostics must not crash or mutate reviewer roles"); checks++;
      assert.match(response.headers.get("cache-control") ?? "", /no-store/); checks++;
      const forbidden = await reviewDiagnostic(new NextRequest("http://localhost/api/diag/review-proof", {
        method: "POST", headers: { "content-type": "application/json" }, body,
      }));
      assert.equal(forbidden.status, 401, "Diagnostics remain protected before body parsing"); checks++;
    }
  } finally { if (priorToken === undefined) delete process.env.DIAG_TOKEN; else process.env.DIAG_TOKEN = priorToken; }
  const previousFind = prisma.challenge.findMany;
  const previousAudit = prisma.auditLog.create;
  let databaseCalls = 0;
  prisma.challenge.findMany = (async () => { databaseCalls++; throw new Error("Invalid input reached database"); }) as typeof previousFind;
  prisma.auditLog.create = (async () => { databaseCalls++; return { id: "unexpected_write" }; }) as unknown as typeof previousAudit;
  try {
    for (const limit of ["-1", "zero", "1.5", "999999999999999999999"]) {
      const response = await discover(new NextRequest(`http://localhost:3000/api/challenges/discover?limit=${limit}`));
      assert.equal(response.status, 400, "Invalid pagination is a 400 before Prisma"); checks++;
    }
    for (const kind of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await support(new NextRequest("http://localhost:3000/api/support/report", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, reason: "A synthetic request validation regression." }),
      }));
      assert.equal(response.status, 400, "Object prototype keys are not support actions"); checks++;
    }
    assert.equal(databaseCalls, 0); checks++;
  } finally { prisma.challenge.findMany = previousFind; prisma.auditLog.create = previousAudit; }
  console.log(`REQUEST_INPUT_PASS ${checks} checks: object-only JSON, bounded integers, coordinate limits, prototype rejection, no invalid database access`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
