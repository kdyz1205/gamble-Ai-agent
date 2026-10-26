import assert from "node:assert/strict";
import {CAST_MS,SUMMON_MS,STORY_SEQUENCE_ID,samplePicoStory}
  from "../src/lib/summons/pico-story-timeline";

let checks=0;
const ok=(value:unknown,reason:string)=>{assert.ok(value,reason);checks++;};
ok(STORY_SEQUENCE_ID==="pico-prologue-01","Original single-chapter identity");
ok(SUMMON_MS>=1000&&CAST_MS>SUMMON_MS,"Readable anticipation and release durations");
const intro=samplePicoStory("intro",0);
ok(intro.cue==="veil"&&intro.characterScale<1,"Prologue begins behind its portal");
const early=samplePicoStory("summoning",0);
const emerged=samplePicoStory("summoning",SUMMON_MS);
ok(early.characterScale<.5,"Real 3D entrance not already in place");
ok(emerged.characterScale>=.99&&emerged.characterY===0,"Arrival resolves");
const ready=samplePicoStory("ready",1200,true);
ok(ready.cue==="idle"&&ready.spellGlow===0,"Await input; no fake spell cast");
const prepare=samplePicoStory("casting",350);
const release=samplePicoStory("casting",850);
const impact=samplePicoStory("casting",1200);
const rest=samplePicoStory("casting",CAST_MS);
ok(prepare.cue==="gather"&&prepare.characterScale<1,"Readable anticipation");
ok(release.cue==="release"&&release.characterX>0,"Action travels forward");
ok(impact.cue==="impact"&&impact.impactGlow>.1,"Actual held impact beat");
ok(rest.cue==="afterglow"&&rest.impactGlow===0,"No permanent fake impact");
ok(impact.cameraZ<ready.cameraZ,"Camera push-in emphasizes the spell");
const reducedCast=samplePicoStory("casting",CAST_MS,true);
ok(reducedCast.cue==="afterglow"&&reducedCast.impactGlow===0,
  "Reduced motion can settle directly without continuous flashing");
ok(samplePicoStory("casting",-300).cue==="gather",
  "Negative input clamps safely to opening beat");
ok(samplePicoStory("casting",Number.NaN).cue==="gather",
  "Invalid time cannot trigger a success beat");
ok(samplePicoStory("complete",0).cue==="afterglow",
  "Completed visual-only ritual does not imply XP");
for(const phase of ["intro","summoning","ready","casting","complete"] as const){
  const frame=samplePicoStory(phase,200);
  ok([frame.characterScale,frame.cameraZ,frame.impactGlow]
    .every(Number.isFinite),"Finite, bounded stage "+phase);
}
console.log("PICO_STORY_TIMELINE_PASS",checks,"checks");
