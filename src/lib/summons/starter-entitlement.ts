/**
 * Read-only starter rule. A verified SUM account is eligible for Pico by
 * definition. This is NOT yet an inventory row or a tradable/granted item.
 *
 * No DB write, item mint, credits, or user-scoped catalog access occurs here.
 */
import {PROFESSIONS,RARITY_ODDS,RARITY_VERSION,STARTER} from "./profession-system";

export const SUMMON_CATALOG_VERSION = "summon-professions-v1" as const;

export function readStarterEntitlement(userId:unknown) {
  if(typeof userId!=="string"||!userId.trim()||userId.length>256)return null;
  return Object.freeze({
    speciesId:STARTER.speciesId,
    name:STARTER.name,
    initialForEveryAccount:true,
    basis:"authenticated-account-rule" as const,
    persistedInventory:false,
    tradable:false,
    supportsFusion:false,
    awardedXp:null,
    awardedTickets:null,
    note:"Pico is your universal starter entitlement. Persistent collection and XP tracking are not connected yet.",
  });
}

export function readSummonCatalog() {
  return {
    version:SUMMON_CATALOG_VERSION,
    rarityVersion:RARITY_VERSION,
    availability:"concept-preview-only" as const,
    starter:{speciesId:STARTER.speciesId,name:STARTER.name,free:true},
    categories:PROFESSIONS.map(p=>({
      id:p.id,name:p.name,example:p.example,conceptSpecies:p.species,
      specialties:p.specialties.map(s=>({id:s.id,name:s.name})),
      grantStatus:"not-collectible" as const,
    })),
    rarityOdds:RARITY_ODDS.map(r=>({id:r.id,label:r.label,percent:r.weight/100})),
    pity:{rareAfterMisses:19,epicAfterMisses:79,scope:"browser-simulation-only" as const},
    restrictions:{
      cashPaidRandomDraws:false,
      permanentInventoryAvailable:false,
      verifiedXpLedgerAvailable:false,
      actualFusionAvailable:false,
    },
  };
}
