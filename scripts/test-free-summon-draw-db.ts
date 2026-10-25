/**
 * REAL PostgreSQL atomic draw acceptance: isolated localhost
 * summoner_verification ONLY. Never connect to production or spend money.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import prisma from "../src/lib/db";
import {reconcileVerifiedQuestProfessionXp,accountSummonLedger}
  from "../src/lib/summons/server-ledger";
import {reconcileFreeCareerTickets,readFreeCareerTicketLedger}
  from "../src/lib/summons/free-ticket-ledger";
import {redeemFreeSummonTicket,SummonDrawError}
  from "../src/lib/summons/free-draw-ledger";

const uri=process.env.DATABASE_URL;
if(!uri)throw Error("Explicit isolated test DATABASE_URL required");
const url=new URL(uri);
if(!["localhost","127.0.0.1"].includes(url.hostname)||
   url.pathname!=="/summoner_verification")
  throw Error("Free draw integration requires localhost summoner_verification ONLY");
const flags=["SUMMON_PERSISTENCE_ENABLED","SUMMON_TICKETS_ENABLED",
  "SUMMON_DRAWS_ENABLED"] as const;
const earlier=flags.map(k=>process.env[k]);
for(const k of flags)process.env[k]="true";

let checks=0;
const eq=(a:unknown,b:unknown,m:string)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(v:unknown,m:string)=>{assert.ok(v,m);checks++;};
const refuses=async(fn:()=>Promise<unknown>,m:string)=>{
  await assert.rejects(fn,(err:unknown)=>err instanceof Error,m);checks++;
};
const id=randomUUID().replaceAll("-","").slice(0,16);
const users:string[]=[];const quests:string[]=[];
let creator:{id:string;username:string}|null=null;
let opponent:{id:string;username:string}|null=null;
async function user(kind:string){
  const result=await prisma.user.create({data:{
    username:"freesummon_"+kind+"_"+id,
    email:"freesummon_"+kind+"_"+id+"@example.invalid",
    credits:47,
  }});
  users.push(result.id);
  return result;
}
async function quest(label:string,type="Coding"){
  if(!creator||!opponent)throw Error("Test fixture accounts missing");
  const row=await prisma.$transaction(async tx=>{
    const challenge=await tx.challenge.create({data:{
      title:"Free summon source "+label+" "+id,
      creatorId:creator!.id,type,status:"settled",stake:0,
      stakeToken:"credits",
    }});
    await tx.participant.createMany({data:[
      {challengeId:challenge.id,userId:creator!.id,role:"creator",status:"accepted"},
      {challengeId:challenge.id,userId:opponent!.id,role:"opponent",status:"accepted"},
    ]});
    await tx.evidence.createMany({data:[
      {challengeId:challenge.id,userId:creator!.id,
        type:"text",description:"Accepted primary proof"},
      {challengeId:challenge.id,userId:opponent!.id,
        type:"text",description:"Accepted opponent proof"},
    ]});
    await tx.judgment.create({data:{
      challengeId:challenge.id,status:"completed",
      winnerId:creator!.id,method:"manual",
    }});
    await tx.verdictResponse.createMany({data:[
      {challengeId:challenge.id,userId:creator!.id,decision:"accepted"},
      {challengeId:challenge.id,userId:opponent!.id,decision:"accepted"},
    ]});
    return challenge;
  });
  quests.push(row.id);
  const gain=await reconcileVerifiedQuestProfessionXp({
    challengeId:row.id,userId:creator.id,
  });
  eq(gain.amount,100,"Only actually verified winning Quest grants source XP");
  return row;
}
const requestKey=()=>randomUUID();
async function main(){
  creator=await user("a");opponent=await user("b");
  const owner=creator.id;
  const [first,second,third]=await Promise.all([
    quest("coding-1"),quest("coding-2"),quest("coding-3"),
  ]);
  await quest("athletics-1","Fitness");
  const firstIssue=await reconcileFreeCareerTickets({
    ownerId:owner,professionId:"software",
  });
  const athletics=await reconcileFreeCareerTickets({
    ownerId:owner,professionId:"athletics",
  });
  eq(firstIssue.earnedMilestones,2,"300 verified software XP yields two tickets");
  eq(athletics.earnedMilestones,1,"100 athletics XP earns one independent ticket");
  eq((await readFreeCareerTicketLedger(owner))?.available,3,
    "Three authentic available tickets before any draw");
  const before=await prisma.user.findUniqueOrThrow({
    where:{id:owner},select:{credits:true,totalCreditsWon:true,
      totalCreditsLost:true,totalCreditsBought:true},
  });
  const draw={ownerId:owner,professionId:"software" as const,
    occupationId:"coding",requestKey:requestKey()};
  process.env.SUMMON_DRAWS_ENABLED="false";
  await refuses(()=>redeemFreeSummonTicket(draw),
    "Draw flag OFF refuses even valid ticket and user");
  eq(await prisma.summonDrawReceipt.count({where:{ownerId:owner}}),0,
    "No receipt created while draw flag disabled");
  process.env.SUMMON_DRAWS_ENABLED="true";
  await refuses(()=>redeemFreeSummonTicket({...draw,requestKey:"short"}),
    "Unstable request keys must not consume a ticket");
  await refuses(()=>redeemFreeSummonTicket({...draw,
    occupationId:"nonexistent"}),"Invalid specialization cannot draw");
  const six=await Promise.all(Array.from({length:6},
    ()=>redeemFreeSummonTicket(draw)));
  eq(new Set(six.map(x=>x.receiptId)).size,1,
    "Six concurrent same-key requests resolve to one receipt");
  eq(six.filter(x=>!x.reused).length,1,
    "Exactly one worker draws an actual item");
  eq(new Set(six.map(x=>x.instanceId)).size,1,
    "One owned inventory instance after concurrent draw");
  eq(six[0].creditsTransferred,0,"Free draw cannot transfer purchased credits");
  eq(await prisma.summonDrawReceipt.count({where:{ownerId:owner}}),1,
    "One committed draw ledger row");
  eq(await prisma.summonInstance.count({where:{
    ownerId:owner,originKind:"free_ticket",
  }}),1,"Exactly one non-Pico awarded Summon item");
  eq((await readFreeCareerTicketLedger(owner))?.available,2,
    "First award spends exactly one ticket");
  const replay=await redeemFreeSummonTicket(draw);
  eq(replay.receiptId,six[0].receiptId,"Retry returns original proof id");
  eq(replay.reused,true,"Retry explicitly reported as idempotent");
  await refuses(()=>redeemFreeSummonTicket({...draw,occupationId:"robotics"}),
    "Reusing a request key cannot silently substitute species");
  await refuses(()=>redeemFreeSummonTicket({...draw,
    professionId:"athletics",occupationId:"badminton"}),
    "Reusing a request key cannot redirect the career pool");
  const stranger=await user("outsider");
  await refuses(()=>redeemFreeSummonTicket({
    ownerId:stranger.id,professionId:"software",occupationId:"coding",
    requestKey:requestKey(),
  }),"Foreign account cannot spend another player's earned ticket");

  await prisma.challenge.update({where:{id:second.id},data:{status:"disputed"}});
  await refuses(()=>redeemFreeSummonTicket({...draw,requestKey:requestKey()}),
    "Source dispute blocks new irreversible random draws");
  eq(await prisma.summonDrawReceipt.count({where:{ownerId:owner}}),1,
    "Disputed source never spends another ticket");
  await prisma.challenge.update({where:{id:second.id},data:{status:"settled"}});

  const next=await redeemFreeSummonTicket({...draw,requestKey:requestKey(),
    occupationId:"robotics"});
  eq(next.ordinal,2,"Draw order advances once after first verified receipt");
  eq(next.rarity.length>0,true,"Server provides actual rarity");
  const previous=await prisma.summonDrawReceipt.findFirstOrThrow({
    where:{id:six[0].receiptId},
  });
  const latest=await prisma.summonDrawReceipt.findFirstOrThrow({
    where:{id:next.receiptId},
  });
  eq([latest.rareMissesBefore,latest.epicMissesBefore],
    [previous.rareMissesAfter,previous.epicMissesAfter],
    "Pity continuation persists from the first draw");
  await refuses(()=>redeemFreeSummonTicket({...draw,requestKey:requestKey()}),
    "Exhausted profession cannot generate a third free ticket");
  const independentKeys=await Promise.allSettled([
    redeemFreeSummonTicket({
      ownerId:owner,professionId:"athletics",occupationId:"badminton",
      requestKey:requestKey(),
    }),
    redeemFreeSummonTicket({
      ownerId:owner,professionId:"athletics",occupationId:"badminton",
      requestKey:requestKey(),
    }),
  ]);
  const fulfilled=independentKeys.flatMap(p=>p.status==="fulfilled"?[p.value]:[]);
  const rejected=independentKeys.filter(p=>p.status==="rejected");
  eq([fulfilled.length,rejected.length],[1,1],
    "Distinct concurrent keys compete for one ticket; only one succeeds");
  ok(rejected[0]?.status==="rejected"&&
     rejected[0].reason instanceof SummonDrawError&&
     rejected[0].reason.statusCode===409,
    "Loser receives explicit no-more-free-tickets rejection");
  const athleticDraw=fulfilled[0];
  eq(athleticDraw.ordinal,3,
    "Changing careers never restarts account-global draw order");
  const thirdDraw=await prisma.summonDrawReceipt.findFirstOrThrow({
    where:{id:athleticDraw.receiptId},
  });
  eq([thirdDraw.rareMissesBefore,thirdDraw.epicMissesBefore],
    [latest.rareMissesAfter,latest.epicMissesAfter],
    "Cross-profession Rare/Epic pity never resets");
  const actualInventory=await accountSummonLedger(owner);
  eq(actualInventory?.items.length,3,
    "Three real owned database Summons, not cosmetic previews");
  eq((await readFreeCareerTicketLedger(owner))?.spent,3,
    "Read model sees all three actual spent tickets");
  eq((await readFreeCareerTicketLedger(owner))?.available,0,
    "No available balance after three atomic uses");
  eq(await prisma.auditLog.count({where:{
    actorUserId:owner,action:"summon.free-draw.committed",
  }}),3,"Exactly one append-only audit event per committed draw");
  eq(await prisma.creditTx.count({where:{userId:{in:users}}}),0,
    "Neither rewards nor retries write financial CreditTx");
  eq(await prisma.user.findUniqueOrThrow({where:{id:owner},
    select:{credits:true,totalCreditsWon:true,
      totalCreditsLost:true,totalCreditsBought:true}}),
  before,"Credits and lifetime financial counters remain byte-for-byte unchanged");

  await prisma.summonDrawReceipt.update({
    where:{id:previous.id},data:{rarity:"tampered-invalid-rarity"},
  });
  await refuses(()=>redeemFreeSummonTicket(draw),
    "Tampered immutable draw history fails receipt replay");
  await prisma.summonDrawReceipt.update({
    where:{id:previous.id},data:{rarity:previous.rarity},
  });
  eq((await redeemFreeSummonTicket(draw)).receiptId,previous.id,
    "Repaired test fixture verifies the original immutable draw history");
  eq(await prisma.summonDrawReceipt.count({where:{ownerId:owner}}),3,
    "Corruption/recovery never creates a fourth draw");
  ok(first.id!==third.id,"Source challenges remain distinct identities");
  console.log("FREE_SUMMON_DRAW_DATABASE_PASS",checks,"checks");
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  for(const [i,k] of flags.entries()){
    if(earlier[i]===undefined)delete process.env[k];
    else process.env[k]=earlier[i];
  }
  try{
    // Remove dependents first, then exact fixture identities.
    await prisma.summonDrawReceipt.deleteMany({where:{ownerId:{in:users}}});
    await prisma.summonTicket.deleteMany({where:{ownerId:{in:users}}});
    await prisma.summonInstance.deleteMany({where:{ownerId:{in:users}}});
    await prisma.professionXpEvent.deleteMany({where:{ownerId:{in:users}}});
    await prisma.auditLog.deleteMany({where:{OR:[
      {actorUserId:{in:users}},
      {challengeId:{in:quests}},
    ]}});
    if(quests.length)
      await prisma.challenge.deleteMany({where:{id:{in:quests}}});
    await prisma.creditTx.deleteMany({where:{userId:{in:users}}});
    await prisma.activityEvent.deleteMany({where:{userId:{in:users}}});
    await prisma.user.deleteMany({where:{id:{in:users}}});
  }finally{await prisma.$disconnect();}
});
