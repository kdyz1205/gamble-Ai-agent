import assert from "node:assert/strict";
import { questStatusText, proofTypeText } from "../src/lib/interface-language";
import { interfaceCopy, interfaceCopyZh } from "../src/lib/interface-copy";
import { publicActivityPresentation } from "../src/lib/public-activity-presentation";

let checks=0;
for(const status of ['draft','open','live','judging','pending_settlement','settled','cancelled','disputed','refunded']) {
  assert.equal(questStatusText('en',status),status.replaceAll('_',' ')); checks++;
  assert.notEqual(questStatusText('zh',status),status); checks++;
}
assert.equal(questStatusText('zh','future_unknown'),'future unknown'); checks++;
assert.equal(proofTypeText('zh','text'),'文字'); checks++;
assert.equal(proofTypeText('en','text'),'text'); checks++;
for(const [en,zh] of Object.entries(interfaceCopyZh)) {
  assert.equal(interfaceCopy('en',en),en); assert.equal(interfaceCopy('zh',en),zh); checks+=2;
}
const original={type:'challenge_verdict_recommended',message:'Provider internal result stays in audit',user:{username:'原始玩家'},challenge:{title:'Original Quest 不应被翻译'}};
const saved=JSON.stringify(original);
const translated=publicActivityPresentation(original,'zh');
assert(translated.message.includes(original.challenge.title)); checks++;
assert.equal(translated.label,'裁判建议'); checks++;
assert(!/获胜|胜者|奖励|已结算|Provider/.test(translated.message)); checks++;
assert.equal(publicActivityPresentation(original).label,'Referee recommendation'); checks++;
assert.equal(JSON.stringify(original),saved); checks++;
assert.equal(interfaceCopy('zh','Arbitrary user text 用户原文'),'Arbitrary user text 用户原文'); checks++;
console.log(`INTERFACE_LANGUAGE_PASS ${checks} assertions: English compatibility, Chinese interface labels, no invented final result, original data unchanged`);
