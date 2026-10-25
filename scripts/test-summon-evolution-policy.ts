import assert from "node:assert/strict";
import {
  EVOLUTION_RULE_VERSION,EVOLUTION_THRESHOLDS,
  requiredVerifiedXp,canEvolveFromXp,nextFamiliarStage,
  evolutionRequestScope,matchesEvolutionScope,evolutionEnabled,
} from "../src/lib/summons/evolution-rules";

let checks=0;
const eq=(a:unknown,b:unknown,label:string)=>{
  assert.deepEqual(a,b,label);checks++;
};
const rejected=(fn:()=>unknown,label:string)=>{
  assert.throws(fn,label);checks++;
};
eq(EVOLUTION_RULE_VERSION,"verified-career-evolution-v1","Immutable version");
eq(EVOLUTION_THRESHOLDS,{evolved:350,ascended:1600},"Frozen thresholds");
eq(requiredVerifiedXp("evolved"),350,"First evolution requires 350 XP");
eq(requiredVerifiedXp("ascended"),1600,"Ascension requires 1600 XP");
eq(nextFamiliarStage("base"),"evolved","Base goes to evolved");
eq(nextFamiliarStage("evolved"),"ascended","Evolved goes to ascended");
eq(nextFamiliarStage("ascended"),null,"Ascended has no further form");
rejected(()=>nextFamiliarStage("legendary"),"Invalid form is not a new level");
rejected(()=>requiredVerifiedXp("mythical" as "evolved"),"Unknown thresholds denied");

for(const [form,target,min] of [
  ["base","evolved",350],["evolved","ascended",1600],
] as const){
  eq(canEvolveFromXp(form,target,min-1),false,"One XP below threshold denied");
  eq(canEvolveFromXp(form,target,min),true,"Exact threshold accepted");
  eq(canEvolveFromXp(form,target,min+1000),true,"Higher XP remains eligible");
}
eq(canEvolveFromXp("base","ascended",100000),false,
  "Cannot skip evolved form despite abundant XP");
eq(canEvolveFromXp("evolved","evolved",1600),false,
  "Cannot repeat the same stage");
eq(canEvolveFromXp("ascended","ascended",500000),false,
  "Ascended never levels into duplicate ascension");
eq(canEvolveFromXp("base","evolved",NaN),false,"NaN XP refused");
eq(canEvolveFromXp("base","evolved",350.5),false,"Fractions refused");
eq(canEvolveFromXp("base","evolved",-300),false,"Negative XP refused");
eq(canEvolveFromXp("base","evolved","350"),false,
  "Untrusted client-provided text is not verified XP");

const key=evolutionRequestScope("valid-owner","12345678-1234-1234-1234-123456789012");
eq(matchesEvolutionScope("valid-owner",key),true,
  "Versioned request key bound to exact account");
eq(matchesEvolutionScope("another-owner",key),false,
  "Request key cannot be replayed across accounts");
eq(matchesEvolutionScope("valid-owner",key+"!"),false,
  "Malformed appended request denied");
rejected(()=>evolutionRequestScope("","12345678-1234-1234-1234-123456789012"),
  "Unauthenticated owner rejected");
rejected(()=>evolutionRequestScope("valid-owner","short"),
  "Unstable retry identifiers denied");
const flags=["SUMMON_PERSISTENCE_ENABLED","SUMMON_TICKETS_ENABLED",
  "SUMMON_DRAWS_ENABLED","SUMMON_EVOLUTION_ENABLED"] as const;
const previous=flags.map(k=>process.env[k]);
try{
  flags.forEach(k=>process.env[k]="true");
  eq(evolutionEnabled(),true,"All four gates must be explicitly enabled");
  for(const key of flags){
    process.env[key]="false";
    eq(evolutionEnabled(),false,"Each independent flag fails shut: "+key);
    process.env[key]="true";
  }
  delete process.env.SUMMON_EVOLUTION_ENABLED;
  eq(evolutionEnabled(),false,"Absent evolution rollout defaults OFF");
}finally{
  flags.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:
    process.env[k]=previous[i]);
}
console.log("SUMMON_EVOLUTION_POLICY_PASS",checks,"checks");
