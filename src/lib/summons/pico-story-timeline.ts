/** Original Pico prologue. Deterministic, presentational, no Quest or XP writes. */
export type StoryPhase="intro"|"summoning"|"ready"|"casting"|"complete";
export type StoryCue="veil"|"emerge"|"idle"|"gather"|"release"|"impact"|"afterglow";

export const SUMMON_MS=1450;
export const CAST_MS=2700;
export const STORY_SEQUENCE_ID="pico-prologue-01";

export type StoryFrame={
  cue:StoryCue;
  characterScale:number;
  characterX:number;
  characterY:number;
  characterRoll:number;
  cameraZ:number;
  gateGlow:number;
  spellGlow:number;
  impactGlow:number;
  petalRotation:number;
};

const clamp=(value:number)=>Math.max(0,Math.min(1,value));
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const easeOutCubic=(x:number)=>1-(1-clamp(x))**3;
const easeInOutCubic=(x:number)=>{
  const t=clamp(x);
  return t<.5?4*t*t*t:1-(-2*t+2)**3/2;
};

export function samplePicoStory(phase:StoryPhase,ms:number,reduced=false):StoryFrame{
  const t=Math.max(0,Number.isFinite(ms)?ms:0);
  const frame:StoryFrame={
    cue:"idle",characterScale:1,characterX:0,characterY:0,
    characterRoll:0,cameraZ:4.2,gateGlow:.35,spellGlow:0,
    impactGlow:0,petalRotation:0,
  };
  if(phase==="intro"){
    return {...frame,cue:"veil",characterScale:0.72,characterY:-.3,
      gateGlow:.8,cameraZ:4.8};
  }
  if(phase==="summoning"){
    const appear=easeOutCubic(t/SUMMON_MS);
    const squash=reduced?0:Math.sin(Math.PI*clamp(t/SUMMON_MS))*.07;
    return {...frame,cue:"emerge",characterScale:lerp(.25,1,appear)+squash,
      characterY:lerp(-1.35,0,appear),cameraZ:lerp(5.15,4.2,appear),
      gateGlow:lerp(1,.38,appear),
      petalRotation:reduced?0:appear*.75};
  }
  if(phase==="ready"){
    return {...frame,cue:"idle",characterY:reduced?0:Math.sin(t*.0018)*.045,
      petalRotation:reduced?0:t*.00005,gateGlow:.38};
  }
  if(phase==="complete"){
    return {...frame,cue:"afterglow",gateGlow:.72,
      spellGlow:.24,characterY:reduced?0:.025,cameraZ:4.28};
  }
  // A complete cast has a readable anime-style arc: anticipation, rapid
  // release, one held impact frame, recovery. Not a damage/result calculation.
  if(t<760){
    const k=easeInOutCubic(t/760);
    return {...frame,cue:"gather",characterScale:1-0.085*k,
      characterY:-.12*k,characterRoll:-.12*k,
      spellGlow:lerp(.15,1,k),gateGlow:lerp(.38,.62,k),
      cameraZ:lerp(4.2,3.9,k)};
  }
  if(t<1140){
    const k=easeOutCubic((t-760)/380);
    return {...frame,cue:"release",characterScale:lerp(.915,1.08,k),
      characterX:lerp(0,.39,k),
      characterY:lerp(-.12,.23,k),characterRoll:lerp(-.12,.20,k),
      spellGlow:1,gateGlow:.7,cameraZ:lerp(3.9,3.65,k),
      petalRotation:reduced?0:k*1.8};
  }
  if(t<1340){
    const k=clamp((t-1140)/200);
    return {...frame,cue:"impact",characterScale:1.08-k*.03,
      characterX:lerp(.39,.28,k),characterY:lerp(.23,.16,k),
      characterRoll:lerp(.20,.07,k),spellGlow:lerp(1,.65,k),
      impactGlow:reduced?.8:1-k*.35,cameraZ:3.65};
  }
  const recovery=easeInOutCubic((t-1340)/(CAST_MS-1340));
  return {...frame,cue:"afterglow",
    characterScale:lerp(1.05,1,recovery),
    characterX:lerp(.28,0,recovery),
    characterY:lerp(.16,0,recovery),
    characterRoll:lerp(.07,0,recovery),
    cameraZ:lerp(3.65,4.2,recovery),
    spellGlow:lerp(.65,.16,recovery),
    impactGlow:0,gateGlow:lerp(.7,.55,recovery),
    petalRotation:reduced?0:recovery*1.6};
}
