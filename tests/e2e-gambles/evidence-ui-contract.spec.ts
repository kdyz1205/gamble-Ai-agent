import { randomUUID } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3017";
test.use({ channel: "chrome", video: "off", trace: "off", launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } });

test("private invitation keeps join controls while proof access stops outsider polling", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(BASE).hostname);
  const tag = randomUUID().replaceAll("-", "").slice(0, 12);
  const creator = await browser.newContext({ reducedMotion: "reduce" });
  const outsider = await browser.newContext({ reducedMotion: "reduce" });
  const anonymous = await browser.newContext({ reducedMotion: "reduce" });
  try {
    for (const [context, label] of [[creator, "creator"], [outsider, "outsider"]] as const) {
      const { csrfToken } = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
      const registered = await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: {
        csrfToken, action: "register", email: `private_ui_${tag}_${label}@example.invalid`, username: `private_ui_${tag}_${label}`,
        password: randomUUID(), callbackUrl: BASE, json: "true",
      } });
      expect(registered.ok()).toBe(true);
      expect((await (await context.request.get(`${BASE}/api/auth/session`)).json()).user?.id).toBeTruthy();
    }
    const created = await creator.request.post(`${BASE}/api/challenges`, { data: {
      title: `Private invitation UI ${tag}`, stake: 0, evidenceType: "text", visibility: "invite_only", isPublic: false,
      deadline: "2 hours", rules: "Each player writes their agreed answer. Equal answers tie.",
    } });
    expect(created.status(), await created.text()).toBe(201);
    const { challenge } = await created.json();
    const page = await outsider.newPage();
    const observations: Record<string, number> = {};
    for (const suffix of ["", "/versus"]) {
      await page.goto(`${BASE}/challenge/${challenge.id}${suffix}`, { waitUntil: "domcontentloaded" });
      await page.bringToFront();
      await expect(page.getByTestId("private-proof-access")).toContainText("Proof and results are private");
      await expect(page.getByRole("button", { name: suffix ? "Enter the Arena — Accept Challenge" : "Accept quest", exact: true })).toBeVisible();
      await expect(page.getByText("Waiting for proof", { exact: true })).toHaveCount(0);
      let reads = 0;
      const listener = (request: import("@playwright/test").Request) => {
        if (request.method() === "GET" && new URL(request.url()).pathname === `/api/challenges/${challenge.id}`) reads++;
      };
      page.on("request", listener);
      await page.waitForTimeout(10_800);
      page.off("request", listener);
      expect(reads).toBe(0); observations[suffix || "detail"] = reads;
    }
    const anonPage = await anonymous.newPage();
    await anonPage.goto(`${BASE}/challenge/${challenge.id}/versus`, { waitUntil: "domcontentloaded" });
    await expect(anonPage.getByTestId("private-proof-access")).toContainText("Sign in and accept this invitation");
    await anonPage.close();
    await page.bringToFront();
    await page.getByRole("button", { name: "Enter the Arena — Accept Challenge", exact: true }).press("Enter");
    await expect(page.getByTestId("private-proof-access")).toHaveCount(0);
    const authorized = await (await outsider.request.get(`${BASE}/api/challenges/${challenge.id}`)).json();
    expect(authorized.challenge.proofAccess).toBeUndefined();
    expect(authorized.challenge.status).toBe("live");
    expect((await outsider.request.get(`${BASE}/api/challenges/${challenge.id}/evidence`)).status()).toBe(200);
    await testInfo.attach("private-proof-ui-receipt", { contentType: "application/json", body: Buffer.from(JSON.stringify({ challengeId: challenge.id, result: "PASS", outsiderReadsOver10_8s: observations, acceptedAccess: true, providerCalls: 0 })) });
    console.log(JSON.stringify({ phase: "private-proof-preview-join-and-no-poll-pass", observations }));
  } catch (error) { console.error(error); throw error; }
  finally { await Promise.all([creator.close(), outsider.close(), anonymous.close()]); }
});

test("agreed proof controls, real camera binding, failed transfer safety and deadline async gate", async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  expect(["localhost", "127.0.0.1"]).toContain(new URL(BASE).hostname);
  const tag = randomUUID().replaceAll("-", "").slice(0, 12);
  const a = await browser.newContext({ reducedMotion: "reduce", permissions: ["camera", "microphone"] });
  const b = await browser.newContext({ reducedMotion: "reduce" });
  let judgeRequests = 0;
  a.on("request", request => { if (request.method() === "POST" && /\/judge(?:\/async)?$/.test(new URL(request.url()).pathname)) judgeRequests++; });
  async function register(context: BrowserContext, label: string) {
    const csrf = await (await context.request.get(`${BASE}/api/auth/csrf`)).json();
    const email = `proof-ui-${label}-${tag}@example.invalid`;
    const registered = await context.request.post(`${BASE}/api/auth/callback/credentials`, { form: {
      csrfToken: csrf.csrfToken, email, username: `proof_${label}_${tag}`, password: randomUUID(), action: "register", callbackUrl: BASE, json: "true",
    } });
    expect(registered.ok()).toBe(true);
    const session = await (await context.request.get(`${BASE}/api/auth/session`)).json();
    expect(session.user.email).toBe(email);
  }
  async function create(policy: string, deadline = "1 hour") {
    const response = await a.request.post(`${BASE}/api/challenges`, { data: {
      title: `Proof contract ${policy} ${tag}`, type: "General", stake: 0, evidenceType: policy, deadline,
      proposition: "Compare the visible count on the submitted participant sheets.",
      rules: "Both players submit their own agreed proof showing a count. The greater visible count wins. Ties or unreadable counts require human review.",
      isPublic: false, visibility: "invite_only",
    } });
    expect(response.status(), await response.text()).toBe(201);
    const { challenge } = await response.json();
    const accepted = await b.request.post(`${BASE}/api/challenges/${challenge.id}/accept`);
    expect(accepted.ok(), await accepted.text()).toBe(true);
    return challenge;
  }
  const press = async (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: true }).press("Enter");
  try {
    await register(a, "creator"); await register(b, "opponent");
    const deadlineQuest = await create("text", "1 minute");
    const photo = await create("photo");
    const page = await a.newPage();
    await page.goto(`${BASE}/challenge/${photo.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Upload photo\b/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Record video\b/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Upload video\b/ })).toHaveCount(0);
    let evidencePosts = 0, failedPuts = 0;
    page.on("request", request => { if (request.method() === "POST" && new URL(request.url()).pathname === `/api/challenges/${photo.id}/evidence`) evidencePosts++; });
    // Network-failure boundary only: actual uploader UI and real server proof count.
    // This does not claim that a mocked object transfer verifies cloud storage.
    await page.route(`**/api/challenges/${photo.id}/evidence/blob-handle`, route => route.fulfill({ status: 503, json: { error: "Fixture Blob unavailable" } }));
    await page.route("**/api/uploads/evidence-presign", route => route.fulfill({ status: 200, json: { configured: true, uploadUrl: "https://upload-fixture.example.invalid/proof.png", publicUrl: "https://assets-fixture.example.invalid/proof.png" } }));
    await page.route("https://upload-fixture.example.invalid/proof.png", route => { failedPuts++; return route.fulfill({ status: 403, body: "Fixture upload rejected" }); });
    const choosing = page.waitForEvent("filechooser"); await press(page, /^Upload photo\b/);
    await (await choosing).setFiles({ name: "fixture.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
    await press(page, "Submit proof");
    await expect(page.getByText("Upload failed (403). Your proof was not submitted.", { exact: false })).toBeVisible();
    expect(failedPuts).toBe(1); expect(evidencePosts).toBe(0);
    console.log(JSON.stringify({ phase: "photo-transfer-failure-safe", failedPuts, evidencePosts }));
    const untouched = await (await a.request.get(`${BASE}/api/challenges/${photo.id}`)).json();
    expect(untouched.challenge.evidence).toHaveLength(0);
    await page.goto(`${BASE}/challenge/${photo.id}/versus`, { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Upload proof file")).toHaveAttribute("accept", "image/*");
    await expect(page.getByRole("button", { name: "Open Camera to Record Proof", exact: true })).toHaveCount(0);
    let photoPayload: Record<string, unknown> | undefined;
    await page.route(`**/api/challenges/${photo.id}/evidence`, async route => {
      photoPayload = route.request().postDataJSON();
      await route.fulfill({ status: 400, json: { error: "Fixture checks wire policy only; no remote asset submitted." } });
    });
    await page.getByPlaceholder("https://... video or image URL").fill("https://assets-fixture.example.invalid/photo.png");
    await press(page, "Submit URL");
    await expect.poll(() => photoPayload?.type).toBe("photo");

    console.log(JSON.stringify({ phase: "photo-versus-policy-correct", type: photoPayload?.type }));
    const video = await create("video");
    await page.goto(`${BASE}/challenge/${video.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^Take photo\b/ })).toHaveCount(0);
    await press(page, /^Record video\b/);
    const live = page.locator("video").first();
    await expect.poll(() => live.evaluate(el => {
      const video = el as HTMLVideoElement;
      return video.srcObject instanceof MediaStream && video.videoWidth > 0;
    }), { timeout: 15_000 }).toBe(true);
    await live.evaluate(el => { (window as Window & { qaTracks?: MediaStreamTrack[] }).qaTracks = ((el as HTMLVideoElement).srcObject as MediaStream).getTracks(); });
    await press(page, "🔴 Start recording"); await page.waitForTimeout(700); await press(page, "⏹ Stop & save");
    await expect(page.locator('video[src^="blob:"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as Window & { qaTracks?: MediaStreamTrack[] }).qaTracks?.every(track => track.readyState === "ended"))).toBe(true);

    console.log(JSON.stringify({ phase: "native-camera-stream-and-recording-pass", syntheticDevice: true }));
    await page.goto(`${BASE}/challenge/${deadlineQuest.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Ask Familiar for result · 0 cr", exact: true })).toBeVisible({ timeout: Math.max(15_000, Date.parse(deadlineQuest.deadline) - Date.now() + 15_000) });
    await expect(page.getByRole("button", { name: "Background Familiar review", exact: true })).toHaveCount(0);
    await page.goto(`${BASE}/challenge/${deadlineQuest.id}/versus`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Ask Familiar (0 cr)", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Background Familiar Review", exact: true })).toHaveCount(0);
    const ready = await create("text");
    for (const context of [a, b]) expect((await context.request.post(`${BASE}/api/challenges/${ready.id}/evidence`, { data: { type: "text", description: "I independently completed this local regression check-in." } })).ok()).toBe(true);
    await page.goto(`${BASE}/challenge/${ready.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: "Background Familiar review", exact: true })).toBeVisible();
    expect(judgeRequests).toBe(0);
    await testInfo.attach("proof-contract-receipt", { body: JSON.stringify({ photoQuest: photo.id, videoQuest: video.id, deadlineQuest: deadlineQuest.id, readyQuest: ready.id,
      failedObjectPutStatus: 403, evidencePostsAfterFailedPut: 0, photoUrlPayloadType: photoPayload?.type, camera: "Chromium synthetic device; real getUserMedia/MediaRecorder, no real-world scoring claim", cameraTracksEnded: true,
      expiredLiveAsyncHiddenBothSurfaces: true, bothProofJudgingAsyncVisible: true, noJudgeRequests: judgeRequests === 0 }), contentType: "application/json" });
  } finally { await a.close(); await b.close(); }
});
