import "dotenv/config";
import assert from "node:assert/strict";
import {
  INITIAL_PITY_STATE,RARITY_ODDS,drawRarity,advancePityState,
  previewSummon,
} from "../src/lib/summons/profession-system";
import {
  DRAW_RANDOM_RANGE,FREE_DRAW_RULE_VERSION,freeDrawGrantKey,
  freeDrawEnabled,MAX_ACCOUNT_DRAWS,
} from "../src/lib/summons/free-draw-ledger";
import {TICKET_GRANT_RULE_VERSION} from "../src/lib/summons/free-ticket-ledger";

let checks=0;
const eq=(a:unknown,b:unknown,msg:string)=>{
  assert.deepEqual(a,b,msg);checks++;
};
eq(DRAW_RANDOM_RANGE,1_000_000_000,"CSPRNG integral space is versioned");
eq(FREE_DRAW_RULE_VERSION,"audited-free-draw-v1","Policy version frozen");
eq(MAX_ACCOUNT_DRAWS,1200,"Maximum matches 12 professions by 100 tickets");
eq(RARITY_ODDS.reduce((n,row)=>n+row.weight,0),10000,"Base weights exact");
const grant="summon-ticket:"+TICKET_GRANT_RULE_VERSION+":u1:software:1";
eq(freeDrawGrantKey(grant), "summon-free-draw:"+FREE_DRAW_RULE_VERSION+":"+grant,
  "Stable grant identity binds original career ticket");
assert.throws(()=>freeDrawGrantKey("user-controlled"),"Forged grants rejected");checks++;
const oldFlags=[process.env.SUMMON_PERSISTENCE_ENABLED,
  process.env.SUMMON_TICKETS_ENABLED,process.env.SUMMON_DRAWS_ENABLED];
try{
  for(const vals of [
    ["false","true","true"],["true","false","true"],
    ["true","true","false"],
  ]){
    [process.env.SUMMON_PERSISTENCE_ENABLED,process.env.SUMMON_TICKETS_ENABLED,
      process.env.SUMMON_DRAWS_ENABLED]=vals;
    eq(freeDrawEnabled(),false,"Each independent feature flag blocks draw");
  }
  process.env.SUMMON_PERSISTENCE_ENABLED="true";
  process.env.SUMMON_TICKETS_ENABLED="true";
  process.env.SUMMON_DRAWS_ENABLED="true";
  eq(freeDrawEnabled(),true,"All three flags are necessary");
}finally{
  for(const [i,key] of ["SUMMON_PERSISTENCE_ENABLED","SUMMON_TICKETS_ENABLED",
    "SUMMON_DRAWS_ENABLED"].entries()){
    if(oldFlags[i]===undefined)delete process.env[key];
    else process.env[key]=oldFlags[i];
  }
}
let pity={...INITIAL_PITY_STATE};
for(let n=0;n<19;n++){
  const result=drawRarity(0,pity);
  eq(result.rarity,"common","Ordinary near-zero RNG yields common");
  eq(result.pity,"none","No early rare guarantee");
  pity=advancePityState(pity,result.rarity);
}
eq(pity.sinceRare,19,"19 common misses accumulate Rare pity");
const rare=drawRarity(0,pity);
eq(rare.pity,"rare-20","20th non-Rare triggers guaranteed Rare+");
eq(rare.rarity,"rare","Guaranteed rare stays within Rare+ weights");
eq(rare.effectiveWeights.reduce((n,r)=>n+r.weight,0),1300,
  "Rare guarantee uses only Rare+ original relative weights");
pity=advancePityState(pity,rare.rarity);
eq(pity.sinceRare,0,"Rare resets rare pity");
eq(pity.sinceEpic,20,"Rare does not reset Epic pity");
pity={...INITIAL_PITY_STATE};
for(let n=0;n<79;n++){
  const result=drawRarity(0,pity);
  eq(result.rarity,n%20===19?"rare":"common",
    "Rare pity cycles without accidentally triggering Epic");
  pity=advancePityState(pity,result.rarity);
}
eq(pity.sinceEpic,79,"79 non-Epic draws accumulate Epic pity");
const epic=drawRarity(0,pity);
eq(epic.pity,"epic-80","80th draw guarantees Epic+ across professions");
eq(epic.rarity,"epic","Epic guarantee excludes common, uncommon and rare");
eq(epic.effectiveWeights.reduce((n,r)=>n+r.weight,0),300,
  "Epic guarantee uses only Epic/Legendary relative weights");
pity=advancePityState(pity,epic.rarity);
eq(pity.sinceEpic,0,"Epic draw resets Epic pity");
eq(pity.sinceRare,0,"Epic draw also resets Rare pity");
const summoned=previewSummon({
  professionId:"software",occupationId:"robotics",masteryLevel:1,
  randomUnit:0.5,pity:INITIAL_PITY_STATE,
});
eq(summoned.visualStage,"base","Newly owned free items begin at base form");
eq(summoned.speciesId,"software-robotics-common-base",
  "Rarity and chosen career determine stable actual species ID");
assert.throws(()=>drawRarity(1,pity),"Roll 1 is outside exclusive unit bound");
checks++;
console.log("FREE_SUMMON_DRAW_RULES_PASS",checks,"checks");
