/**
 * FREE, deterministic, account-owned Familiar evolution.
 * Changes ONLY cosmetic form; never rarity, ownership, wallet or credits.
 * All provenance, verified career XP and stage order are rechecked in one
 * database transaction behind the same account-wide lock used by draws.
 */
import prisma from "@/lib/db";
import {authenticatedPityHistory} from "./free-draw-ledger";
import {requireVerifiedCareerTicketPlan} from "./free-ticket-ledger";
import {verifyOwnedEvolutionHistory} from "./evolution-receipts";
import {type ProfessionId,PROFESSIONS} from "./profession-system";
import {
  EVOLUTION_RULE_VERSION,evolutionEnabled,evolutionRequestScope,
  nextFamiliarStage,requiredVerifiedXp,type EvolutionStage,
} from "./evolution-rules";

export class SummonEvolutionError extends Error{
  constructor(public readonly statusCode:number,message:string){
    super(message);this.name="SummonEvolutionError";
  }
}
function reject(status:number,message:string):never{
  throw new SummonEvolutionError(status,message);
}

export type EvolutionResult={
  receiptId:string;instanceId:string;professionId:string;
  previousForm:string;form:EvolutionStage;verifiedXp:number;
  requiredXp:number;creditsTransferred:0;rarityUnchanged:true;
  ruleVersion:typeof EVOLUTION_RULE_VERSION;
  reused:boolean;
};
function result(row:{
  id:string;instanceId:string;professionId:string;
  fromForm:string;toForm:string;verifiedXp:number;
},reused:boolean):EvolutionResult{
  const form=row.toForm as EvolutionStage;
  return {
    receiptId:row.id,instanceId:row.instanceId,
    professionId:row.professionId,previousForm:row.fromForm,
    form,verifiedXp:row.verifiedXp,requiredXp:requiredVerifiedXp(form),
    creditsTransferred:0,rarityUnchanged:true,
    ruleVersion:EVOLUTION_RULE_VERSION,reused,
  };
}

/** Called only on explicit authenticated player confirmation. */
export async function evolveOwnedFamiliar(input:{
  ownerId:string;instanceId:string;toForm:EvolutionStage;requestKey:string;
}):Promise<EvolutionResult>{
  if(!evolutionEnabled())
    reject(503,"Verified profession evolution is not enabled");
  if(typeof input.ownerId!=="string"||!input.ownerId.trim()||
     input.ownerId.length>256)
    reject(401,"Authenticated owner required");
  if(typeof input.instanceId!=="string"||
     !/^[-_A-Za-z0-9]{8,128}$/.test(input.instanceId))
    reject(400,"Valid owned Familiar ID required");
  if(input.toForm!=="evolved"&&input.toForm!=="ascended")
    reject(400,"Only one sequential evolution stage is allowed");
  let request:string;
  try{request=evolutionRequestScope(input.ownerId,input.requestKey);}
  catch{reject(400,"Stable, unique evolution request key required");}
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.ownerId}, 843219))`;
    const draws=await authenticatedPityHistory(tx,input.ownerId);
    const evolution=await verifyOwnedEvolutionHistory(tx,input.ownerId,draws.rows);
    const instance=draws.rows.find(r=>r.instance.id===input.instanceId);
    if(!instance)
      reject(403,"This verified free-ticket Familiar does not belong to the account");

    const earlier=evolution.find(r=>r.requestKey===request);
    if(earlier){
      if(earlier.instanceId!==input.instanceId||
         earlier.toForm!==input.toForm||
         earlier.ownerId!==input.ownerId)
        reject(409,"Retry key belongs to a different evolution decision");
      return result(earlier,true);
    }

    const from=instance.instance.form;
    if(nextFamiliarStage(from)!==input.toForm)
      reject(409,"Evolution must follow base, evolved, then ascended exactly");
    if(instance.instance.originKind!=="free_ticket"||
       instance.instance.status!=="owned"||
       instance.instance.ownerId!==input.ownerId)
      reject(409,"Only a presently owned audited free-ticket Familiar may evolve");
    const family=instance.professionId;
    if(!PROFESSIONS.some(p=>p.id===family))
      reject(409,"Evolution career does not match audited catalog");
    const plan=await requireVerifiedCareerTicketPlan(
      tx,input.ownerId,family as ProfessionId);
    const threshold=requiredVerifiedXp(input.toForm);
    if(plan.verifiedXp<threshold)
      reject(409,"More current verified profession XP is required to evolve");

    const changed=await tx.summonInstance.updateMany({
      where:{id:input.instanceId,ownerId:input.ownerId,
        originKind:"free_ticket",status:"owned",form:from},
      data:{form:input.toForm},
    });
    if(changed.count!==1)
      reject(409,"Owned Familiar form changed during evolution");

    const record=await tx.summonEvolutionReceipt.create({data:{
      ownerId:input.ownerId,instanceId:input.instanceId,
      professionId:family,requestKey:request,
      fromForm:from,toForm:input.toForm,
      verifiedXp:plan.verifiedXp,ruleVersion:EVOLUTION_RULE_VERSION,
    }});
    await tx.auditLog.create({data:{
      actorUserId:input.ownerId,action:"summon.evolution.committed",
      payload:JSON.stringify({
        receiptId:record.id,instanceId:input.instanceId,
        professionId:family,fromForm:from,toForm:input.toForm,
        verifiedXp:plan.verifiedXp,minimumXp:threshold,
        ruleVersion:EVOLUTION_RULE_VERSION,creditsTransferred:0,
        itemSpeciesAndRarityUnchanged:true,
      }),
    }});
    return result(record,false);
  },{maxWait:20_000,timeout:30_000});
}
