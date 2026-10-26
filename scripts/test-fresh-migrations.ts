/** Fresh install, populated legacy replay and failure preservation on real local PG. */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const ADDITIVE = "20261020090000_complete_challenge_schema";
const PROTECT = "20261020090100_protect_credit_ledger_user_fk";
const SUMMON_LEDGER = "20261024022500_summon_ledger_foundation";
const QUIZ_DUELS = "20261024074500_verified_free_quiz_duels";
const FREE_DRAW = "20261024200500_free_summon_draw_receipts";
const EVOLUTION = "20261025100000_audited_free_summon_evolution";
const PROTECTED_BANK = "20261025233000_protected_quiz_bank";
const SUMMON_TABLES = ["ProfessionXpEvent", "SummonDrawReceipt", "SummonEvolutionReceipt", "SummonInstance", "SummonTicket"];
const QUIZ_TABLES = ["QuizAttempt","QuizDuel","QuizProtectedQuestion"];
const addedColumns: Record<string, string[]> = {
  Challenge: ["arbiter", "disputeWindow", "eventTime", "evidenceHash", "fallbackRule", "joinWindow", "marketType", "paramsHash", "proofSource", "proofWindow", "proposition", "resolutionHash", "settlementMode", "stakeToken", "visibility"],
  Evidence: ["prepareError", "preparedAt", "preparedDurationSec", "preparedFrames", "preparedMode"],
  JudgeJob: ["heartbeatAt", "startedAt"],
};

async function main() {
  const originalURL = process.env.DATABASE_URL;
  const target = new URL(originalURL ?? "postgresql://missing");
  assert(["localhost", "127.0.0.1"].includes(target.hostname) && target.pathname === "/summoner_verification", "Only isolated local PostgreSQL is allowed");
  const run = randomUUID().replaceAll("-", "");
  const databases = ["fresh", "legacy", "duplicate", "orphan", "shadow"].map((kind) => `install_${kind}_${run}`);
  assert(databases.every((name) => /^install_[a-z]+_[a-f0-9]{32}$/.test(name)));
  const admin = new pg.Client({ connectionString: originalURL }); await admin.connect();
  const temp = await mkdtemp(join(tmpdir(), "summoner-migrations-"));
  const connections: pg.Client[] = []; let prisma: PrismaClient | undefined; let pool: pg.Pool | undefined;
  const cli = promisify(execFile);
  const url = (name: string) => { const value = new URL(target); value.pathname = `/${name}`; return value.toString(); };
  const connect = async (name: string) => { const value = new pg.Client({ connectionString: url(name) }); await value.connect(); connections.push(value); return value; };
  const allMigrations = resolve("prisma/migrations"); const baseline = join(temp, "baseline");
  const config = async (name: string, migrations: string) => {
    const path = join(temp, `${name}.config.ts`);
    // Absolute package URL keeps config loading independent of the temp folder.
    const imported = resolve("node_modules/prisma/config.js").replaceAll("\\", "/");
    await writeFile(path, `import {defineConfig} from ${JSON.stringify(imported)}; export default defineConfig({schema:${JSON.stringify(resolve("prisma/schema.prisma"))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.DATABASE_URL,shadowDatabaseUrl:process.env.SHADOW_DATABASE_URL}});`);
    return path;
  };
  const command = (database: string, args: string[], configPath: string) => cli(process.execPath,
    ["node_modules/prisma/build/index.js", ...args, "--config", configPath],
    { env: { ...process.env, DATABASE_URL: url(database), SHADOW_DATABASE_URL: url(databases[4]) }, timeout: 180_000, maxBuffer: 2_000_000 });
  const tables = ["User", "Challenge", "Participant", "Evidence", "CreditTx", "JudgeJob", "AuditLog"];
  const snapshot = async (db: pg.Client, stripAdded = false) => {
    const rows: Record<string, unknown[]> = {};
    for (const table of tables) {
      rows[table] = (await db.query(`SELECT to_jsonb(t) AS row FROM "${table}" t ORDER BY "id"`)).rows.map((entry: { row: Record<string, unknown> }) => {
        const row = { ...entry.row }; if (stripAdded) for (const column of addedColumns[table] ?? []) delete row[column]; return row;
      });
    }
    return rows;
  };
  const seed = (db: pg.Client) => db.query(`
    INSERT INTO "User" ("id","email","username","credits","updatedAt") VALUES ('qa-owner','qa-owner@example.invalid','qa-owner',45,NOW());
    INSERT INTO "Challenge" ("id","creatorId","title","type","status","stake","updatedAt") VALUES ('qa-quest','qa-owner','Preserved legacy quest','General','open',5,NOW());
    INSERT INTO "Participant" ("id","challengeId","userId","role","status") VALUES ('qa-seat','qa-quest','qa-owner','creator','accepted');
    INSERT INTO "Evidence" ("id","challengeId","userId","type","description") VALUES ('qa-proof','qa-quest','qa-owner','text','Keep this original proof');
    INSERT INTO "CreditTx" ("id","userId","challengeId","type","amount","balanceAfter") VALUES ('qa-stake','qa-owner','qa-quest','stake',-5,45);
    INSERT INTO "JudgeJob" ("id","challengeId","requestedByUserId","updatedAt") VALUES ('qa-job','qa-quest','qa-owner',NOW());
    INSERT INTO "AuditLog" ("id","action","challengeId","payload") VALUES ('qa-audit','qa.preserved','qa-quest','{"qa":true}')`);
  try {
    for (const name of databases) await admin.query(`CREATE DATABASE "${name}"`);
    await mkdir(baseline);
    // A genuine legacy baseline excludes every later additive migration.
    const entries = await readdir(allMigrations, { withFileTypes: true });
    const migrationFolders = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
    assert(migrationFolders.includes(SUMMON_LEDGER), "Summon ledger migration must be present");
    assert(migrationFolders.includes(QUIZ_DUELS), "Free Quiz migration must be present");
    assert(migrationFolders.includes(FREE_DRAW), "Audited free draw migration must be present");
    assert(migrationFolders.includes(EVOLUTION), "Verified evolution migration must be present");
    assert(migrationFolders.includes(PROTECTED_BANK), "Protected Quiz bank migration must be present");
    assert(PROTECTED_BANK > QUIZ_DUELS, "Private questions must not precede base Quiz schema");
    assert(EVOLUTION > FREE_DRAW, "Evolution FKs require free draw item foundations first");
    assert(FREE_DRAW > SUMMON_LEDGER && FREE_DRAW > QUIZ_DUELS,
      "Free draw foreign keys require the existing ticket and Quiz migration order");
    for (const entry of entries) if (![ADDITIVE, PROTECT, SUMMON_LEDGER, QUIZ_DUELS, FREE_DRAW, EVOLUTION, PROTECTED_BANK].includes(entry.name))
      await cp(join(allMigrations, entry.name), join(baseline, entry.name), { recursive: true });
    const freshConfig = await config("fresh", allMigrations); const legacyConfig = await config("legacy", baseline);
    const additive = await readFile(join(allMigrations, ADDITIVE, "migration.sql"), "utf8");
    const protection = await readFile(join(allMigrations, PROTECT, "migration.sql"), "utf8");
    const summonMigration = await readFile(join(allMigrations, SUMMON_LEDGER, "migration.sql"), "utf8");
    const quizMigration = await readFile(join(allMigrations, QUIZ_DUELS, "migration.sql"), "utf8");
    const drawMigration = await readFile(join(allMigrations, FREE_DRAW, "migration.sql"), "utf8");
    const evolutionMigration = await readFile(join(allMigrations, EVOLUTION, "migration.sql"), "utf8");
    const protectedBankMigration=await readFile(join(allMigrations,PROTECTED_BANK,"migration.sql"),"utf8");
    assert.doesNotMatch(protectedBankMigration.replace(/--[^\n]*/g,""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(protectedBankMigration, /ALTER\s+TABLE\s+"(?:CreditTx|Challenge|User|Judgment|QuizDuel|QuizAttempt)"/i);
    assert.doesNotMatch(evolutionMigration.replace(/--[^\n]*/g,""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(evolutionMigration, /ALTER\s+TABLE\s+"(?:CreditTx|Challenge|User|Judgment|Evidence)"/i);
    assert.doesNotMatch(drawMigration.replace(/--[^\n]*/g,""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(drawMigration, /ALTER\s+TABLE\s+"(?:CreditTx|Challenge|User|Judgment|Evidence)"/i);
    assert.doesNotMatch(quizMigration.replace(/--[^\n]*/g, ""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(quizMigration, /ALTER\s+TABLE\s+"(?:CreditTx|User|Challenge|Judgment|Evidence)"/i);
    assert.doesNotMatch(summonMigration.replace(/--[^\n]*/g, ""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(summonMigration, /ALTER\s+TABLE\s+"(?:CreditTx|Challenge|User|Judgment|Evidence)"/i);
    assert.doesNotMatch(additive.replace(/--[^\n]*/g, ""), /\bDROP\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    assert.doesNotMatch(protection.replace(/--[^\n]*/g, ""), /\bDROP\s+(TABLE|COLUMN)\b|\bDELETE\s+FROM\b|\bINSERT\s+INTO\b|\bUPDATE\s+"/i);
    await command(databases[0], ["migrate", "deploy"], freshConfig);
    const fresh = await connect(databases[0]);
    assert.equal((await fresh.query(`SELECT count(*)::int AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).rows[0].n, migrationFolders.length);
    const readSummonTables = async (db: pg.Client) => (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [SUMMON_TABLES])).rows.map((row: { table_name: string }) => row.table_name);
    assert.deepEqual(await readSummonTables(fresh), SUMMON_TABLES);
    const readQuizTables = async (db: pg.Client) => (await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [QUIZ_TABLES])).rows.map((row: {table_name:string}) => row.table_name);
    assert.deepEqual(await readQuizTables(fresh), QUIZ_TABLES);
    console.log("PASS additive Summon, free draw, evolution, public/private Quiz tables exist after migrations");
    await command(databases[0], ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], freshConfig);
    await command(databases[0], ["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-schema", "prisma/schema.prisma", "--exit-code"], freshConfig);
    console.log("PASS fresh migrate deploy and independent shadow replay exactly match canonical columns, types, defaults, indexes and constraints");

    pool = new pg.Pool({ connectionString: url(databases[0]) }); prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    const owner = await prisma.user.create({ data: { email: "fresh@example.invalid", username: "fresh-owner", credits: 50 } });
    const quest = await prisma.challenge.create({ data: { creatorId: owner.id, title: "Fresh install quest", type: "General" } });
    assert.equal(quest.isPublic, false); assert.equal(quest.stakeToken, "credits"); assert.equal(quest.settlementMode, "mutual_confirmation");
    await prisma.evidence.create({ data: { challengeId: quest.id, userId: owner.id, type: "text", description: "Fresh proof" } });
    await prisma.judgeJob.create({ data: { challengeId: quest.id, requestedByUserId: owner.id } });
    await prisma.creditTx.create({ data: { userId: owner.id, challengeId: quest.id, type: "bonus", amount: 50, balanceAfter: 50 } });
    const beforeDelete = await snapshot(fresh);
    await assert.rejects(() => prisma!.user.delete({ where: { id: owner.id } }), (error) => (error as { code?: string }).code === "P2003");
    assert.deepEqual(await snapshot(fresh), beforeDelete);
    await fresh.query(`UPDATE "User" SET id='fresh-updated-owner' WHERE id=$1`, [owner.id]);
    assert.equal((await fresh.query(`SELECT "userId" FROM "CreditTx"`)).rows[0].userId, "fresh-updated-owner");
    console.log("PASS actual Prisma create/proof/job reads succeed after migration; deleting a ledger owner fails atomically and ON UPDATE CASCADE remains intact");

    for (const name of databases.slice(1, 4)) await command(name, ["migrate", "deploy"], legacyConfig);
    const legacy = await connect(databases[1]); await seed(legacy);
    const original = await snapshot(legacy, true);
    await legacy.query(additive); await legacy.query(protection);
    assert.deepEqual(await snapshot(legacy, true), original);
    await legacy.query(`UPDATE "Challenge" SET "proposition"='Preserve this custom proposition', "visibility"='invite_only' WHERE id='qa-quest';
      UPDATE "Evidence" SET "preparedFrames"='["qa-preserved-frame"]', "preparedMode"='photo' WHERE id='qa-proof'`);
    const manualHotfix = await snapshot(legacy);
    await legacy.query(additive); await legacy.query(protection);
    await command(databases[1], ["migrate", "deploy"], freshConfig);
    assert.deepEqual(await snapshot(legacy), manualHotfix);
    assert.deepEqual(await readSummonTables(legacy), SUMMON_TABLES);
    assert.deepEqual(await readQuizTables(legacy), QUIZ_TABLES);
    assert.equal((await legacy.query(`SELECT "isPublic" FROM "Challenge" WHERE id='qa-quest'`)).rows[0].isPublic, true);
    await command(databases[1], ["migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"], freshConfig);
    console.log("PASS populated legacy migration and repeated/manual-hotfix replay preserve every old field, balance, proof, audit, ledger, custom value and visibility");

    const duplicate = await connect(databases[2]); await seed(duplicate);
    await duplicate.query(`INSERT INTO "Evidence" ("id","challengeId","userId","type","description") VALUES ('qa-duplicate','qa-quest','qa-owner','text','Retain both duplicate proofs')`);
    const beforeDuplicate = await snapshot(duplicate);
    await assert.rejects(() => duplicate.query(additive), (error) => (error as { code?: string }).code === "23505"); await duplicate.query("ROLLBACK");
    assert.deepEqual(await snapshot(duplicate), beforeDuplicate);
    assert.equal((await duplicate.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='Evidence' AND column_name='preparedFrames'`)).rows[0].n, 0);
    console.log("PASS duplicate proof pairs stop the unique-index migration and roll back all new metadata without removing either proof or changing funds");

    const orphan = await connect(databases[3]); await seed(orphan);
    await orphan.query(`ALTER TABLE "CreditTx" DROP CONSTRAINT "CreditTx_userId_fkey";
      INSERT INTO "CreditTx" ("id","userId","type","amount","balanceAfter") VALUES ('qa-orphan','missing-user','bonus',1,1);
      ALTER TABLE "CreditTx" ADD CONSTRAINT "CreditTx_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID`);
    const beforeOrphan = await snapshot(orphan);
    const constraint = () => orphan.query(`SELECT confdeltype,confupdtype,convalidated FROM pg_constraint WHERE conrelid='"CreditTx"'::regclass AND conname='CreditTx_userId_fkey'`);
    const beforeConstraint = (await constraint()).rows;
    await assert.rejects(() => orphan.query(protection), (error) => (error as { code?: string }).code === "23503"); await orphan.query("ROLLBACK");
    assert.deepEqual((await constraint()).rows, beforeConstraint); assert.deepEqual(await snapshot(orphan), beforeOrphan);
    console.log("PASS orphan validation failure restores the original FK metadata and preserves every user/ledger row without deleting or repairing data");
  } finally {
    await prisma?.$disconnect(); await pool?.end();
    for (const connection of connections) await connection.end();
    for (const name of databases) await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
    const resolved = resolve(temp);
    assert.equal(dirname(resolved), resolve(tmpdir())); assert(basename(resolved).startsWith("summoner-migrations-"));
    await rm(resolved, { recursive: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
