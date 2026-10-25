/**
 * Audits every cosmetic evolution, not merely the form in SummonInstance.
 * A forged "ascended" item without consecutive level-based receipts is denied.
 */
import type {Prisma} from "@/generated/prisma/client";
import {PROFESSIONS,type ProfessionId} from "./profession-system";
import {MAX_TICKETS_PER_CAREER,requireVerifiedCareerTicketPlan}
  from "./free-ticket-ledger";
import {
  EVOLUTION_RULE_VERSION,EVOLUTION_THRESHOLDS,matchesEvolutionScope,
  type EvolutionStage,
} from "./evolution-rules";

export const MAX_EVOLUTION_RECEIPTS=PROFESSIONS.length*MAX_TICKETS_PER_CAREER*2;
export class EvolutionProvenanceError extends Error{
  constructor(message:string){super(message);this.name="EvolutionProvenanceError";}
}
const reject=(message:string):never=>{throw new EvolutionProvenanceError(message);};

export type EvolutionSourceItem={
  professionId:string;
  instance:{
    id:string;ownerId:string;professionId:string|null;
    originKind:string;form:string;status:string;
  };
};

/** Caller must hold the same account-wide lock as the draw service. */
export async function verifyOwnedEvolutionHistory(
  tx:Prisma.TransactionClient,ownerId:string,draws:readonly EvolutionSourceItem[],
){
  const receipts=await tx.summonEvolutionReceipt.findMany({
    where:{ownerId},
    orderBy:[{instanceId:"asc"},{createdAt:"asc"},{id:"asc"}],
    take:MAX_EVOLUTION_RECEIPTS+1,
  });
  if(receipts.length>MAX_EVOLUTION_RECEIPTS)
    reject("Incomplete evolution receipt history");
  const items=new Map(draws.map(row=>[row.instance.id,row]));
  if(items.size!==draws.length)
    reject("Duplicate owned Familiar identities in draw source");
  const history=new Map<string,typeof receipts>();
  const verifiedXp=new Map<string,number>();
  for(const row of receipts){
    const drawn=items.get(row.instanceId);
    if(!drawn||row.ownerId!==ownerId||
       drawn.instance.ownerId!==ownerId||
       drawn.instance.originKind!=="free_ticket"||
       drawn.instance.status!=="owned"||
       row.professionId!==drawn.professionId||
       drawn.instance.professionId!==row.professionId||
       row.ruleVersion!==EVOLUTION_RULE_VERSION||
       !matchesEvolutionScope(ownerId,row.requestKey)||
       !Number.isSafeInteger(row.verifiedXp))
      reject("Evolution receipt does not match original owned free draw");
    const minimum=EVOLUTION_THRESHOLDS[row.toForm as EvolutionStage];
    if(!(row.fromForm==="base"&&row.toForm==="evolved"||
       row.fromForm==="evolved"&&row.toForm==="ascended")||
       !minimum||row.verifiedXp<minimum)
      reject("Evolution receipt has an impossible stage or XP threshold");
    let current=verifiedXp.get(row.professionId);
    if(current===undefined){
      if(!PROFESSIONS.some(p=>p.id===row.professionId))
        reject("Unknown evolution career family");
      // Re-check original Quest proof, final judgment, and absence of appeal.
      current=(await requireVerifiedCareerTicketPlan(
        tx,ownerId,row.professionId as ProfessionId)).verifiedXp;
      verifiedXp.set(row.professionId,current);
    }
    if(row.verifiedXp>current)
      reject("Evolved form is no longer supported by current audited XP");
    const list=history.get(row.instanceId)||[];
    list.push(row);history.set(row.instanceId,list);
  }
  for(const drawn of draws){
    const item=drawn.instance,rows=history.get(item.id)||[];
    if(rows.length>2||item.ownerId!==ownerId||
       item.status!=="owned"||item.originKind!=="free_ticket")
      reject("Evolution inventory history is inconsistent");
    if(rows.length>=1&&(
       rows[0].fromForm!=="base"||rows[0].toForm!=="evolved"))
      reject("Missing first evolution or malformed stage sequence");
    if(rows.length===2&&(
       rows[1].fromForm!=="evolved"||rows[1].toForm!=="ascended"||
       rows[1].createdAt.getTime()<rows[0].createdAt.getTime()))
      reject("Final form requires a preceding valid evolution");
    const expected=rows.length===2?"ascended":
      rows.length===1?"evolved":"base";
    if(item.form!==expected)
      reject("Owned form is not supported by complete evolution receipts");
  }
  return receipts;
}
