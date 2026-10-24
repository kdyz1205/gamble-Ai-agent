/**
 * Fail the release if a root-level Vercel exclude hides nested app components.
 * Gitignore semantics are essential: `ios/` also removes `src/components/ios/`,
 * whereas `/ios/` limits the native source exclusion to the repo root.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ignore = require("ignore");
const root = path.resolve(__dirname, "..");
const patterns = fs.readFileSync(path.join(root, ".vercelignore"), "utf8");
const filter = ignore().add(patterns);
const safe = [
  "src/components/ios/IOSFullApp.tsx",
  "src/components/ios/IOSAppUI.tsx",
  "src/components/ios/IOSAppData.ts",
  "src/components/ios/IOSPersonalScreens.tsx",
  "src/components/ios/IOSQuestScreens.tsx",
  "src/app/app/[view]/page.tsx",
  "src/lib/api-client.ts",
  "src/app/layout.tsx",
];
const excluded = [
  "ios/App/App.xcodeproj/project.pbxproj",
  "ios-shell/index.html",
  "gambles-recordings/gamble-01/player_a.webm",
  "output/reports/generated.json",
];
for (const file of safe) {
  assert(fs.existsSync(path.join(root, file)), "Imported source must exist: " + file);
  assert(!filter.ignores(file), "Vercel would remove deployed source: " + file);
}
for (const file of excluded) {
  assert(filter.ignores(file), "Native/development asset must not be uploaded: " + file);
}
const broken = ignore().add(patterns.replace("/ios/", "ios/"));
assert(broken.ignores("src/components/ios/IOSFullApp.tsx"), "Regression fixture must demonstrate original failure");
console.log("VERCEL_IGNORE_GATE PASS preserved=" + safe.length + " excluded=" + excluded.length + " prior-bug=REPRODUCED");
