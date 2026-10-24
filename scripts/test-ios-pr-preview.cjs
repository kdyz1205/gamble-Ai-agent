const assert = require("node:assert/strict");
const { pickPreviewUrl, statusMatchesHead } = require("./ios-resolve-pr-preview.cjs");

const host = "https://stubborn-git-design-summoner-ios-poli-ede789-kdyz1205s-projects.vercel.app";
const make = (preview, label = "Ready", actor = "vercel[bot]") => [{
  user: { login: actor }, updated_at: "2026-10-23T22:27:49Z",
  body: "| [stubborn](https://vercel.com/kdyz1205s-projects/stubborn) | " +
    "[" + label + "](https://vercel.com/status) | [Preview](" + preview + ") |"
}];

assert.equal(pickPreviewUrl(make(host)), host + "/app");
assert.throws(() => pickPreviewUrl(make("https://example.com")), /authorized/);
assert.throws(() => pickPreviewUrl(make(host, "Building")), /Ready/);
assert.throws(() => pickPreviewUrl(make(host, "Ready", "attacker")), /Ready/);
assert.throws(() => pickPreviewUrl(make(host + "/login")), /Ready/);
assert.throws(() => pickPreviewUrl(make(host + "?debug=1")), /Ready/);
assert.equal(statusMatchesHead({statuses:[{context:"Vercel",state:"success"}]}),true);
assert.equal(statusMatchesHead({statuses:[{context:"Vercel",state:"pending"}]}),false);
assert.equal(statusMatchesHead({statuses:[{context:"other",state:"success"}]}),false);
assert.equal(statusMatchesHead({statuses:[]}),false);
console.log("IOS_PR_TARGET_TESTS_PASS 10/10");
