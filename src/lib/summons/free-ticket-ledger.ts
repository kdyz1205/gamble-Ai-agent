/**
 * Profession-scoped FREE ticket milestones. Internal-only, fail-closed.
 * Never use stakes, cash, profile assertions or client-side RNG as XP.
 * Disabled unless BOTH persistence and ticket flags are enabled.
 */
import prisma from "@/lib/db";
import type {Prisma} from "@/generated/prisma/client";
import {PROFESSIONS,previewTicketMilestones,type ProfessionId} from "./profession-system";
import {XP_LEDGER_VERSION,summonPersistenceEnabled} from "./server-ledger";
import {assertFreeTicketSummary} from "./ticket-read-contract";

export const TICKET_GRANT_RULE_VERSION="free-profession-milestones-v1";
export const MAX_TICKET_SOURCE_EVENTS=2000;
export const MAX_TICKETS_PER_CAREER=100;

export class SummonTicketSourceError extends Error {
  constructor(reason:string){super(reason);this.name="SummonTicketSourceError";}
}

type TicketXpEvent={
  eventKey:string; ownerId:string; professionId:string; awardType:string;
  challengeId:string|null; sourceReceipt:string|null; ruleVersion:string;
  amount:number;
};

function validateCareer(ownerId:string,professionId:ProfessionId){
  if(typeof ownerId!=="string"||!ownerId.trim()||ownerId.length>256||
     !PROFESSIONS.some(entry=>entry.id===professionId))
    throw new SummonTicketSourceError("Invalid owner or profession family");
}

export function ticketGrantKey(ownerId:string,professionId:ProfessionId,ordinal:number){
  validateCareer(ownerId,professionId);
  if(!Number.isSafeInteger(ordinal)||ordinal<1||ordinal>MAX_TICKETS_PER_CAREER)
    throw new SummonTicketSourceError("Ticket milestone index out of bounds");
  return "summon-ticket:"+TICKET_GRANT_RULE_VERSION+":"+ownerId+":"+
    professionId+":"+ordinal;
}

export function computeEligibleCareerTickets(
  ownerId:string,professionId:ProfessionId,events:readonly TicketXpEvent[]
){
  validateCareer(ownerId,professionId);
  if(!Array.isArray(events)||events.length>MAX_TICKET_SOURCE_EVENTS)
    throw new SummonTicketSourceError("XP history may be incomplete; reconciliation required");
  const keys=new Set<string>(),quests=new Set<string>();
  let verifiedXp=0;
  for(const entry of events){
    if(!entry||entry.ownerId!==ownerId||entry.professionId!==professionId||
       entry.ruleVersion!==XP_LEDGER_VERSION||
       entry.awardType!=="verified_quest"||
       entry.eventKey!==("quest-xp:"+XP_LEDGER_VERSION+":"+entry.challengeId+":"+entry.ownerId+":"+entry.professionId)||
       !entry.challengeId||!entry.sourceReceipt||
       ![80,100].includes(entry.amount)||
       keys.has(entry.eventKey)||quests.has(entry.challengeId)) {
      throw new SummonTicketSourceError("XP history contains an unverified or conflicting event");
    }
    keys.add(entry.eventKey);
    quests.add(entry.challengeId);
    verifiedXp+=entry.amount;
  }
  const planned=previewTicketMilestones(verifiedXp);
  if(planned.tickets>MAX_TICKETS_PER_CAREER)
    throw new SummonTicketSourceError("Ticket history exceeds manual review threshold");
  const grants=Array.from({length:planned.tickets},(_,i)=>({
    grantKey:ticketGrantKey(ownerId,professionId,i+1),
    ownerId,professionId,sourceVersion:TICKET_GRANT_RULE_VERSION,
    status:"available" as const,
  }));
  return {verifiedXp,earnedMilestones:planned.tickets,
    nextAtXp:planned.nextAtXp,grants,
    coverage:"recorded-verification-events-only" as const};
}

export function summonTicketsEnabled(){
  return summonPersistenceEnabled()&&process.env.SUMMON_TICKETS_ENABLED==="true";
}

/** Verify stored XP remains supported by the CURRENT final Quest receipt.
 * Reject refunds/reversals, unverified proof and edited results.
 */
function assertCurrentQuestReceipt(event:{
  ownerId:string;professionId:string;amount:number;sourceReceipt:string|null;
  challenge: {
    creatorId:string;status:string;type:string;
    participants:readonly {userId:string;role:string;status:string}[];
    evidence:readonly {userId:string}[];
    judgments:readonly {id:string;winnerId:string|null}[];
    reviewCase:{
      status:string;resolution:string|null;resolvedWinnerId:string|null;
      finalJudgmentId:string|null;
    }|null;
    verdictResponses:readonly {userId:string;decision:string}[];
  }|null;
}){
  const quest=event.challenge;
  if(!quest||quest.status!=="settled")
    throw new SummonTicketSourceError("XP source Quest is not finally settled");
  const professionFromType:Record<string,string>={
    Coding:"software",Fitness:"athletics",Cooking:"culinary",
  };
  if(professionFromType[quest.type]!==event.professionId)
    throw new SummonTicketSourceError("XP source profession no longer matches Quest");
  const players=quest.participants.filter(p=>
    (p.role==="creator"||p.role==="opponent")&&
    (p.status==="accepted"||p.status==="completed"));
  const ids=players.map(p=>p.userId);
  if(ids.length!==2||new Set(ids).size!==2||
     players.filter(p=>p.role==="creator"&&p.userId===quest.creatorId).length!==1||
     players.filter(p=>p.role==="opponent").length!==1||
     !ids.includes(event.ownerId))
    throw new SummonTicketSourceError("XP source has invalid participant roles");
  const submitted=new Set(quest.evidence.map(p=>p.userId));
  if(!ids.every(id=>submitted.has(id)))
    throw new SummonTicketSourceError("XP source lacks proof from each competitor");
  const accepted=quest.verdictResponses.filter(v=>ids.includes(v.userId));
  const doubleConsent=accepted.length===2&&accepted.every(v=>v.decision==="accepted");
  const review=quest.reviewCase;
  if(review&&!(review.status==="resolved"&&
     ["uphold","override"].includes(review.resolution||"")&&
     review.resolvedWinnerId&&
     (review.resolution!=="override"||review.finalJudgmentId)))
    throw new SummonTicketSourceError("XP source has refunded or incomplete review");
  if(!doubleConsent&&!review)
    throw new SummonTicketSourceError("XP source lacks accepted final decision");
  const chosen=review?.finalJudgmentId
    ?quest.judgments.find(j=>j.id===review.finalJudgmentId)
    :quest.judgments[0];
  if(!chosen||!chosen.winnerId||!ids.includes(chosen.winnerId)||
     chosen.id!==event.sourceReceipt||
     (review&&chosen.winnerId!==review.resolvedWinnerId))
    throw new SummonTicketSourceError("XP source receipt no longer matches final judgment");
  const expected=chosen.winnerId===event.ownerId?100:80;
  if(expected!==event.amount)
    throw new SummonTicketSourceError("XP event amount conflicts with final result");
}

/**
 * Same-transaction source proof validation, shared by ticket minting and draws.
 * The caller MUST hold the appropriate user/career transaction lock first.
 */
export async function requireVerifiedCareerTicketPlan(
  tx:Prisma.TransactionClient,ownerId:string,professionId:ProfessionId
){
  validateCareer(ownerId,professionId);
  const events=await tx.professionXpEvent.findMany({
    where:{ownerId,professionId},
    select:{
      ownerId:true,professionId:true,awardType:true,eventKey:true,
      challengeId:true,sourceReceipt:true,ruleVersion:true,amount:true,
      challenge:{select:{
        creatorId:true,status:true,type:true,
        participants:{select:{userId:true,role:true,status:true}},
        evidence:{select:{userId:true}},
        judgments:{where:{status:"completed"},orderBy:{createdAt:"desc"},
          select:{id:true,winnerId:true}},
        verdictResponses:{select:{userId:true,decision:true}},
        reviewCase:{select:{status:true,resolution:true,
          resolvedWinnerId:true,finalJudgmentId:true}},
      }},
    },
    orderBy:{createdAt:"asc"},
    take:MAX_TICKET_SOURCE_EVENTS+1,
  });
  const plan=computeEligibleCareerTickets(ownerId,professionId,events);
  for(const event of events)assertCurrentQuestReceipt(event);
  return plan;
}

/** Transaction + advisory lock + PostgreSQL ON CONFLICT DO NOTHING.
 * Never exposed as a public user endpoint and never called by settlement.
 */
export async function reconcileFreeCareerTickets(input:{
  ownerId:string;professionId:ProfessionId;
}){
  if(!summonTicketsEnabled())
    throw new SummonTicketSourceError("Free ticket issuance is not enabled");
  validateCareer(input.ownerId,input.professionId);
  return prisma.$transaction(async tx=>{
    // Static parameterized SQL: shared lock for this user's specific skill.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.ownerId+":"+input.professionId}, 843217))`;
    const plan=await requireVerifiedCareerTicketPlan(tx,input.ownerId,input.professionId);
    if(plan.grants.length)
      await tx.summonTicket.createMany({data:plan.grants,skipDuplicates:true});
    const receipts=await tx.summonTicket.findMany({
      where:{ownerId:input.ownerId,professionId:input.professionId},
      select:{id:true,grantKey:true,status:true,sourceVersion:true,
        ownerId:true,professionId:true,spentByGrant:true},
      orderBy:[{createdAt:"asc"},{grantKey:"asc"}],
    });
    const expected=new Set(plan.grants.map(g=>g.grantKey));
    if(receipts.length!==expected.size||receipts.some(r=>
      !expected.has(r.grantKey)||r.ownerId!==input.ownerId||
      r.professionId!==input.professionId||
      r.sourceVersion!==TICKET_GRANT_RULE_VERSION||
      !["available","spent"].includes(r.status)||
      (r.status==="spent"&&!r.spentByGrant)||
      (r.status==="available"&&r.spentByGrant!==null)))
      throw new SummonTicketSourceError("Existing tickets require reconciliation before issuance");
    return {
      professionId:input.professionId,verifiedXp:plan.verifiedXp,
      earnedMilestones:plan.earnedMilestones,
      available:receipts.filter(r=>r.status==="available").length,
      spent:receipts.filter(r=>r.status==="spent").length,
      nextAtXp:plan.nextAtXp,grantIds:receipts.map(r=>r.id),
      coverage:plan.coverage,source:"audited-free-milestone-receipts" as const,
    };
  },{maxWait:20_000,timeout:30_000});
}


/**
 * Read-only, authenticated account projection. Never mints, repairs, spends,
 * or replays a ticket, even when an audited XP milestone is awaiting issuance.
 * Every displayed receipt is tied back to CURRENT final Quest evidence.
 */
export async function readFreeCareerTicketLedger(ownerId:string){
  if(!summonTicketsEnabled())return null;
  if(typeof ownerId!=="string"||!ownerId.trim()||ownerId.length>256)
    throw new SummonTicketSourceError("Invalid authenticated account");
  return prisma.$transaction(async tx=>{
    const events=await tx.professionXpEvent.findMany({
      where:{ownerId},
      select:{
        ownerId:true,professionId:true,awardType:true,eventKey:true,
        challengeId:true,sourceReceipt:true,ruleVersion:true,amount:true,
        challenge:{select:{
          creatorId:true,status:true,type:true,
          participants:{select:{userId:true,role:true,status:true}},
          evidence:{select:{userId:true}},
          judgments:{where:{status:"completed"},orderBy:{createdAt:"desc"},
            select:{id:true,winnerId:true}},
          verdictResponses:{select:{userId:true,decision:true}},
          reviewCase:{select:{status:true,resolution:true,
            resolvedWinnerId:true,finalJudgmentId:true}},
        }},
      },
      orderBy:{createdAt:"asc"},
      take:MAX_TICKET_SOURCE_EVENTS+1,
    });
    const receipts=await tx.summonTicket.findMany({
      where:{ownerId},
      select:{
        ownerId:true,professionId:true,grantKey:true,status:true,
        sourceVersion:true,spentByGrant:true,spentAt:true,
      },
      orderBy:{createdAt:"asc"},
      take:PROFESSIONS.length*MAX_TICKETS_PER_CAREER+1,
    });
    if(events.length>MAX_TICKET_SOURCE_EVENTS||
       receipts.length>PROFESSIONS.length*MAX_TICKETS_PER_CAREER)
      throw new SummonTicketSourceError("Ticket source coverage is incomplete");
    const names=[...new Set([...events.map(e=>e.professionId),
      ...receipts.map(r=>r.professionId)])].sort();
    if(names.length>PROFESSIONS.length)
      throw new SummonTicketSourceError("Unrecognized career ticket history");
    const byProfession=names.map(name=>{
      const professionId=name as ProfessionId;
      const source=events.filter(e=>e.professionId===name);
      const plan=computeEligibleCareerTickets(ownerId,professionId,source);
      for(const event of source)assertCurrentQuestReceipt(event);
      const actual=receipts.filter(r=>r.professionId===name);
      if(actual.length>plan.grants.length)
        throw new SummonTicketSourceError("More tickets exist than audited milestones");
      // Partial issuance may be pending. A minted higher ordinal without all
      // earlier ordinals is an inconsistent ledger, never an extra reward.
      const expected=new Set(plan.grants.slice(0,actual.length).map(g=>g.grantKey));
      if(actual.some(r=>r.ownerId!==ownerId||
         r.sourceVersion!==TICKET_GRANT_RULE_VERSION||
         !expected.has(r.grantKey)||
         !["available","spent"].includes(r.status)||
         (r.status==="spent"&&(!r.spentByGrant||!r.spentAt))||
         (r.status==="available"&&(r.spentByGrant!==null||r.spentAt!==null))))
        throw new SummonTicketSourceError("Free ticket receipt requires reconciliation");
      return {
        professionId,verifiedXp:plan.verifiedXp,
        eligibleMilestones:plan.earnedMilestones,
        issued:actual.length,
        available:actual.filter(r=>r.status==="available").length,
        spent:actual.filter(r=>r.status==="spent").length,
        awaitingIssuance:plan.earnedMilestones-actual.length,
      };
    });
    const available=byProfession.reduce((n,p)=>n+p.available,0);
    const spent=byProfession.reduce((n,p)=>n+p.spent,0);
    const awaitingIssuance=byProfession.reduce((n,p)=>n+p.awaitingIssuance,0);
    return assertFreeTicketSummary({
      source:"audited-free-profession-tickets-v1",
      coverage:"recorded-verification-events-only",
      available,spent,issued:available+spent,awaitingIssuance,byProfession,
    });
  },{isolationLevel:"RepeatableRead",maxWait:15_000,timeout:20_000});
}
