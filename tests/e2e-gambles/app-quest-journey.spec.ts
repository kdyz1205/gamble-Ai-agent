import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test, type BrowserContext } from "@playwright/test";

const base = process.env.TEST_BASE_URL || "http://localhost:3000";

test.use({ viewport: { width: 390, height: 844 }, video: "off" });

/**
 * Safe, isolated mobile-Web-App journey. Everything uses zero stake, two new
 * disposable accounts and localhost PostgreSQL; no external paid AI model.
 * Exercises the exact App proof and verdict controls, and proves AI failure
 * doesn't invent victory/settlement/reward.
 */
test("App: two-player proof, guarded referee, consented deadline verdict, no counterfeit XP", async ({ browser }) => {
  test.setTimeout(280_000);
  const dbUrl = new URL(process.env.DATABASE_URL || "postgresql://invalid/none");
  test.skip(
    !["localhost", "127.0.0.1"].includes(dbUrl.hostname) ||
    dbUrl.pathname !== "/summoner_verification" ||
    process.env.AI_ENABLED !== "false",
    "Only isolated summoner_verification with AI explicitly disabled",
  );

  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const tag = randomUUID().replace(/-/g, "").slice(0, 14);
  const people: Array<{ id: string; context: BrowserContext }> = [];
  const questIds: string[] = [];
  async function register(role: string) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true,
      hasTouch: true, reducedMotion: "reduce",
    });
    const csrf = (await (await context.request.get(base + "/api/auth/csrf")).json()).csrfToken;
    const username = "app_journey_" + role + "_" + tag;
    const email = username + "@example.invalid";
    const registered = await context.request.post(base + "/api/auth/callback/credentials", {
      form: {
        csrfToken: csrf, action: "register", email,
        username, password: randomUUID() + "aA9!",
        callbackUrl: base + "/app", json: "true",
      },
    });
    expect(registered.status(), await registered.text()).toBe(200);
    const session = (await (await context.request.get(base + "/api/auth/session")).json()).user;
    expect(session?.email).toBe(email);
    people.push({ id: session.id as string, context });
    return { id: session.id as string, context };
  }
  async function createFree(creator: BrowserContext, title: string, evidenceType = "text") {
    const response = await creator.request.post(base + "/api/challenges", {
      data: {
        title, type: "General", stake: 0, evidenceType,
        visibility: "invite_only", isPublic: false, deadline: "2 hours",
        rules: "Each accepted player supplies their own written evidence. No guesses when evidence is absent.",
      },
    });
    expect(response.status(), await response.text()).toBe(201);
    const id = (await response.json()).challenge.id as string;
    questIds.push(id);
    return id;
  }
  try {
    const creator = await register("creator");
    const friend = await register("friend");
    const initialBalances = (await db.query(
      'SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id',
      [[creator.id, friend.id]],
    )).rows;

    const proofQuest = await createFree(creator.context, "App evidence flow " + tag);
    const invitation = await friend.context.newPage();
    await invitation.goto(base + "/app/join?id=" + proofQuest);
    await expect(invitation.getByTestId("ios-quest-invite")).toBeVisible();
    await expect(invitation.getByTestId("ios-accept-quest")).toBeDisabled();
    // Translate the REAL server-bound acceptance screen, not a mock fixture.
    await invitation.evaluate(()=>{
      localStorage.setItem("sum-language","zh");
      window.dispatchEvent(new Event("sum-language-changed"));
    });
    await expect(invitation.getByText("我已阅读并同意本 Quest 的规则与证据要求。")).toBeVisible();
    await expect(invitation.getByTestId("ios-accept-quest")).toHaveText("确认规则并加入 Quest");
    await expect(invitation.getByTestId("ios-accept-quest")).toBeDisabled();
    await invitation.getByTestId("ios-accept-rules").check();
    const accepted = invitation.waitForResponse(res =>
      res.url().endsWith("/api/challenges/" + proofQuest + "/accept") &&
      res.request().method() === "POST");
    await invitation.getByTestId("ios-accept-quest").click();
    expect((await accepted).status(), await (await accepted).text()).toBe(200);
    await expect(invitation).toHaveURL(/\/app\/quest\?id=/);
    await invitation.close();

    for (const [participant, note] of [[creator, "Creator wrote own observation"], [friend, "Friend wrote own observation"]] as const) {
      const page = await participant.context.newPage();
      await page.goto(base + "/app/quest?id=" + proofQuest);
      const chinese=participant.id===friend.id;
      const proofLink=page.getByRole("link", {name:chinese?"提交证据":"Submit your proof"});
      await expect(proofLink).toBeVisible();
      await proofLink.click();
      await expect(page).toHaveURL(/\/app\/evidence-add\?id=/);
      await page.locator("#ios-proof-note").fill(note + " " + tag);
      await page.getByRole("button", {
        name:chinese?"保存书面证据":"Save written evidence",
      }).click();
      await expect(page.getByText(chinese?"你的证据已保存。":"Your proof was saved.")).toBeVisible();
      await page.close();
    }

    expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [proofQuest])).rows[0].status).toBe("judging");
    expect((await db.query('SELECT COUNT(*)::int AS count FROM "Evidence" WHERE "challengeId"=$1', [proofQuest])).rows[0].count).toBe(2);
    const creatorPage = await creator.context.newPage();
    await creatorPage.goto(base + "/app/quest?id=" + proofQuest);
    await expect(creatorPage.getByTestId("ios-judge-gate")).toBeVisible();
    const trigger = creatorPage.getByTestId("ios-run-judge");
    await expect(trigger).toBeEnabled();
    await expect(trigger).toHaveText(/free/i);

    const friendPage = await friend.context.newPage();
    await friendPage.goto(base + "/app/quest?id=" + proofQuest);
    await expect(friendPage.getByTestId("ios-judge-gate")).toBeVisible();
    await expect(friendPage.getByTestId("ios-run-judge")).toHaveCount(0);
    const jobRequest = creatorPage.waitForResponse(r =>
      r.url().endsWith("/api/challenges/" + proofQuest + "/judge/async") &&
      r.request().method() === "POST");
    await trigger.click();
    const admitted = await jobRequest;
    expect(admitted.status(), await admitted.text()).toBe(202);
    const { jobId } = await admitted.json();
    expect(jobId).toBeTruthy();

    await expect.poll(async () => {
      const response = await creator.context.request.get(base + "/api/judge-jobs/" + jobId);
      expect(response.status()).toBe(200);
      return (await response.json()).status as string;
    }, { timeout: 80_000, intervals: [1000, 1500, 2500, 5000] }).toBe("failed");
    const prior = await creator.context.request.get(base + "/api/challenges/" + proofQuest + "/judge-job");
    expect(prior.status()).toBe(200);
    expect((await prior.json()).job).toEqual({ jobId, status: "failed" });
    expect((await friend.context.request.get(
      base + "/api/challenges/" + proofQuest + "/judge-job",
    )).status()).toBe(200);
    const unrelated = await browser.newContext();
    try {
      expect((await unrelated.request.get(
        base + "/api/challenges/" + proofQuest + "/judge-job",
      )).status()).toBe(401);
    } finally {
      await unrelated.close();
    }
    await creatorPage.reload();
    await expect(creatorPage.getByText("Previous referee review failed.", { exact: false }))
      .toBeVisible({ timeout: 20_000 });
    expect((await db.query(
      'SELECT COUNT(*)::int AS n FROM "JudgeJob" WHERE "challengeId"=$1',
      [proofQuest],
    )).rows[0].n).toBe(1);
    expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [proofQuest])).rows[0].status).toBe("judging");
    expect((await db.query('SELECT COUNT(*)::int AS n FROM "Judgment" WHERE "challengeId"=$1', [proofQuest])).rows[0].n).toBe(0);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM "CreditTx" WHERE "challengeId"=$1', [proofQuest])).rows[0].n).toBe(0);
    await creatorPage.close();
    await friendPage.close();

    // Separate fail-closed no-proof case proves that real participant consent
    // is reachable in /app/quest; the deadline rule must never invent a winner.
    // The same in-app proof page must offer the real file-picker/uploader.
    // Force a transfer failure and prove no Evidence record was minted.
    const photoQuest = await createFree(creator.context, "App photo upload failure " + tag, "photo");
    expect((await friend.context.request.post(base + "/api/challenges/" + photoQuest + "/accept")).status()).toBe(200);
    const photoPage = await creator.context.newPage();
    await photoPage.route("**/api/challenges/" + photoQuest + "/evidence/blob-handle", route =>
      route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test Blob disabled" }) }));
    await photoPage.route("**/api/uploads/evidence-presign", route =>
      route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ uploadUrl: "https://no-upload.example.invalid/evidence.png",
          publicUrl: "https://no-upload.example.invalid/evidence.png" }) }));
    let rejectedUploadAttempts = 0;
    await photoPage.route("https://no-upload.example.invalid/evidence.png", route => {
      rejectedUploadAttempts++;
      return route.fulfill({ status: 403, body: "Upload forbidden by fixture" });
    });
    await photoPage.goto(base + "/app/evidence-add?id=" + photoQuest);
    await expect(photoPage.getByTestId("ios-app-media-uploader")).toBeVisible();
    const chooser = photoPage.waitForEvent("filechooser");
    await photoPage.getByRole("button", { name: "Upload photo" }).click();
    await (await chooser).setFiles({
      name: "isolated-test.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9SIZ0V4AAAAASUVORK5CYII=", "base64"),
    });
    await photoPage.getByRole("button", { name: "Submit proof" }).click();
    await expect(photoPage.getByText(/upload failed|proof was not submitted|Upload forbidden/i).first())
      .toBeVisible({ timeout: 20_000 });
    expect(rejectedUploadAttempts).toBeGreaterThan(0);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM "Evidence" WHERE "challengeId"=$1', [photoQuest])).rows[0].n).toBe(0);
    expect((await db.query('SELECT status FROM "Challenge" WHERE id=$1', [photoQuest])).rows[0].status).toBe("live");
    await photoPage.close();

    const deadlineQuest = await createFree(creator.context, "App no-proof deadline " + tag);
    expect((await friend.context.request.post(
      base + "/api/challenges/" + deadlineQuest + "/accept",
    )).status()).toBe(200);
    await db.query(
      'UPDATE "Challenge" SET deadline=NOW()-INTERVAL \'1 minute\',status=$2 WHERE id=$1',
      [deadlineQuest, "judging"],
    );
    const deadlineDecision = await creator.context.request.post(base + "/api/challenges/" + deadlineQuest + "/judge", {
      data: { tier: 1 },
    });
    expect(deadlineDecision.status(), await deadlineDecision.text()).toBe(200);
    expect((await deadlineDecision.json()).judgment.winnerId).toBeNull();

    for (const participant of [creator, friend]) {
      const page = await participant.context.newPage();
      await page.goto(base + "/app/quest?id=" + deadlineQuest);
      await expect(page.getByTestId("ios-verdict-ready")).toBeVisible();
      const acceptance = page.waitForResponse(r =>
        r.url().endsWith("/api/challenges/" + deadlineQuest + "/verdict-response") &&
        r.request().method() === "POST");
      await page.getByRole("button", { name: "Accept result" }).click();
      expect((await acceptance).ok()).toBe(true);
      await page.close();
    }
    const settled = await creator.context.request.get(base + "/api/challenges/" + deadlineQuest);
    expect((await settled.json()).challenge.status).toBe("settled");
    const receiptPage = await creator.context.newPage();
    await receiptPage.goto(base + "/app/quest?id=" + deadlineQuest);
    await receiptPage.getByRole("link", { name: "View real result" }).click();
    await expect(receiptPage.getByText("Quest Complete!")).toBeVisible();
    await expect(receiptPage.getByText("No winner recorded")).toBeVisible();
    await receiptPage.close();

    const balancesAfter = (await db.query(
      'SELECT id,credits FROM "User" WHERE id=ANY($1::text[]) ORDER BY id',
      [[creator.id, friend.id]],
    )).rows;
    expect(balancesAfter).toEqual(initialBalances);
    for (const id of questIds) {
      expect((await db.query('SELECT COUNT(*)::int AS n FROM "CreditTx" WHERE "challengeId"=$1', [id])).rows[0].n).toBe(0);
      expect((await db.query('SELECT COUNT(*)::int AS n FROM "ProfessionXpEvent" WHERE "challengeId"=$1', [id])).rows[0].n).toBe(0);
    }
    console.log(JSON.stringify({
      result: "PASS", proofQuest, submittedProofRecords: 2,
      paidAiCalls: 0, aiFailureFailClosed: true,
      deadlineQuest, deadlineOutcome: "no_winner",
      consentCount: 2, creditMovement: 0, xpAwarded: 0,
    }));
  } finally {
    for (const user of people) await user.context.close();
    for (const id of questIds) {
      await db.query('DELETE FROM "AuditLog" WHERE "challengeId"=$1', [id]).catch(() => {});
      await db.query('DELETE FROM "ActivityEvent" WHERE "challengeId"=$1', [id]).catch(() => {});
      await db.query('DELETE FROM "Challenge" WHERE id=$1', [id]).catch(() => {});
    }
    if (people.length) {
      const ids = people.map(p => p.id);
      await db.query('DELETE FROM "CreditTx" WHERE "userId"=ANY($1::text[])', [ids]).catch(() => {});
      await db.query('DELETE FROM "ActivityEvent" WHERE "userId"=ANY($1::text[])', [ids]).catch(() => {});
      await db.query('DELETE FROM "AuditLog" WHERE "actorUserId"=ANY($1::text[]) OR "targetUserId"=ANY($1::text[])', [ids]).catch(() => {});
      await db.query('DELETE FROM "User" WHERE id=ANY($1::text[])', [ids]).catch(() => {});
    }
    await db.end();
  }
});
