/**
 * Real mobile-browser interaction test for the shipped FreeSummonDrawPanel.
 * No production server, credential, actual RNG or user ticket is touched.
 * The true PostgreSQL + S3 draw/ledger is tested separately in the trusted
 * storage integration job.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const { createServer } = require("node:http");
const { once } = require("node:events");
const esbuild = require("esbuild");
const { chromium } = require("playwright");

const repo = path.resolve(__dirname, "..");
const fixtureSource = String.raw`
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import FreeSummonDrawPanel from "./src/components/ios/FreeSummonDrawPanel";

const initialTicket = {
  source: "audited-free-profession-tickets-v1",
  coverage: "recorded-verification-events-only",
  available: 1, spent: 0, issued: 1, awaitingIssuance: 0,
  byProfession: [{
    professionId: "athletics", verifiedXp: 100, eligibleMilestones: 1,
    issued: 1, available: 1, spent: 0, awaitingIssuance: 0
  }]
};
function BrowserFixture() {
  const [tickets, setTickets] = useState(initialTicket);
  const [refreshed, setRefreshed] = useState(0);
  const disabled = new URLSearchParams(location.search).has("disabled");
  return <main style={{ maxWidth: 390, padding: 18, margin: "0 auto" }}>
    <h1>SUM Familiar draw</h1>
    <span id="refresh-count" data-testid="refresh-count">{refreshed}</span>
    <FreeSummonDrawPanel
      tickets={tickets}
      enabled={!disabled}
      onDrawComplete={() => {
        setRefreshed(n => n + 1);
        setTickets({
          ...initialTicket, available: 0, spent: 1,
          byProfession: [{
            ...initialTicket.byProfession[0],
            available: 0, spent: 1
          }]
        });
      }}
    />
  </main>;
}
createRoot(document.getElementById("root")).render(<BrowserFixture/>);
`;

async function main() {
  const compiled = await esbuild.build({
    stdin: {
      contents: fixtureSource,
      resolveDir: repo,
      sourcefile: "summoner-free-draw-fixture.tsx",
      loader: "tsx",
    },
    bundle: true,
    platform: "browser",
    format: "iife",
    jsx: "automatic",
    target: ["es2020"],
    write: false,
    alias: { "@": path.join(repo, "src") },
    logLevel: "warning",
  });
  assert.ok(compiled.outputFiles?.length > 0);
  const bundle = compiled.outputFiles[0].contents;
  const seen = [];
  let accepted = 0;
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/bundle.js") {
      res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
      res.end(bundle);
      return;
    }
    if (req.method === "GET" && (req.url === "/" || req.url === "/?disabled")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
      return;
    }
    if (req.method === "POST" && req.url === "/api/summons/free-draw") {
      const parts = [];
      for await (const chunk of req) parts.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(parts).toString("utf8"));
      seen.push(body);
      assert.equal(body.confirmSpend, true);
      assert.equal(body.professionId, "athletics");
      assert.equal(body.occupationId, "badminton");
      assert.match(body.requestKey, /^[0-9a-f-]{36}$/);
      res.setHeader("Content-Type", "application/json");
      if (seen.length === 1) {
        // Server may have committed but response was interrupted. Client
        // must retry same request key rather than making a new draw.
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "Synthetic receipt network timeout" }));
      } else {
        accepted++;
        res.statusCode = 200;
        res.end(JSON.stringify({
          draw: {
            receiptId: "ci-draw-receipt",
            instanceId: "ci-owned-summon",
            speciesId: "athletics-badminton-rare-base",
            rarity: "rare",
            professionId: "athletics",
            occupationId: "badminton",
            ordinal: 1,
            reused: true,
            pityKind: "none",
            rareMissesAfter: 0,
            epicMissesAfter: 1,
            effectiveWeights: [
              { id: "common", weight: 6000 },
              { id: "uncommon", weight: 2700 },
              { id: "rare", weight: 1000 },
              { id: "epic", weight: 260 },
              { id: "legendary", weight: 40 }
            ],
            creditsTransferred: 0,
          }
        }));
      }
      return;
    }
    res.writeHead(404);
    res.end("Not Found");
  });
  let browser;
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = "http://127.0.0.1:" + address.port;
    const executable = process.env.SUM_IOS_CHROME ||
      (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined);
    browser = await chromium.launch({
      headless: true,
      ...(executable ? { executablePath: executable } : {}),
    });
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, reducedMotion: "reduce",
    });
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Summon a new Familiar" }).waitFor();

    // Looking at a ticket, selecting a career or reviewing consent NEVER
    // sends a draw request.
    assert.equal(seen.length, 0);
    await page.getByRole("button", { name: "Review free ticket use" }).click();
    assert.equal(seen.length, 0);
    await page.getByRole("button", { name: "Cancel" }).click();
    assert.equal(seen.length, 0);
    await page.getByRole("button", { name: "Review free ticket use" }).click();
    // Burst two clicks within the same task before the response arrives.
    await page.evaluate(() => {
      const button = document.querySelector('[aria-label="Confirm irreversible free ticket use"] button');
      if (!(button instanceof HTMLButtonElement)) throw Error("Missing confirm button");
      button.click();
      button.click();
    });
    await page.getByRole("alert").filter({ hasText: "Synthetic receipt network timeout" }).waitFor();
    assert.equal(seen.length, 1, "Only explicit confirmation sends a request");

    await page.getByRole("button", { name: "Retry same receipt safely" }).click();
    await page.getByText("Summoned: athletics-badminton-rare-base").waitFor();
    await page.getByText("Verified draw #1", { exact: false }).waitFor();
    await page.getByText("No available free career tickets.", { exact: false }).waitFor();
    await page.getByTestId("refresh-count").getByText("1").waitFor();

    assert.equal(seen.length, 2);
    assert.equal(seen[0].requestKey, seen[1].requestKey,
      "The browser must not spend a different ticket after an uncertain response");
    assert.equal(accepted, 1);
    assert.equal(await page.getByRole("button", { name: "Confirm and summon" }).count(), 0,
      "After the ticket is spent, the stale draw button must disappear");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    assert.deepEqual(pageErrors, []);
    await page.close();

    // Disabled production flow only renders explanatory text and never
    // offers an active draw button.
    const guest = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    await guest.goto(origin + "/?disabled", { waitUntil: "domcontentloaded" });
    await guest.getByText("Ticket spending is not active on this server.").waitFor();
    assert.equal(await guest.getByRole("button", { name: "Review free ticket use" }).count(), 0);
    assert.equal(seen.length, 2);
    await guest.close();

    console.log(JSON.stringify({
      result: "PASS",
      suite: "mobile_free_draw_ui",
      viewport: "390x844",
      serverReceipts: accepted,
      clientConfirmationsBeforePost: true,
      retryPreservedRequestKey: true,
      accidentalNewDraws: 0,
      inventoryRefreshCount: 1,
      creditTransfers: 0,
      disabledProductionDrawButton: true,
    }));
  } finally {
    await browser?.close();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
