import assert from "node:assert/strict";
import { deriveQuestMilestoneRank } from "../src/lib/ios-quest-rank";

const records = (settled:number, other = 0) =>
  [...Array.from({length:settled},(_,i)=>({id:"settled-"+i,status:"settled"})),
   ...Array.from({length:other},(_,i)=>({id:"active-"+i,status:"open"}))];
const expectReady=(n:number,level:number,percent:number,next:number|null)=>{
  const rank=deriveQuestMilestoneRank(records(n));
  assert.equal(rank.status,"ready");
  if(rank.status==="ready") {
    assert.equal(rank.level,level);
    assert.equal(rank.percent,percent);
    assert.equal(rank.nextThreshold,next);
    assert.equal(rank.settled,n);
  }
};
expectReady(0,1,0,1);
expectReady(1,2,0,3);
expectReady(2,2,50,3);
expectReady(3,3,0,8);
expectReady(6,3,60,8);
expectReady(8,4,0,20);
expectReady(14,4,50,20);
expectReady(20,5,100,null);
expectReady(34,5,100,null);

const withOpen=deriveQuestMilestoneRank(records(2,8));
assert.equal(withOpen.status,"ready");
if(withOpen.status==="ready") assert.equal(withOpen.settled,2);
const deduped=deriveQuestMilestoneRank([
  {id:"same",status:"settled"}, {id:"same",status:"settled"}
]);
assert.equal(deduped.status,"ready");
if(deduped.status==="ready") assert.equal(deduped.settled,1);
assert.deepEqual(deriveQuestMilestoneRank([
  {id:"same",status:"settled"}, {id:"same",status:"disputed"}
]),{status:"unknown",reason:"invalid-record"});
assert.deepEqual(deriveQuestMilestoneRank(records(5,45)),
  {status:"unknown",reason:"history-limit"});
assert.deepEqual(deriveQuestMilestoneRank([{id:"",status:"settled"}]),
  {status:"unknown",reason:"invalid-record"});
assert.deepEqual(deriveQuestMilestoneRank(records(1),0),
  {status:"unknown",reason:"invalid-record"});
assert.equal(deriveQuestMilestoneRank([{id:"pending",status:"pending_settlement"}]).status,"ready");
console.log("IOS_QUEST_RANK_TESTS_PASS 16 cases");
