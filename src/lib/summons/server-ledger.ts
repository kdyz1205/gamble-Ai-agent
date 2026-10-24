/**
 * Feature-flagged additive server ledger. Financial credits and client-side
 * random previews are never sources of XP or owned items.
 * Default OFF; migrate the target database before explicitly enabling.
 */
import prisma from "@/lib/db";
import type {Prisma} from "@/generated/prisma/client";
import {STARTER,PROFESSIONS,type ProfessionId} from "./profession-system";

const STARTER_VERSION="pico-universal-v1";
export const XP_LEDGER_VERSION="verified-quest-skill-v1";

export function summonPersistenceEnabled(){
  return process.env.SUMMON_PERSISTENCE_ENABLED==="true";
}
export function starterGrantKey(userId:string){
  if(typeof userId!=="string"||!userId.trim()||userId.length>256)
    throw new RangeError("Invalid account ID");
  return "starter:"+STARTER_VERSION+":"+userId;
}

/** Concurrent requests/tabs converge on one physical Pico instance. */
export async function ensureUniversalPico(userId:string,tx?:Prisma.TransactionClient){
  if(!summonPersistenceEnabled())
    throw new Error("Summon inventory persistence is not enabled");
  const key=starterGrantKey(userId);
  const db=tx??prisma;
  // Empty-update Prisma upsert may race under concurrent requests and throw
  // P2002 even though grantKey is unique. The database must arbitrate the
  // insert; read back and validate immutable starter identity in every retry.
  await db.summonInstance.createMany({
    data:[{ownerId:userId,speciesId:STARTER.speciesId,originKind:"starter",
      grantKey:key,rarity:"starter",form:"base",status:"owned"}],
    skipDuplicates:true,
  });
  const item=await db.summonInstance.findUnique({where:{grantKey:key}});
  if(!item||item.ownerId!==userId||item.originKind!=="starter"||
     item.speciesId!==STARTER.speciesId||item.rarity!=="starter"||
     item.form!=="base"||item.status!=="owned")
    throw new Error("Starter record conflicts with universal Pico rule");
  return item;
}

/**
 * Only existing immutable receipts count here. Historical Quests were NOT
 * backfilled, so a missing row means UNKNOWN rather than zero career skill.
 * Even when receipts exist, these totals cover this rule version only, not
 * a user's complete career or any spendable ticket entitlement.
 */
async function recordedProfessionXp(userId:string){
  const scope={ownerId:userId,ruleVersion:XP_LEDGER_VERSION};
  const [invalid,groups]=await Promise.all([
    // A row that is not the current rule's fully auditable, positive Quest XP
    // must never be labeled verified. Corrections need a reviewed read model.
    prisma.professionXpEvent.findFirst({
      where:{...scope,OR:[
        {awardType:{not:"verified_quest"}},
        {challengeId:null},{sourceReceipt:null},
        {amount:{notIn:[80,100]}},
      ]},
      select:{id:true},
    }),
    prisma.professionXpEvent.groupBy({
      by:["professionId"],where:scope,
      _sum:{amount:true},_count:{_all:true},
    }),
  ]);
  if(invalid)throw new Error("Unauditable profession XP receipt");
  if(groups.length===0)return null;
  const allowed=new Set<string>(PROFESSIONS.map(prof=>prof.id));
  const byProfession=groups.map(group=>{
    const amount=group._sum.amount;
    const receipts=group._count._all;
    if(!allowed.has(group.professionId)||typeof amount!=="number"||
       !Number.isSafeInteger(amount)||amount<0||
       !Number.isSafeInteger(receipts)||receipts<1)
      throw new Error("Profession XP receipts are inconsistent");
    return {professionId:group.professionId,recordedXp:amount,receiptCount:receipts};
  }).sort((a,b)=>a.professionId.localeCompare(b.professionId));
  const totalRecordedXp=byProfession.reduce((sum,entry)=>sum+entry.recordedXp,0);
  const receiptCount=byProfession.reduce((sum,entry)=>sum+entry.receiptCount,0);
  if(!Number.isSafeInteger(totalRecordedXp)||!Number.isSafeInteger(receiptCount))
    throw new Error("Profession XP aggregate exceeds safe integer range");
  return {
    source:"verified-quest-receipts" as const,
    ruleVersion:XP_LEDGER_VERSION,
    coverage:"partial-since-ledger-activation" as const,
    completeHistory:false as const,
    totalRecordedXp,receiptCount,byProfession,
  };
}

export async function accountSummonLedger(userId:string){
  if(!summonPersistenceEnabled())return null;
  const key=starterGrantKey(userId);
  const [starter,items,xp]=await Promise.all([
    prisma.summonInstance.findUnique({where:{grantKey:key},
      select:{id:true,ownerId:true,speciesId:true,rarity:true,form:true,status:true}}),
    prisma.summonInstance.findMany({
      where:{ownerId:userId,status:"owned",originKind:{not:"starter"}},
      select:{id:true,speciesId:true,rarity:true,form:true,professionId:true,
        occupationId:true,createdAt:true},
      orderBy:{createdAt:"desc"},take:50,
    }),
    recordedProfessionXp(userId),
  ]);
  if(starter&&(starter.ownerId!==userId||starter.speciesId!=="pico"||
               starter.status!=="owned"))
    throw new Error("Starter inventory record is inconsistent");
  return {
    enabled:true,
    starter:starter?{id:starter.id,speciesId:starter.speciesId,
      rarity:starter.rarity,form:starter.form}:null,
    items,
    xp, // null when no authoritative event receipts exist (UNKNOWN, not zero)
    tickets:null,
    note:"Recorded XP covers this rule version only; historical Quests and free tickets have not been backfilled.",
  };
}

const professionByQuestType:Record<string,ProfessionId>={
  Coding:"software",Fitness:"athletics",Cooking:"culinary",
};
export class ProgressSourceNotFinalError extends Error {
  constructor(public readonly reason:string){
    super(reason);this.name="ProgressSourceNotFinalError";
  }
}

/**
 * Internal-only guarded award reconciliation. NOT exposed as a user endpoint,
 * and NOT called from settlement until anti-farm/category-review is approved.
 */
export async function reconcileVerifiedQuestProfessionXp(input:{
  challengeId:string;userId:string;
}) {
  if(!summonPersistenceEnabled())throw new Error("Summon XP ledger disabled");
  if(typeof input.challengeId!=="string"||!input.challengeId.trim()||
     typeof input.userId!=="string"||!input.userId.trim())
    throw new RangeError("Invalid participant or Quest");
  return prisma.$transaction(async tx=>{
    const quest=await tx.challenge.findUnique({
      where:{id:input.challengeId},
      include:{
        participants:{select:{userId:true,role:true,status:true}},
        evidence:{select:{userId:true,id:true}},
        judgments:{where:{status:"completed"},orderBy:{createdAt:"desc"},
          select:{id:true,winnerId:true,status:true}},
        verdictResponses:{select:{userId:true,decision:true}},
        reviewCase:{select:{status:true,finalJudgmentId:true,
          resolvedWinnerId:true,resolution:true}},
      },
    });
    if(!quest||quest.status!=="settled")
      throw new ProgressSourceNotFinalError("Quest is not settled");
    const professionId=professionByQuestType[quest.type];
    if(!professionId||!PROFESSIONS.some(p=>p.id===professionId))
      throw new ProgressSourceNotFinalError("No supported fixed career category");
    const players=quest.participants.filter(p=>
      (p.role==="creator"||p.role==="opponent")&&
      (p.status==="accepted"||p.status==="completed"));
    const ids=players.map(p=>p.userId);
    if(ids.length!==2||new Set(ids).size!==2||
       players.filter(p=>p.role==="creator"&&p.userId===quest.creatorId).length!==1||
       players.filter(p=>p.role==="opponent").length!==1||
       !ids.includes(input.userId))
      throw new ProgressSourceNotFinalError("Two authentic accepted competitors required");
    const evidenceIds=new Set(quest.evidence.map(e=>e.userId));
    if(!ids.every(id=>evidenceIds.has(id)))
      throw new ProgressSourceNotFinalError("Proof from both competitors is required");
    if(quest.reviewCase){
      if(quest.reviewCase.status!=="resolved")
        throw new ProgressSourceNotFinalError("Review remains unresolved");
      if(!["uphold","override"].includes(quest.reviewCase.resolution||"")||
         !quest.reviewCase.resolvedWinnerId||
         (quest.reviewCase.resolution==="override"&&!quest.reviewCase.finalJudgmentId))
        throw new ProgressSourceNotFinalError("Refunded or incomplete review cannot award XP");
    }
    const consent=quest.verdictResponses.filter(r=>ids.includes(r.userId));
    const accepted=consent.length===2&&consent.every(r=>r.decision==="accepted");
    const resolved=quest.reviewCase?.status==="resolved"&&
      ["uphold","override"].includes(quest.reviewCase.resolution||"");
    if(!accepted&&!resolved)
      throw new ProgressSourceNotFinalError("Final consent or resolved review missing");
    const receipt=quest.reviewCase?.finalJudgmentId
      ?quest.judgments.find(j=>j.id===quest.reviewCase!.finalJudgmentId)
      :quest.judgments[0];
    if(!receipt||!receipt.winnerId||!ids.includes(receipt.winnerId)||
       (resolved&&quest.reviewCase?.resolvedWinnerId&&
        quest.reviewCase.resolvedWinnerId!==receipt.winnerId))
      throw new ProgressSourceNotFinalError("Trusted final winner receipt required");
    const outcome=receipt.winnerId===input.userId?"win":"loss";
    const amount=outcome==="win"?100:80;
    const eventKey="quest-xp:"+XP_LEDGER_VERSION+":"+quest.id+":"+
      input.userId+":"+professionId;
    // Prisma upsert with an empty update may use a read-then-insert path,
    // which races under simultaneous reconciliation and raises P2002. PostgreSQL
    // INSERT ON CONFLICT DO NOTHING (Prisma createMany/skipDuplicates) is atomic.
    // Preserve the first immutable receipt and reject divergent replays below.
    await tx.professionXpEvent.createMany({
      data:[{ownerId:input.userId,challengeId:quest.id,eventKey,
        professionId,awardType:"verified_quest",amount,
        ruleVersion:XP_LEDGER_VERSION,sourceReceipt:receipt.id}],
      skipDuplicates:true,
    });
    const event=await tx.professionXpEvent.findUnique({where:{eventKey}});
    if(!event||event.ownerId!==input.userId||event.professionId!==professionId||
       event.amount!==amount||event.sourceReceipt!==receipt.id)
      throw new ProgressSourceNotFinalError("Prior award conflicts; reconcile manually");
    return {eventId:event.id,professionId,amount,outcome,
      sourceReceipt:event.sourceReceipt,source:"authoritative-settled-quest-ledger" as const};
  });
}
