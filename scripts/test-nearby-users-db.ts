import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import prisma from "../src/lib/db";
import { findNearbyUsers } from "../src/lib/nearby-users";

const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
assert.ok(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification",
  "Nearby fixtures require isolated local summoner_verification");
const ids: string[] = [];
const run = randomUUID().replaceAll("-", "");
let checks = 0;
async function user(label: string, latitude: number, longitude: number) {
  const row = await prisma.user.create({ data: { email: `nearby-${label}-${run}@example.invalid`,
    username: `nearby_${label}_${run}`, latitude, longitude, credits: 0 } });
  ids.push(row.id); return row;
}
async function main() {
  const viewer = await user("viewer", 70, 80);
  const before = await prisma.user.findUniqueOrThrow({ where: { id: viewer.id },
    select: { latitude: true, longitude: true, locationUpdatedAt: true, credits: true } });
  const across = await user("dateline", 17.25, -179.97);
  const distant = await user("far", 17.25, -179.5);
  const dateline = await findNearbyUsers(viewer.id, { latitude: 17.25, longitude: 179.97, radiusMiles: 10 });
  assert(dateline.some((row) => row.id === across.id && row.distance > 0 && row.distance < 10)); checks++;
  assert(!dateline.some((row) => row.id === distant.id)); checks++;
  const nearIds = [];
  // Deliberately insert far-to-near. LIMIT must apply after exact distance order.
  for (let index = 25; index >= 1; index--) {
    const row = await user(`rank${index}`, 46.781234, 86.1234 + index * 0.001);
    nearIds.unshift(row.id);
  }
  const corner = await user("bboxCorner", 46.781234 + 0.12, 86.1234 + 0.175);
  const nearest = await findNearbyUsers(viewer.id, { latitude: 46.781234, longitude: 86.1234, radiusMiles: 10 });
  assert.equal(nearest.length, 20); checks++;
  assert.deepEqual(nearest.map((row) => row.id), nearIds.slice(0, 20)); checks++;
  assert(!nearest.some((row) => row.id === corner.id)); checks++;
  assert(nearest.every((row) => !Object.hasOwn(row, "latitude") && !Object.hasOwn(row, "longitude"))); checks++;
  assert(nearest.every((row) => typeof row.distance === "number" && Number.isFinite(row.distance) && row.distance <= 10)); checks++;
  const pole = await user("pole", 90, -170);
  assert((await findNearbyUsers(viewer.id, { latitude: 90, longitude: 170, radiusMiles: 1 })).some((row) => row.id === pole.id)); checks++;
  assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: viewer.id },
    select: { latitude: true, longitude: true, locationUpdatedAt: true, credits: true } }), before); checks++;
  assert.equal(await prisma.creditTx.count({ where: { userId: { in: ids } } }), 0); checks++;
  console.log(`NEARBY_USERS_DB_PASS ${checks} checks: antimeridian/poles, exact radius before nearest-20 limit, no coordinates exposed, no writes/credits`);
} 
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});
