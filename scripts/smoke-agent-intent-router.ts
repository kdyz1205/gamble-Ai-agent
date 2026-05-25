import assert from "node:assert/strict";
import { classifyAgentIntent, detectInputLanguage, shouldDirectCompile } from "../src/lib/agent/intent-router";

const emptyDraft = { protocol: null };
const compiledDraft = { protocol: { version: "2.0" } as never };

const pushup = classifyAgentIntent("I bet Jerry I can do 20 pushups in one minute.", emptyDraft);
assert.equal(pushup.route, "compile_protocol");
assert.equal(pushup.directCompile, true);
assert.equal(pushup.language, "en");

const randomZh = classifyAgentIntent("\u7ed9\u6211\u968f\u4fbf\u751f\u6210\u4e00\u4e2a\u6311\u6218", emptyDraft);
assert.equal(randomZh.route, "compile_protocol");
assert.equal(randomZh.directCompile, true);
assert.equal(randomZh.language, "zh");

const join = classifyAgentIntent("I reviewed the rules and agree to join challenge cmp123.", emptyDraft);
assert.equal(join.route, "join_contract");
assert.equal(join.directCompile, false);

const evidence = classifyAgentIntent("Submit my video evidence for challenge cmp123.", emptyDraft);
assert.equal(evidence.route, "evidence_intake");
assert.equal(evidence.directCompile, false);

const binding = classifyAgentIntent("Issue my participant binding instructions for challenge cmp123.", emptyDraft);
assert.equal(binding.route, "evidence_intake");
assert.equal(binding.directCompile, false);

const recording = classifyAgentIntent("Start a same-camera recording session for challenge cmp123.", emptyDraft);
assert.equal(recording.route, "evidence_intake");
assert.equal(recording.directCompile, false);

const verify = classifyAgentIntent("Verify identity for challenge cmp123 and evidence id ev123.", emptyDraft);
assert.equal(verify.route, "evidence_intake");
assert.equal(verify.directCompile, false);

const judge = classifyAgentIntent("Please rejudge this verdict with a stronger model.", emptyDraft);
assert.equal(judge.route, "outcome_judge");
assert.equal(judge.directCompile, false);

const discovery = classifyAgentIntent("match me with a nearby challenge", emptyDraft);
assert.equal(discovery.route, "challenge_discovery");
assert.equal(discovery.directCompile, false);

const existingProtocol = classifyAgentIntent("create another pushup challenge", compiledDraft);
assert.equal(existingProtocol.directCompile, false);
assert.ok(existingProtocol.blockingSignals.includes("existing_protocol"));

assert.equal(detectInputLanguage("\u6211\u8981\u8d4c\u4e00\u4e2a\u6311\u6218"), "zh");
assert.equal(shouldDirectCompile("Give me a random challenge", emptyDraft), true);
assert.equal(shouldDirectCompile("I want to join cmp123", emptyDraft), false);

console.log(JSON.stringify({
  ok: true,
  pushup,
  randomZh,
  join: join.route,
  evidence: evidence.route,
  binding: binding.route,
  recording: recording.route,
  verify: verify.route,
  judge: judge.route,
  discovery: discovery.route,
  existingProtocolSignal: existingProtocol.blockingSignals[0],
}, null, 2));
