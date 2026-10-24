import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PROFESSIONS} from "../src/lib/summons/profession-system";
import {
  CREATURE_ATLAS,CREATURE_VISUALS,creatureVisualFor,
  creatureStageForMastery,stageNameFor,
} from "../src/lib/summons/creature-visual-bible";

let checks=0;
function eq(a:unknown,b:unknown,why:string){assert.deepEqual(a,b,why);checks++;}
function ok(a:boolean,why:string){assert.ok(a,why);checks++;}
function bad(action:()=>unknown,why:string){assert.throws(action,RangeError,why);checks++;}

eq(CREATURE_ATLAS.length,12,"Twelve supported career families");
eq(new Set(CREATURE_ATLAS.map(f=>f.id)).size,12,"Family ID uniqueness");
eq(CREATURE_ATLAS.map(f=>f.id),PROFESSIONS.map(f=>f.id),"All existing career IDs covered exactly once");
eq(CREATURE_ATLAS.reduce((count,f)=>count+f.occupationCount,0),36,
  "There are 36 initial career specialties, not a fabricated 360");

const silhouettes=new Set<string>(),signatures=new Set<string>(),
  allFormNames=new Set<string>(),allMotifs=new Set<string>();
const css=readFileSync("src/app/ios-app.css","utf8");
for(const family of CREATURE_ATLAS){
  const art=creatureVisualFor(family.id);
  eq(art.stageNames[0],family.species,"Base stage retains existing species ID/name "+family.id);
  eq(art.occupationMotifs.length,family.specialties.length,
    "Skill motifs match career taxonomy "+family.id);
  eq(art.stageNames.length,3,"Three cosmetic evolution form names "+family.id);
  eq(art.colors.length,3,"Three palette tokens "+family.id);
  ok(art.colors.every(c=>/^#[0-9A-Fa-f]{6}$/.test(c)),
    "Palette uses accessible CSS-safe colors "+family.id);
  eq(family.artStatus,"production-art-pending","Do not pretend art is finished "+family.id);
  eq(family.ownership,"concept-not-owned","No fictional ownership "+family.id);
  ok(art.silhouette.length>=35&&art.material.length>=35&&
    art.signature.length>=35&&art.movement.length>=28,
    "Production art brief is specific enough "+family.id);
  ok(css.includes(".ios-creature-crest--"+family.id),
    "Distinct graphic mark exists for "+family.id);
  silhouettes.add(art.silhouette);signatures.add(art.signature);
  for(const n of art.stageNames){ok(n.length>=5,"Stage name is legible");allFormNames.add(n);}
  for(const motif of art.occupationMotifs){ok(motif.length>=8,"Occupation has tangible motif");allMotifs.add(motif);}
  eq(stageNameFor(family.id,1),art.stageNames[0],"First form is hatchling "+family.id);
  eq(stageNameFor(family.id,3),art.stageNames[1],"Level three concept evolved "+family.id);
  eq(stageNameFor(family.id,5),art.stageNames[2],"Level five concept ascended "+family.id);
}
eq(silhouettes.size,12,"No recolored shared creature silhouette");
eq(signatures.size,12,"No duplicated unique art signature");
eq(allFormNames.size,36,"All three-stage species names are globally distinct");
eq(allMotifs.size,36,"All sample occupations have distinct material motifs");

for(const [level,expected] of [
  [1,"base"],[2,"base"],[3,"evolved"],[4,"evolved"],[5,"ascended"]
] as const){eq(creatureStageForMastery(level),expected,"Cosmetic stage at "+level);}
for(const value of [0,-1,6,2.5,NaN,Infinity])
  bad(()=>creatureStageForMastery(value),"Reject invented mastery "+value);
bad(()=>creatureVisualFor("unknown" as never),"Unknown family cannot gain a creature");
const serialized=JSON.stringify(CREATURE_VISUALS).toLowerCase();
ok(!/"(stake|wallet|credits|paidprice|mint|owned)":/.test(serialized),
  "Art metadata does not issue rewards or touch money");
console.log("CREATURE_ART_BIBLE_PASS",checks,"checks");
