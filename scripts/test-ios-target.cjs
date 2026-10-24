const assert=require("node:assert/strict");
const {validate}=require("./ios-verify-target.cjs");
const prod="https://summoner.world/app";
const preview="https://stubborn-git-fix-summoner-ios-release-6cd2de-kdyz1205s-projects.vercel.app/app";
assert.equal(validate("production",prod).hostname,"summoner.world");
assert.equal(validate("preview",preview).mode,"preview");
for(const [mode,url] of [
  ["production",preview],["preview",prod],["preview","http://stubborn-git-fix-summoner-ios-release-6cd2de-kdyz1205s-projects.vercel.app/app"],
  ["preview","https://stubborn-git-anyone-other-team.vercel.app/app"],
  ["preview","https://stubborn-git-fix-summoner-ios-release-6cd2de-kdyz1205s-projects.vercel.app/app/other"],
  ["preview","https://attacker@stubborn-git-fix-summoner-ios-release-6cd2de-kdyz1205s-projects.vercel.app/app"],
  ["production","https://summoner.world/app?state=unsafe"],
])assert.throws(()=>validate(mode,url));
console.log("IOS_TARGET_GATE PASS allow=2 reject=7");
