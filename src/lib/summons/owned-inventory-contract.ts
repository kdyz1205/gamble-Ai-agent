/**
 * Read-only authenticated owned Familiar wire format.
 * A concept render is NEVER an ownership receipt. Entries are actual
 * server-persisted free-ticket inventory instances, scoped by account.
 */
import {PROFESSIONS,RARITY_ODDS} from "./profession-system";

export type OwnedFamiliar={
  id:string;speciesId:string;rarity:string;form:string;
  professionId:string;occupationId:string;createdAt:string;
};
export type OwnedInventorySnapshot=
  |{available:false;extraSummons:null;reason:string}
  |{available:true;source:"server-owned-free-ticket-instances";
    items:OwnedFamiliar[];totalKnown:boolean;reason:string};

function isObject(v:unknown):v is Record<string,unknown>{
  return Boolean(v&&typeof v==="object"&&!Array.isArray(v));
}
const safeId=(id:unknown)=>typeof id==="string"&&
  /^[-_A-Za-z0-9]{8,128}$/.test(id);
const forms=new Set(["base","evolved","ascended"]);
const rarities=new Set<string>(RARITY_ODDS.map(r=>r.id));

/** Reject corrupted or invented inventory instead of displaying fake items.
 * Empty authenticated history is 0; a disabled/unavailable ledger is UNKNOWN.
 */
export function assertOwnedInventorySnapshot(raw:unknown):OwnedInventorySnapshot{
  if(!isObject(raw)||typeof raw.available!=="boolean"||
     typeof raw.reason!=="string"||raw.reason.length>300)
    throw new Error("Owned Summon snapshot is missing or invalid");
  if(!raw.available){
    if(raw.extraSummons!==null||"items" in raw)
      throw new Error("Disabled Summon inventory must remain UNKNOWN");
    return raw as OwnedInventorySnapshot;
  }
  if(raw.source!=="server-owned-free-ticket-instances"||
     !Array.isArray(raw.items)||raw.items.length>50||
     typeof raw.totalKnown!=="boolean"||
     raw.totalKnown!==(raw.items.length<50))
    throw new Error("Owned Familiar records have incomplete provenance");
  const seen=new Set<string>();
  for(const entry of raw.items){
    if(!isObject(entry)||!safeId(entry.id)||seen.has(entry.id as string)||
       typeof entry.speciesId!=="string"||entry.speciesId.length>256||
       typeof entry.professionId!=="string"||
       typeof entry.occupationId!=="string"||
       typeof entry.rarity!=="string"||!rarities.has(entry.rarity as string)||
       typeof entry.form!=="string"||!forms.has(entry.form)||
       typeof entry.createdAt!=="string"||
       !Number.isFinite(Date.parse(entry.createdAt)))
      throw new Error("An owned Summon item contains invalid server fields");
    const career=PROFESSIONS.find(p=>p.id===entry.professionId);
    if(!career||!career.specialties.some(s=>s.id===entry.occupationId)||
       entry.speciesId!==
         entry.professionId+"-"+entry.occupationId+"-"+entry.rarity+"-base")
      throw new Error("Owned Familiar species disagrees with awarded career");
    seen.add(entry.id as string);
  }
  return raw as OwnedInventorySnapshot;
}
