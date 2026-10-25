/**
 * Genuine PostgreSQL integration test: local isolated summoner_verification.
 * Exercises authenticated XP, atomic paid-zero evolution, receipts and reversal.
 * This file NEVER connects to production or transfers bought credits.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import prisma from "../src/lib/db";
import {reconcileVerifiedQuestProfessionXp} from "../src/lib/summons/server-ledger";
import {reconcileFreeCareerTickets} from "../src/lib/summons/free-ticket-ledger";
import {
  redeemFreeSummonTicket,readOwnedFreeDrawInventory,
} from "../src/lib/summons/free-draw-ledger";
import {evolveOwnedFamiliar,SummonEvolutionError}
  from "../src/lib/summons/evolution-ledger";

const raw=process.env.DATABASE_URL;
if(!raw)throw Error("Explicit local verification database URL required");
const url=new URL(raw);
if(!["localhost","127.0.0.1"].includes(url.hostname)||
   url.pathname!=="/summoner_verification")
  throw Error("Evolution test is allowed ONLY in localhost summoner_verification");

const flags=["SUMMON_PERSISTENCE_ENABLED","SUMMON_TICKETS_ENABLED",
  "SUMMON_DRAWS_ENABLED","SUMMON_EVOLUTION_ENABLED"] as const;
const saved=flags.map(k=>process.env[k]);
flags.forEach(k=>process.env[k]="true");
const suffix=randomUUID().replaceAll("-","").slice(0,16);
const users:string[]=[],challenges:string[]=[];
let checks=0;
const eq=(a:unknown,b:unknown,m:string)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(v:unknown,m:string)=>{assert.ok(v,m);checks++;};
const denied=async(fn:()=>Promise<unknown>,m:string)=>{
  await assert.rejects(fn,(err:unknown)=>err instanceof Error,m);checks++;
};
const key=()=>randomUUID();
async function user(name:string){
  const row=await prisma.user.create({data:{
    username:"evo_"+name+"_"+suffix,
    email:"evo_"+name+"_"+suffix+"@example.invalid",credits:47,
  }});
  users.push(row.id);return row;
}
async function quest(owner:string,friend:string,ordinal:number,type="Coding"){
  const row=await prisma.$transaction(async tx=>{
    const challenge=await tx.challenge.create({data:{
      title:"Isolated evolution proof "+ordinal+" "+suffix,
      creatorId:owner,type,status:"settled",stake:0,stakeToken:"credits",
    }});
    await tx.participant.createMany({data:[
      {challengeId:challenge.id,userId:owner,role:"creator",status:"accepted"},
      {challengeId:challenge.id,userId:friend,role:"opponent",status:"accepted"},
    ]});
    await tx.evidence.createMany({data:[
      {challengeId:challenge.id,userId:owner,type:"text",
        description:"Accepted real-fixture source proof"},
      {challengeId:challenge.id,userId:friend,type:"text",
        description:"Accepted real-fixture opposing proof"},
    ]});
    await tx.judgment.create({data:{
      challengeId:challenge.id,winnerId:owner,
      method:"manual",status:"completed",
    }});
    await tx.verdictResponse.createMany({data:[
      {challengeId:challenge.id,userId:owner,decision:"accepted"},
      {challengeId:challenge.id,userId:friend,decision:"accepted"},
    ]});
    return challenge;
  });
  challenges.push(row.id);
  const xp=await reconcileVerifiedQuestProfessionXp({
    challengeId:row.id,userId:owner,
  });
  eq(xp.amount,100,"Eligible finally-accepted proof grants exactly 100 XP");
  return row;
}
async function main(){
  const [a,b,stranger]=await Promise.all([user("a"),user("b"),user("c")]);
  const owner=a.id,friend=b.id;
  const before=await prisma.user.findUniqueOrThrow({where:{id:owner},
    select:{credits:true,totalCreditsWon:true,totalCreditsLost:true,totalCreditsBought:true},
  });
  const original=await quest(owner,friend,1);
  await quest(owner,friend,2, "Fitness");
  await reconcileFreeCareerTickets({ownerId:owner,professionId:"software"});
  await reconcileFreeCareerTickets({ownerId:owner,professionId:"athletics"});
  const drawn=await redeemFreeSummonTicket({
    ownerId:owner,professionId:"software",occupationId:"robotics",requestKey:key(),
  });
  const athletic=await redeemFreeSummonTicket({
    ownerId:owner,professionId:"athletics",occupationId:"badminton",requestKey:key(),
  });
  const get=async(id:string)=>prisma.summonInstance.findUniqueOrThrow({where:{id}});
  const first=await get(drawn.instanceId);
  eq(first.form,"base","Drawn item begins as actual base stage");
  await prisma.summonInstance.update({
    where:{id:athletic.instanceId},data:{form:"evolved"},
  });
  await denied(()=>readOwnedFreeDrawInventory(owner),
    "A forged evolved item without an XP evolution receipt cannot be shown");
  await prisma.summonInstance.update({
    where:{id:athletic.instanceId},data:{form:"base"},
  });
  eq((await readOwnedFreeDrawInventory(owner))?.items.length,2,
    "Repairing the isolated fixture restores two genuine base items");
  const request={ownerId:owner,instanceId:first.id,toForm:"evolved" as const,
    requestKey:key()};
  process.env.SUMMON_EVOLUTION_ENABLED="false";
  await denied(()=>evolveOwnedFamiliar(request),"Four-state feature gate defaults OFF");
  process.env.SUMMON_EVOLUTION_ENABLED="true";
  await denied(()=>evolveOwnedFamiliar(request),
    "100 current XP must not trigger 350-XP evolution");
  await denied(()=>evolveOwnedFamiliar({...request,toForm:"ascended"}),
    "Ascended cannot skip evolved stage");
  await denied(()=>evolveOwnedFamiliar({...request,instanceId:athletic.instanceId}),
    "The owner cannot remap their retry key onto another item's career");
  await denied(()=>evolveOwnedFamiliar({...request,requestKey:"short"}),
    "Evolution requires a stable request key");
  await denied(()=>evolveOwnedFamiliar({...request,
    ownerId:stranger.id,requestKey:key()}),
    "Account without ownership cannot change a foreign item");

  for(let i=2;i<=4;i++)await quest(owner,friend,i+1);
  eq((await prisma.professionXpEvent.aggregate({where:{
    ownerId:owner,professionId:"software"},_sum:{amount:true}}))._sum.amount,
    400,"Four verified wins cross first evolution threshold");
  const concurrent=await Promise.all(Array.from({length:6},
    ()=>evolveOwnedFamiliar(request)));
  eq(new Set(concurrent.map(r=>r.receiptId)).size,1,
    "Six same-key requests produce one immutable evolution receipt");
  eq(concurrent.filter(r=>!r.reused).length,1,
    "Only one worker performs actual base-to-evolved mutation");
  eq((await get(first.id)).form,"evolved",
    "One real owned item has now changed from base to evolved");
  eq(await prisma.summonEvolutionReceipt.count({where:{ownerId:owner}}),1,
    "Exactly one evolution receipt has been issued");
  eq((await readOwnedFreeDrawInventory(owner))?.items.find(i=>i.id===first.id)?.form,
    "evolved","Authenticated iOS inventory exposes actual evolved form");
  const same=await evolveOwnedFamiliar(request);
  eq([same.reused,same.receiptId],[true,concurrent[0].receiptId],
    "Identical idempotent retry preserves the original receipt");
  await denied(()=>evolveOwnedFamiliar({...request,toForm:"ascended"}),
    "Reusing a request key with another destination is rejected");
  await denied(()=>evolveOwnedFamiliar({...request,
    instanceId:athletic.instanceId}),
    "Reusing the same request key cannot target a different owned item");
  await denied(()=>evolveOwnedFamiliar({...request,requestKey:key()}),
    "Different request key cannot evolve an already evolved stage twice");
  await denied(()=>evolveOwnedFamiliar({...request,toForm:"ascended",
    requestKey:key()}),"400 XP cannot buy 1600-XP ascension");
  await denied(()=>evolveOwnedFamiliar({
    ownerId:owner,instanceId:athletic.instanceId,
    toForm:"evolved",requestKey:key(),
  }),"Only the target profession's XP may unlock its own Familiar");

  for(let i=5;i<=16;i++)await quest(owner,friend,i);
  const ascend={ownerId:owner,instanceId:first.id,toForm:"ascended" as const,
    requestKey:key()};
  const two=await Promise.allSettled([
    evolveOwnedFamiliar(ascend),
    evolveOwnedFamiliar({...ascend,requestKey:key()}),
  ]);
  const successes=two.flatMap(x=>x.status==="fulfilled"?[x.value]:[]);
  const failures=two.filter(x=>x.status==="rejected");
  eq([successes.length,failures.length],[1,1],
    "Two distinct concurrent requests cannot ascend the same item twice");
  ok(failures[0]?.status==="rejected"&&
     failures[0].reason instanceof SummonEvolutionError&&
     failures[0].reason.statusCode===409,
     "Losing race returns a specific stage-already-changed error");
  eq((await get(first.id)).form,"ascended",
    "Authentic item completes second stage only after 1600 verified XP");
  eq(await prisma.summonEvolutionReceipt.count({where:{ownerId:owner}}),2,
    "Exactly base-to-evolved and evolved-to-ascended receipts");
  eq((await readOwnedFreeDrawInventory(owner))?.items.find(i=>i.id===first.id)?.form,
    "ascended","Authenticated inventory reports actual ascended form");
  eq((await get(first.id)).rarity,first.rarity,
    "Evolution never changes rolled rarity");
  eq((await get(first.id)).speciesId,first.speciesId,
    "Species identity is immutable across cosmetic forms");
  eq(await prisma.summonDrawReceipt.count({where:{ownerId:owner}}),2,
    "Evolution never adds new draw receipts");
  eq(await prisma.summonTicket.count({where:{ownerId:owner}}),2,
    "Evolution never mints or spends additional tickets");

  const receipt=await prisma.summonEvolutionReceipt.findFirstOrThrow({
    where:{ownerId:owner,toForm:"evolved"},
  });
  await prisma.summonEvolutionReceipt.update({where:{id:receipt.id},
    data:{ruleVersion:"forged-evolution-revision"}});
  await denied(()=>readOwnedFreeDrawInventory(owner),
    "Forged evolution rule makes the entire owned collection unavailable");
  await denied(()=>evolveOwnedFamiliar(request),
    "Tampered previous receipt blocks even idempotent retries");
  await prisma.summonEvolutionReceipt.update({where:{id:receipt.id},
    data:{ruleVersion:receipt.ruleVersion}});
  eq((await readOwnedFreeDrawInventory(owner))?.items.length,2,
    "Restoring the isolated fixture restores the complete collection");

  await prisma.challenge.update({where:{id:original.id},
    data:{status:"disputed"}});
  await denied(()=>readOwnedFreeDrawInventory(owner),
    "Disputing source proof immediately blocks owned form attestation");
  await prisma.challenge.update({where:{id:original.id},
    data:{status:"settled"}});
  eq((await evolveOwnedFamiliar(request)).reused,true,
    "Original evolution can be re-read after fixture dispute reversal");
  eq(await prisma.auditLog.count({where:{actorUserId:owner,
    action:"summon.evolution.committed"}}),2,
    "One audit event per valid evolution, never duplicated");
  eq(await prisma.creditTx.count({where:{userId:{in:users}}}),0,
    "No paid or purchased credits transferred by any progression");
  eq(await prisma.user.findUniqueOrThrow({where:{id:owner},
    select:{credits:true,totalCreditsWon:true,totalCreditsLost:true,
      totalCreditsBought:true}}),before,
    "Financial account totals remain identical to pre-evolution state");
  console.log("SUMMON_EVOLUTION_DATABASE_PASS",checks,"checks");
}
main().catch(err=>{console.error(err);process.exitCode=1;}).finally(async()=>{
  for(const [i,k] of flags.entries()){
    if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];
  }
  try{
    await prisma.summonEvolutionReceipt.deleteMany({where:{ownerId:{in:users}}});
    await prisma.summonDrawReceipt.deleteMany({where:{ownerId:{in:users}}});
    await prisma.summonTicket.deleteMany({where:{ownerId:{in:users}}});
    await prisma.summonInstance.deleteMany({where:{ownerId:{in:users}}});
    await prisma.professionXpEvent.deleteMany({where:{ownerId:{in:users}}});
    await prisma.auditLog.deleteMany({where:{OR:[
      {actorUserId:{in:users}},{challengeId:{in:challenges}},
    ]}});
    await prisma.challenge.deleteMany({where:{id:{in:challenges}}});
    await prisma.creditTx.deleteMany({where:{userId:{in:users}}});
    await prisma.activityEvent.deleteMany({where:{userId:{in:users}}});
    await prisma.user.deleteMany({where:{id:{in:users}}});
  }finally{await prisma.$disconnect();}
});
