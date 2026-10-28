import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "../src/lib/db";
import { GET } from "../src/app/api/feed/route";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification",
  "Feed fixture verification requires isolated local summoner_verification; never production");
const tag = randomUUID().replaceAll("-", "");
const type = `public_feed_${tag}`;
const users: string[] = [], quests: string[] = [], events: string[] = [];
let checks = 0;
const eq = (actual: unknown, expected: unknown, label: string) => { assert.deepEqual(actual, expected, label); checks++; };
async function query(params = "") {
  return GET(new NextRequest(`http://localhost/api/feed?type=${type}&${params}`));
}
async function main() {
  const ordinary = await prisma.user.create({ data: { email: `member-${tag}@member.example`, username: `qa_member_${tag}`, credits: 20 } }); users.push(ordinary.id);
  const fixture = await prisma.user.create({ data: { email: `fixture-${tag}@EXAMPLE.INVALID`, username: `quiet_${tag}`, credits: 20 } }); users.push(fixture.id);
  const lookalike = await prisma.user.create({ data: { email: `member-${tag}@example.invalid.safe.example`, username: `qa_neighbour_${tag}`, credits: 20 } }); users.push(lookalike.id);
  async function quest(creatorId: string, visibility: string) {
    const row = await prisma.challenge.create({ data: { creatorId, title: `Feed fixture ${tag}`, type: "General", status: "open", stake: 0, isPublic: visibility === "public", visibility, evidenceType: "text" } });
    quests.push(row.id); return row.id;
  }
  const publicId = await quest(ordinary.id, "public");
  const fixtureId = await quest(fixture.id, "public");
  const privateId = await quest(ordinary.id, "invite_only");
  const seeds: Array<{ actor: string | null; quest: string | null; visible: boolean }> = [
    { actor: ordinary.id, quest: null, visible: true },
    { actor: fixture.id, quest: null, visible: false },
    { actor: null, quest: publicId, visible: true },
    { actor: null, quest: fixtureId, visible: false },
    { actor: ordinary.id, quest: fixtureId, visible: false },
    { actor: fixture.id, quest: publicId, visible: false },
    { actor: ordinary.id, quest: privateId, visible: false },
    { actor: ordinary.id, quest: publicId, visible: true },
    { actor: lookalike.id, quest: null, visible: true },
    { actor: null, quest: null, visible: true },
  ];
  const expected: string[] = [];
  for (const [i, seed] of seeds.entries()) {
    const row = await prisma.activityEvent.create({ data: {
      type, userId: seed.actor, challengeId: seed.quest, message: `Immutable event ${i} ${tag}`,
      metadata: JSON.stringify({ fixture: tag }), createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)),
    } });
    events.push(row.id); if (seed.visible) expected.unshift(row.id);
  }
  const before = await prisma.activityEvent.findMany({ where: { id: { in: events } }, orderBy: { id: "asc" } });
  const balances = await prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, credits: true }, orderBy: { id: "asc" } });
  const response = await query("limit=50");
  eq(response.status, 200, "Feed remains readable without authentication");
  const body = await response.json();
  eq(body.events.map((event: { id: string }) => event.id), expected, "Keep ordinary/public/null-actor events; exclude exact fixture actors and creators, and private Quests");
  eq(body.total, 5, "Count uses identical visibility/fixture policy");
  eq(body.events.some((event: { user?: { username: string } }) => event.user?.username === ordinary.username), true, "A qa_ username alone must never hide a real-account branch");
  eq(body.events.some((event: { user?: { username: string } }) => event.user?.username === lookalike.username), true, "Domain lookalikes are not classified as exact test fixtures");
  eq(JSON.stringify(body).includes("@"), false, "Email-based filtering must not expose emails in the public response");
  const second = await (await query("limit=2&offset=1")).json();
  eq(second.events.map((event: { id: string }) => event.id), expected.slice(1, 3), "Filter before pagination, not after LIMIT");
  eq(second.total, 5, "Pagination retains the filtered total");
  eq((await (await query("limit=2&offset=5")).json()).events, [], "Out-of-range page is empty without leaking excluded records");
  for (const params of ["limit=-1", "limit=NaN", "limit=1.5", "offset=-1", "offset=2147483648"]) {
    eq((await query(params)).status, 400, "Invalid pagination never reaches an unbounded query: " + params);
  }
  eq(await prisma.activityEvent.findMany({ where: { id: { in: events } }, orderBy: { id: "asc" } }), before, "Feed filtering never deletes/rewrites original activity or metadata");
  eq(await prisma.user.findMany({ where: { id: { in: users } }, select: { id: true, credits: true }, orderBy: { id: "asc" } }), balances, "All fixture balances remain unchanged");
  eq(await prisma.creditTx.count({ where: { userId: { in: users } } }), 0, "No credits or transactions are produced by a read");
  console.log(`PUBLIC_FEED_DB_PASS ${checks} checks: exact fixture isolation, ordinary qa_ name preserved, privacy/count/pagination, original rows and balances unchanged`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.activityEvent.deleteMany({ where: { id: { in: events } } });
  await prisma.challenge.deleteMany({ where: { id: { in: quests } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
