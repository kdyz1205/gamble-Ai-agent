import assert from "node:assert/strict";
import {
  STARTER,PROFESSIONS,RARITY_ODDS,RARITY_VERSION,
  drawRarity,previewSummon,previewFusion,previewVerifiedBattleXp,
  previewMasteryFromXp,previewTicketMilestones,
} from "../src/lib/summons/profession-system";

let checks=0;
function ok(condition:boolean,message:string){assert.ok(condition,message);checks++;}
function eq<T>(actual:T,expected:T,message:string){assert.deepEqual(actual,expected,message);checks++;}
function reject(action:()=>unknown,message:string){assert.throws(action,RangeError,message);checks++;}

eq(STARTER.speciesId,"pico","Pico must be the universal starter");
eq(STARTER.universal,true,"Everyone can start with Pico");
eq(PROFESSIONS.length,12,"Twelve extensible top-level paths");
eq(PROFESSIONS.reduce((sum,x)=>sum+x.specialties.length,0),36,
  "Thirty-six initial skills/occupations within the top families");
eq(new Set(PROFESSIONS.map(x=>x.id)).size,12,"No duplicate family codes");
eq(RARITY_ODDS.reduce((sum,x)=>sum+x.weight,0),10000,"Odds are exactly normalized");
eq(RARITY_VERSION,"summon-rarity-v1","Versioned and auditable");

const count:Record<string,number>={};
for(let i=0;i<10000;i++){
  const rarity=drawRarity((i+.5)/10000).rarity;
  count[rarity]=(count[rarity]||0)+1;
}
for(const row of RARITY_ODDS)eq(count[row.id],row.weight,"Exact deterministic distribution "+row.id);
eq(drawRarity(0).rarity,"common","Lower boundary");
eq(drawRarity(0.6).rarity,"uncommon","Uncommon starts at 60%");
eq(drawRarity(0.87).rarity,"rare","Rare starts at 87%");
eq(drawRarity(0.97).rarity,"epic","Epic starts at 97%");
eq(drawRarity(0.996).rarity,"legendary","Legendary starts at 99.6%");
eq(drawRarity(0.9999999).rarity,"legendary","Highest legal unit roll");
for(const value of [-.01,1,NaN,Infinity,-Infinity])
  reject(()=>drawRarity(value),"Reject invalid random unit "+value);

const rarePity={sinceRare:19,sinceEpic:0};
const epicPity={sinceRare:19,sinceEpic:79};
const rareResult=drawRarity(0,rarePity);
eq(rareResult.rarity,"rare","20th miss guarantees Rare or better");
eq(rareResult.pity,"rare-20","Explicit pity contract");
eq(drawRarity(.99999,rarePity).rarity,"legendary","Rare pity still has legendary chance");
eq(drawRarity(0,epicPity).rarity,"epic","80th epic miss guarantees epic or better");
eq(drawRarity(.99,epicPity).rarity,"legendary","Epic pity can be legendary");
eq(drawRarity(0,{sinceRare:0,sinceEpic:79}).rarity,"epic","Epic pity wins precedence");
for(const pity of [{sinceRare:-1,sinceEpic:0},{sinceRare:0,sinceEpic:1.4},
                   {sinceRare:Infinity,sinceEpic:0}])
  reject(()=>drawRarity(.2,pity),"Reject invalid pity");

const base=previewSummon({professionId:"software",masteryLevel:1,randomUnit:.9});
const evolved=previewSummon({professionId:"software",masteryLevel:3,randomUnit:.9});
const ascended=previewSummon({professionId:"software",masteryLevel:5,randomUnit:.9});
eq(base.visualStage,"base","Mastery one base");
eq(evolved.visualStage,"evolved","Mastery three evolved");
eq(ascended.visualStage,"ascended","Mastery five ascended");
ok(ascended.speciesName.startsWith("Astral "),"Advanced earned forms are distinct");
eq(base.rarity,evolved.rarity,"Mastery changes forms, not concealed rarity odds");
eq(base.entitlement,"preview-only","Drawing never creates ownership");
const robot=previewSummon({professionId:"software",occupationId:"robotics",masteryLevel:3,randomUnit:.9});
eq(robot.occupationLabel,"Robotics","Specific occupation changes lineage");
ok(robot.speciesId.includes("-robotics-"),"Career gene appears in species blueprint ID");
ok(robot.speciesId!==base.speciesId,"Two occupations in one family are distinct");
reject(()=>previewSummon({professionId:"software",occupationId:"does-not-exist",masteryLevel:1,randomUnit:.5}),"Unknown occupation must fail closed");
reject(()=>previewSummon({professionId:"software",masteryLevel:6,randomUnit:.5}),"Invalid mastery");
reject(()=>previewSummon({professionId:"software",masteryLevel:0,randomUnit:.5}),"Invalid zero");
reject(()=>previewSummon({professionId:"hacker" as never,masteryLevel:1,randomUnit:.5}),"Unknown profession");

const healthcare=previewSummon({professionId:"healthcare",masteryLevel:2,randomUnit:.5});
const medicTech=previewFusion(base,healthcare);
eq(medicTech.name,"Carebyte","Software + medicine hybrid");
eq(medicTech.blueprintId,previewFusion(healthcare,base).blueprintId,"Fusion is order-independent");
eq(medicTech.professions,["healthcare","software"],"Fusion pair sorted");
eq(medicTech.rarityCap,"common","Rarity cannot exceed weaker input");
eq(medicTech.entitlement,"preview-only","No inventory write");
ok(previewFusion(robot,healthcare).blueprintId!==medicTech.blueprintId,
  "Different occupations in one family produce unique hybrid blueprints");
ok(medicTech.traits.includes("Care")&&medicTech.traits.includes("Logic"),
  "Both career skills survive fusion");
reject(()=>previewFusion(base,evolved),"Cannot repeatedly fuse same profession");
const athlete=previewSummon({professionId:"athletics",masteryLevel:3,randomUnit:.97});
const engineer=previewSummon({professionId:"engineering",masteryLevel:2,randomUnit:.87});
eq(previewFusion(athlete,engineer).name,"Velocity Golem","Named cross-career fusion");
eq(previewFusion(athlete,engineer).rarityCap,"rare","No rarity inflation");

eq(previewMasteryFromXp(0),1,"Untrained skill");
eq(previewMasteryFromXp(100),2,"Mastery level 2");
eq(previewMasteryFromXp(350),3,"Mastery level 3");
eq(previewMasteryFromXp(800),4,"Mastery level 4");
eq(previewMasteryFromXp(1600),5,"Mastery level 5");
eq(previewMasteryFromXp(3000),5,"Mastery capped at five in v1");
reject(()=>previewMasteryFromXp(-1),"Reject negative xp");
reject(()=>previewMasteryFromXp(NaN),"Reject invalid xp");

for(const [xp,tickets,next] of [[0,0,100],[99,0,100],[100,1,250],[249,1,250],
  [250,2,450],[450,3,700],[700,4,1000],[1000,5,1350],[1350,6,1750]]) {
  const output=previewTicketMilestones(xp);
  eq([output.tickets,output.nextAtXp],[tickets,next],"Hypothetical free XP ticket "+xp);
  eq(output.source,"proposal-not-awarded","No actual grant of ticket "+xp);
}
reject(()=>previewTicketMilestones(-1),"Invalid XP denied");
reject(()=>previewTicketMilestones(10000001),"Unbounded preview denied");
for(const outcome of ["win","draw","loss"] as const){
  const actual=previewVerifiedBattleXp({
    status:"settled",proofAccepted:true,participantEligible:true,outcome,
    professionId:"athletics",
  });
  eq(actual?.totalXp,outcome==="win"?100:outcome==="draw"?90:80,
    "Verified "+outcome+" has fixed non-stake XP");
  eq(actual?.source,"proposal-not-awarded","No financial award");
}
for(const scenario of [
  {status:"other" as const,proofAccepted:true,participantEligible:true},
  {status:"settled" as const,proofAccepted:false,participantEligible:true},
  {status:"settled" as const,proofAccepted:true,participantEligible:false}
]){
  eq(previewVerifiedBattleXp({...scenario,outcome:"win",professionId:"business"}),null,
     "Unsafe/no-result XP must reject");
}
ok(!Object.keys(previewTicketMilestones(100)).some(x=>/credit|stake|bet|usd/i.test(x)),
  "No money stakes in summon ticket API");
console.log("PROFESSION_SUMMON_RULES_PASS",checks,"assertions");
