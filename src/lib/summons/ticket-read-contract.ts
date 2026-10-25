/** Read-only shared ticket receipt contract. No item granting or credit movement. */
import {PROFESSIONS,type ProfessionId} from "./profession-system";
export type CareerTicketSummary={professionId:ProfessionId;verifiedXp:number;eligibleMilestones:number;issued:number;available:number;spent:number;awaitingIssuance:number};
export type AccountFreeTicketSummary={
  source:"audited-free-profession-tickets-v1";coverage:"recorded-verification-events-only";
  available:number;spent:number;issued:number;awaitingIssuance:number;
  byProfession:CareerTicketSummary[];
};
const count=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
export function assertFreeTicketSummary(raw:unknown):AccountFreeTicketSummary|null{
  if(raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("Invalid audited ticket snapshot");
  const obj=raw as Record<string,unknown>;
  if(obj.source!=="audited-free-profession-tickets-v1"||
    obj.coverage!=="recorded-verification-events-only"||
    !count(obj.available)||!count(obj.spent)||!count(obj.issued)||
    !count(obj.awaitingIssuance)||!Array.isArray(obj.byProfession)||
    obj.byProfession.length>PROFESSIONS.length)
    throw new Error("Invalid ticket provenance or totals");
  const allowed=new Set<string>(PROFESSIONS.map(p=>p.id)),seen=new Set<string>();
  let available=0,spent=0,issued=0,awaiting=0;
  for(const entry of obj.byProfession){
    if(!entry||typeof entry!=="object"||Array.isArray(entry))
      throw new Error("Invalid ticket profession receipt");
    const r=entry as Record<string,unknown>;
    if(typeof r.professionId!=="string"||!allowed.has(r.professionId)||
      seen.has(r.professionId)||!count(r.verifiedXp)||
      !count(r.eligibleMilestones)||!count(r.issued)||!count(r.available)||
      !count(r.spent)||!count(r.awaitingIssuance)||
      (r.eligibleMilestones as number)>100||
      r.issued!==(r.available as number)+(r.spent as number)||
      r.eligibleMilestones!==(r.issued as number)+(r.awaitingIssuance as number))
      throw new Error("Ticket profession counts conflict");
    seen.add(r.professionId);available+=r.available as number;
    spent+=r.spent as number;issued+=r.issued as number;
    awaiting+=r.awaitingIssuance as number;
  }
  if(available!==obj.available||spent!==obj.spent||issued!==obj.issued||
    awaiting!==obj.awaitingIssuance||issued!==available+spent)
    throw new Error("Account ticket totals conflict with career receipts");
  return raw as AccountFreeTicketSummary;
}
