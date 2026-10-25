/**
 * Immutable, zero-price cosmetic progression policy.
 * Profession XP is earned exclusively from verified Quest source receipts.
 * No credits, wagers, client "levels", synthetic XP or rarity rerolls.
 */
export const EVOLUTION_RULE_VERSION="verified-career-evolution-v1" as const;
export const EVOLUTION_THRESHOLDS={
  evolved:350,
  ascended:1600,
} as const;
export type EvolutionStage=keyof typeof EVOLUTION_THRESHOLDS;
export type FamiliarForm="base"|EvolutionStage;
const REQUEST_PREFIX="summon-evolution:"+EVOLUTION_RULE_VERSION+":";

export function evolutionRequestScope(ownerId:string,requestKey:string){
  if(typeof ownerId!=="string"||!ownerId.trim()||ownerId.length>256)
    throw new RangeError("Authenticated owner required");
  if(typeof requestKey!=="string"||!/^[-_A-Za-z0-9]{16,80}$/.test(requestKey))
    throw new RangeError("A stable, unique evolution request key is required");
  return REQUEST_PREFIX+ownerId+":"+requestKey;
}
export function matchesEvolutionScope(ownerId:string,requestKey:string){
  return typeof requestKey==="string"&&
    requestKey.startsWith(REQUEST_PREFIX+ownerId+":")&&
    /^[-_A-Za-z0-9]{16,80}$/.test(
      requestKey.slice((REQUEST_PREFIX+ownerId+":").length));
}
export function nextFamiliarStage(current:unknown):EvolutionStage|null{
  if(current==="base")return "evolved";
  if(current==="evolved")return "ascended";
  if(current==="ascended")return null;
  throw new RangeError("Unsupported actual Familiar form");
}
export function requiredVerifiedXp(stage:EvolutionStage):number{
  if(stage!=="evolved"&&stage!=="ascended")
    throw new RangeError("Unsupported evolution stage");
  return EVOLUTION_THRESHOLDS[stage];
}
export function canEvolveFromXp(current:unknown,toStage:EvolutionStage,xp:unknown){
  return nextFamiliarStage(current)===toStage&&
    typeof xp==="number"&&Number.isSafeInteger(xp)&&
    xp>=requiredVerifiedXp(toStage);
}
export function evolutionEnabled(){
  // Existing draw flags are independently gated; this fourth flag is never
  // turned on by a read or a Deploy. Always off if omitted.
  return process.env.SUMMON_PERSISTENCE_ENABLED==="true"&&
    process.env.SUMMON_TICKETS_ENABLED==="true"&&
    process.env.SUMMON_DRAWS_ENABLED==="true"&&
    process.env.SUMMON_EVOLUTION_ENABLED==="true";
}
