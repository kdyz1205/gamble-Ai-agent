/**
 * Account-bound, zero-payment Summon draw. Persisted as ONE atomic database
 * transaction: audited ticket spend + actual owned Summon + immutable RNG/pity
 * receipt + audit event. Defaults OFF in every deployment.
 */
import {randomInt} from "node:crypto";
import prisma from "@/lib/db";
import type {Prisma} from "@/generated/prisma/client";
import {
  PROFESSIONS,RARITY_VERSION,INITIAL_PITY_STATE,drawRarity,advancePityState,
  previewSummon,type ProfessionId,type PityState,
} from "./profession-system";
import {
  TICKET_GRANT_RULE_VERSION,MAX_TICKETS_PER_CAREER,
  requireVerifiedCareerTicketPlan,summonTicketsEnabled,
} from "./free-ticket-ledger";

export const FREE_DRAW_RULE_VERSION="audited-free-draw-v1";
export const DRAW_RANDOM_RANGE=1_000_000_000;
export const MAX_ACCOUNT_DRAWS=PROFESSIONS.length*MAX_TICKETS_PER_CAREER;
const grantPrefix="summon-free-draw:"+FREE_DRAW_RULE_VERSION+":";
const requestPrefix="summon-free-draw-request:"+FREE_DRAW_RULE_VERSION+":";

export class SummonDrawError extends Error {
  constructor(public readonly statusCode:number,message:string){
    super(message);this.name="SummonDrawError";
  }
}
const invalid=(msg:string):never=>{throw new SummonDrawError(409,msg);};
export function freeDrawEnabled(){
  return summonTicketsEnabled()&&process.env.SUMMON_DRAWS_ENABLED==="true";
}
function validate(input:{
  ownerId:string;professionId:ProfessionId;occupationId:string;requestKey:string;
}){
  if(typeof input.ownerId!=="string"||!input.ownerId.trim()||
     input.ownerId.length>256)
    throw new SummonDrawError(401,"Authenticated user required");
  if(typeof input.requestKey!=="string"||
     !/^[-_A-Za-z0-9]{16,80}$/.test(input.requestKey))
    throw new SummonDrawError(400,"Stable, unique draw request key required");
  if(typeof input.occupationId!=="string")
    throw new SummonDrawError(400,"Occupation choice required");
  const profession=PROFESSIONS.find(p=>p.id===input.professionId);
  if(!profession||!profession.specialties.some(s=>s.id===input.occupationId))
    throw new SummonDrawError(400,"Select an eligible career and specialization");
}
export function freeDrawGrantKey(ticketGrantKey:string){
  if(typeof ticketGrantKey!=="string"||
     !ticketGrantKey.startsWith("summon-ticket:"+TICKET_GRANT_RULE_VERSION+":"))
    throw new SummonDrawError(400,"Invalid audited ticket grant key");
  return grantPrefix+ticketGrantKey;
}

/** Verify ALL preceding draws, not just last counters. One account-wide
 * sequence: changing professions never resets Rare/Epic pity.
 */
async function authenticatedPityHistory(tx:Prisma.TransactionClient,ownerId:string){
  const rows=await tx.summonDrawReceipt.findMany({
    where:{ownerId},orderBy:{ordinal:"asc"},take:MAX_ACCOUNT_DRAWS+1,
    include:{
      ticket:{select:{ownerId:true,professionId:true,grantKey:true,
        status:true,spentByGrant:true,spentAt:true}},
      instance:{select:{id:true,ownerId:true,professionId:true,
        occupationId:true,rarity:true,speciesId:true,originKind:true,grantKey:true,
        status:true,form:true,createdAt:true}},
    },
  });
  if(rows.length>MAX_ACCOUNT_DRAWS)
    invalid("Account draw history exceeds safe verification bounds");
  let pity:PityState={...INITIAL_PITY_STATE};
  for(const [i,row] of rows.entries()){
    if(row.ordinal!==i+1||row.ownerId!==ownerId||
       row.ruleVersion!==FREE_DRAW_RULE_VERSION||
       !Number.isSafeInteger(row.randomValue)||row.randomValue<0||
       row.randomValue>=DRAW_RANDOM_RANGE||
       row.rareMissesBefore!==pity.sinceRare||
       row.epicMissesBefore!==pity.sinceEpic)
      invalid("Draw ordinal, policy or stored RNG is inconsistent");
    const profession=PROFESSIONS.find(p=>p.id===row.professionId);
    const occupation=profession?.specialties.find(o=>o.id===row.occupationId);
    if(!profession||!occupation||
       row.ticket.ownerId!==ownerId||
       row.ticket.professionId!==row.professionId||
       !row.ticket.grantKey.startsWith(
         "summon-ticket:"+TICKET_GRANT_RULE_VERSION+":"+ownerId+":"+row.professionId+":")||
       row.ticket.status!=="spent"||!row.ticket.spentAt||
       row.ticket.spentByGrant!==freeDrawGrantKey(row.ticket.grantKey)||
       row.instance.ownerId!==ownerId||
       row.instance.id!==row.instanceId||
       row.instance.professionId!==row.professionId||
       row.instance.occupationId!==row.occupationId||
       row.instance.originKind!=="free_ticket"||
       row.instance.status!=="owned"||
       !["base","evolved","ascended"].includes(row.instance.form)||
       row.instance.grantKey!==freeDrawGrantKey(row.ticket.grantKey)||
       row.instance.rarity!==row.rarity||
       row.instance.speciesId!==
         row.professionId+"-"+row.occupationId+"-"+row.rarity+"-base")
      invalid("Draw provenance is no longer supported by spent ticket and owned item");
    const result=drawRarity(row.randomValue/DRAW_RANDOM_RANGE,pity);
    if(result.rarity!==row.rarity||result.pity!==row.pityKind||
       JSON.stringify(result.effectiveWeights)!==row.effectiveWeights)
      invalid("Recorded rarity or disclosed draw weights fail replay");
    pity=advancePityState(pity,result.rarity);
    if(row.rareMissesAfter!==pity.sinceRare||
       row.epicMissesAfter!==pity.sinceEpic)
      invalid("Persisted draw pity counters are discontinuous");
  }
  return {pity,ordinal:rows.length,rows};
}

/**
 * Authenticated, read-only inventory projection backed by the COMPLETE
 * versioned draw ledger. Reading cannot grant an item or spend a ticket.
 * Keep the existing Pico and other future inventory contracts separate.
 */
export async function readOwnedFreeDrawInventory(ownerId:string){
  if(!freeDrawEnabled())return null;
  if(typeof ownerId!=="string"||!ownerId.trim()||ownerId.length>256)
    throw new SummonDrawError(401,"Authenticated account required");
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 843219))`;
    const verified=await authenticatedPityHistory(tx,ownerId);
    const actual=await tx.summonInstance.count({
      where:{ownerId,originKind:"free_ticket"},
    });
    if(actual!==verified.rows.length)
      invalid("Unreceipted, missing, or conflicting free-ticket inventory records");
    const recent=verified.rows.slice().sort((a,b)=>
      b.instance.createdAt.getTime()-a.instance.createdAt.getTime()||
      b.instance.id.localeCompare(a.instance.id)).slice(0,50);
    return {
      items:recent.map(row=>({
        id:row.instance.id,speciesId:row.instance.speciesId,
        rarity:row.instance.rarity,form:row.instance.form,
        professionId:row.professionId,occupationId:row.occupationId,
        createdAt:row.instance.createdAt.toISOString(),
      })),
      totalKnown:verified.rows.length<50,
    };
  },{isolationLevel:"ReadCommitted",maxWait:20_000,timeout:30_000});
}

type DrawView={
  receiptId:string;instanceId:string;speciesId:string;rarity:string;
  professionId:string;occupationId:string;ordinal:number;
  pityKind:string;randomValue:number;
  oddsVersion:typeof RARITY_VERSION;ruleVersion:typeof FREE_DRAW_RULE_VERSION;
  effectiveWeights:Array<{id:string;weight:number}>;
  rareMissesAfter:number;epicMissesAfter:number;
  creditsTransferred:0;reused:boolean;
};
function toView(row:{
  id:string;ordinal:number;professionId:string;occupationId:string;
  randomValue:number;rarity:string;pityKind:string;
  rareMissesAfter:number;epicMissesAfter:number;
  effectiveWeights:string;
  instance:{id:string;speciesId:string};
},reused:boolean):DrawView{
  const weights=JSON.parse(row.effectiveWeights) as Array<{id:string;weight:number}>;
  return {
    receiptId:row.id,instanceId:row.instance.id,
    speciesId:row.instance.speciesId,
    rarity:row.rarity,professionId:row.professionId,
    occupationId:row.occupationId,ordinal:row.ordinal,
    pityKind:row.pityKind,randomValue:row.randomValue,
    oddsVersion:RARITY_VERSION,ruleVersion:FREE_DRAW_RULE_VERSION,
    effectiveWeights:weights,
    rareMissesAfter:row.rareMissesAfter,
    epicMissesAfter:row.epicMissesAfter,
    creditsTransferred:0,reused,
  };
}

/** No stake, cash, purchased-credit or user-supplied RNG enters this service. */
export async function redeemFreeSummonTicket(input:{
  ownerId:string;professionId:ProfessionId;occupationId:string;requestKey:string;
}):Promise<DrawView>{
  if(!freeDrawEnabled())
    throw new SummonDrawError(503,"Audited free Summon draws are not enabled");
  validate(input);
  const scopedRequest=requestPrefix+input.ownerId+":"+input.requestKey;
  return prisma.$transaction(async tx=>{
    // Account-wide lock is required because pity persists across careers.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.ownerId}, 843219))`;
    const history=await authenticatedPityHistory(tx,input.ownerId);
    const plan=await requireVerifiedCareerTicketPlan(
      tx,input.ownerId,input.professionId);
    const duplicate=await tx.summonDrawReceipt.findUnique({
      where:{requestKey:scopedRequest},include:{instance:{select:{id:true,speciesId:true}}},
    });
    if(duplicate){
      if(duplicate.ownerId!==input.ownerId||
         duplicate.professionId!==input.professionId||
         duplicate.occupationId!==input.occupationId)
        invalid("Retry key conflicts with an earlier free draw");
      if(!history.rows.some(r=>r.id===duplicate.id))
        invalid("Draw replay has no authenticated history");
      return toView(duplicate,true);
    }
    if(history.ordinal>=MAX_ACCOUNT_DRAWS)
      invalid("Account draw history requires manual capacity review");
    const tickets=await tx.summonTicket.findMany({
      where:{ownerId:input.ownerId,professionId:input.professionId},
      select:{id:true,ownerId:true,professionId:true,grantKey:true,
        sourceVersion:true,status:true,spentByGrant:true,spentAt:true},
    });
    const expected=new Set(plan.grants.map(g=>g.grantKey));
    const mintedPrefix=new Set(plan.grants.slice(0,tickets.length).map(g=>g.grantKey));
    if(tickets.length>plan.grants.length||tickets.some(t=>
       !expected.has(t.grantKey)||!mintedPrefix.has(t.grantKey)||
       t.sourceVersion!==TICKET_GRANT_RULE_VERSION||
       t.ownerId!==input.ownerId||t.professionId!==input.professionId||
       !["available","spent"].includes(t.status)||
       (t.status==="spent"&&(!t.spentByGrant||!t.spentAt))||
       (t.status==="available"&&(t.spentByGrant!==null||t.spentAt!==null))))
      invalid("Ticket ledger does not match authenticated earned milestones");
    const spentSet=new Set(history.rows.map(row=>row.ticketId));
    if(tickets.some(t=>t.status==="spent"&&!spentSet.has(t.id)))
      invalid("Previously spent ticket lacks a valid draw receipt");
    const available=plan.grants
      .map(expectedGrant=>tickets.find(t=>t.grantKey===expectedGrant.grantKey))
      .find(t=>t?.status==="available");
    if(!available)
      throw new SummonDrawError(409,"No issued, unused free ticket in this career");
    const randomValue=randomInt(DRAW_RANDOM_RANGE);
    const unit=randomValue/DRAW_RANDOM_RANGE;
    const computed=drawRarity(unit,history.pity);
    const species=previewSummon({
      professionId:input.professionId,occupationId:input.occupationId,
      masteryLevel:1,randomUnit:unit,pity:history.pity,
    });
    if(species.rarity!==computed.rarity)
      invalid("Rarity and species policy disagree");
    const after=advancePityState(history.pity,computed.rarity);
    const grantKey=freeDrawGrantKey(available.grantKey);
    const item=await tx.summonInstance.create({data:{
      ownerId:input.ownerId,professionId:input.professionId,
      occupationId:input.occupationId,
      speciesId:species.speciesId,originKind:"free_ticket",
      grantKey,rarity:computed.rarity,form:"base",status:"owned",
    }});
    const consumed=await tx.summonTicket.updateMany({
      where:{id:available.id,ownerId:input.ownerId,status:"available",
        spentByGrant:null},
      data:{status:"spent",spentByGrant:grantKey,spentAt:new Date()},
    });
    if(consumed.count!==1)
      invalid("Free ticket was already consumed");
    const receipt=await tx.summonDrawReceipt.create({
      data:{
        ownerId:input.ownerId,professionId:input.professionId,
        occupationId:input.occupationId,ordinal:history.ordinal+1,
        requestKey:scopedRequest,ticketId:available.id,instanceId:item.id,
        rarity:computed.rarity,pityKind:computed.pity,randomValue,
        effectiveWeights:JSON.stringify(computed.effectiveWeights),
        rareMissesBefore:history.pity.sinceRare,
        epicMissesBefore:history.pity.sinceEpic,
        rareMissesAfter:after.sinceRare,epicMissesAfter:after.sinceEpic,
        ruleVersion:FREE_DRAW_RULE_VERSION,
      },
      include:{instance:{select:{id:true,speciesId:true}}},
    });
    await tx.auditLog.create({data:{
      action:"summon.free-draw.committed",actorUserId:input.ownerId,
      payload:JSON.stringify({receiptId:receipt.id,
        ticketId:available.id,instanceId:item.id,
        professionId:input.professionId,occupationId:input.occupationId,
        rarity:computed.rarity,ruleVersion:FREE_DRAW_RULE_VERSION,
        rarityOddsVersion:RARITY_VERSION,randomValue,
        effectiveWeights:computed.effectiveWeights,
        pityBefore:history.pity,pityAfter:after,creditsTransferred:0}),
    }});
    return toView(receipt,false);
  },{maxWait:20_000,timeout:30_000});
}
