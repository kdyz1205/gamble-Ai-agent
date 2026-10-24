import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import prisma from "../src/lib/db";
import {provisionSignupUser} from "../src/lib/auth-provisioning";
import {COSTS} from "../src/lib/credits";
import {ensureUniversalPico,accountSummonLedger,starterGrantKey,
  reconcileVerifiedQuestProfessionXp}
  from "../src/lib/summons/server-ledger";

// Integration test intentionally requires a *local* isolated PostgreSQL.
// It will never write to live Vercel/Neon/production and cleans up all fixtures.
async function main(){
  const database=process.env.DATABASE_URL;
  if(!database)throw Error("DATABASE_URL required");
  const target=new URL(database);
  // Require the dedicated verification database, not merely a local host:
  // a developer may otherwise run fixtures against a normal local app DB.
  if(!["localhost","127.0.0.1"].includes(target.hostname)||
     target.pathname!=="/summoner_verification")
    throw Error("SUMMON_LEDGER_TESTS require isolated local summoner_verification PostgreSQL");
  process.env.SUMMON_PERSISTENCE_ENABLED="true";
  const id=randomUUID().replaceAll("-","");
  const users:string[]=[];
  const createUser=async(label:string)=>{
    const row=await prisma.user.create({data:{
      username:"summon_"+label+"_"+id,email:"summon_"+label+"_"+id+"@example.invalid",
      credits:19,
    }});
    users.push(row.id);return row;
  };
  let checks=0;
  const eq=(a:unknown,b:unknown,message:string)=>{assert.deepEqual(a,b,message);checks++};
  const ok=(n:boolean,message:string)=>{assert.ok(n,message);checks++};
  const rej=async(f:()=>Promise<unknown>,_message:string)=>{
    await assert.rejects(f);checks++;
  };
  try{
    const user=await createUser("alpha");
    const friend=await createUser("beta");
    const outsider=await createUser("gamma");
    const key=starterGrantKey(user.id);
    eq(typeof key,"string","Grant key is stable");
    await Promise.all(Array.from({length:16},()=>ensureUniversalPico(user.id)));
    const instances=await prisma.summonInstance.findMany({
      where:{ownerId:user.id,originKind:"starter"},
    });
    eq(instances.length,1,"16 parallel claims grant exactly one physical Pico");
    eq(instances[0].speciesId,"pico","Owned starter is Pico");
    eq(instances[0].grantKey,key,"Idempotency key is deterministic");
    eq(instances[0].rarity,"starter","Starter is not a rarity roll");
    eq(instances[0].status,"owned","Starter remains owned");
    const friendPico=await ensureUniversalPico(friend.id);
    ok(friendPico.id!==instances[0].id,"Different account has distinct instance");
    const replay=await ensureUniversalPico(user.id);
    eq(replay.id,instances[0].id,"Repeat claim returns same object");
    eq(await prisma.summonInstance.count({where:{originKind:"starter",ownerId:user.id}}),1,
      "No duplicated starter after retry");
    const ledger=await accountSummonLedger(user.id);
    eq(ledger?.starter?.id,instances[0].id,"Read-after-write for authenticated owner");
    eq(ledger?.items.length,0,"No fabricated extra Summons");
    eq(ledger?.xp,null,"Unbackfilled XP remains unknown");
    eq(ledger?.tickets,null,"Unimplemented tickets remain unknown");
    eq((await accountSummonLedger(outsider.id))?.starter,null,
      "Other account cannot see somebody else's Pico");
    eq((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).credits,19,
      "Pico grants do not change credit balance");
    eq(await prisma.creditTx.count({where:{userId:user.id}}),0,
      "No hidden credit or stake transaction");
    await rej(()=>ensureUniversalPico("nonexistent-"+id),
      "Foreign key rejects nonexistent account");

    const signup=await provisionSignupUser({source:"credentials",
      email:"summon-signup-"+id+"@example.invalid",
      username:"summon_new_"+id,
      passwordHash:"verification-placeholder-hash",
    });
    users.push(signup.id);
    const welcomeItem=await prisma.summonInstance.findMany({
      where:{ownerId:signup.id,originKind:"starter"},
    });
    eq(welcomeItem.length,1,
      "New user and starter commit inside the existing signup transaction");
    eq(welcomeItem[0].grantKey,starterGrantKey(signup.id),
      "Signup starter uses universal stable grant key");
    eq(signup.credits,COSTS.SIGNUP_BONUS,"Welcome credits are unchanged");
    eq(await prisma.creditTx.count({where:{userId:signup.id,type:"bonus"}}),1,
      "Signup still creates exactly one unrelated welcome credit receipt");
    eq((await ensureUniversalPico(signup.id)).id,welcomeItem[0].id,
      "Replaying after signup creates no duplicate starter");

    // Settled, consented, accepted proof from both participants is the only
    // baseline for the internal audited XP reconciliation in this version.
    const createQuest=async(label:string, options?:{
      status?:string;type?:string;proofOpponent?:boolean;consent?:boolean;
    })=>prisma.$transaction(async tx=>{
      const quest=await tx.challenge.create({data:{
        title:"Skill Quest "+label+" "+id,
        type:options?.type??"Coding",status:options?.status??"settled",
        creatorId:user.id,stake:0,stakeToken:"credits",
      }});
      await tx.participant.createMany({data:[
        {challengeId:quest.id,userId:user.id,role:"creator",status:"accepted"},
        {challengeId:quest.id,userId:friend.id,role:"opponent",status:"accepted"},
      ]});
      await tx.evidence.createMany({data:[
        {challengeId:quest.id,userId:user.id,type:"text",
          description:"Proof from fixture competitor one"},
        ...(options?.proofOpponent===false?[]:[{
          challengeId:quest.id,userId:friend.id,type:"text",
          description:"Proof from fixture competitor two",
        }]),
      ]});
      await tx.judgment.create({data:{
        challengeId:quest.id,status:"completed",winnerId:user.id,method:"manual",
      }});
      if(options?.consent!==false){
        await tx.verdictResponse.createMany({data:[
          {challengeId:quest.id,userId:user.id,decision:"accepted"},
          {challengeId:quest.id,userId:friend.id,decision:"accepted"},
        ]});
      }
      return quest;
    });
    const winning=await createQuest("eligible");
    const unique=await Promise.all(Array.from({length:9},()=>reconcileVerifiedQuestProfessionXp({
      challengeId:winning.id,userId:user.id,
    })));
    eq(new Set(unique.map(x=>x.eventId)).size,1,
      "9 concurrent XP grant attempts return same event");
    eq(unique[0].amount,100,"Winner gets fixed 100 XP");
    eq(unique[0].professionId,"software","Coding maps to software family");
    const losing=await reconcileVerifiedQuestProfessionXp({
      challengeId:winning.id,userId:friend.id,
    });
    eq(losing.amount,80,"Proof-accepted losing participant also progresses");
    eq(await prisma.professionXpEvent.count({where:{challengeId:winning.id}}),2,
      "No duplicate event for same Quest/player/career");
    eq(await prisma.professionXpEvent.count({where:{ownerId:outsider.id}}),0,
      "Outsider gets no progress");
    await rej(()=>reconcileVerifiedQuestProfessionXp({
      challengeId:winning.id,userId:outsider.id,
    }),"Third parties cannot be credited");
    for(const [label,options] of [
      ["not-settled",{status:"judging"}],
      ["no-proof",{proofOpponent:false}],
      ["not-consented",{consent:false}],
      ["unknown-profession",{type:"General"}],
    ] as const){
      const challenge=await createQuest(label,options);
      await rej(()=>reconcileVerifiedQuestProfessionXp({
        challengeId:challenge.id,userId:user.id,
      }),"Must fail-closed for "+label);
      eq(await prisma.professionXpEvent.count({where:{challengeId:challenge.id}}),0,
        "No award for "+label);
    }
    // A resolved review may mean a REFUND rather than a win, even if
    // both players previously accepted an original recommendation.
    const refunded=await createQuest("refunded");
    const original=await prisma.judgment.findFirstOrThrow({
      where:{challengeId:refunded.id},select:{id:true},
    });
    const finalRefund=await prisma.judgment.create({
      data:{challengeId:refunded.id,status:"completed",method:"manual",
        winnerId:null},
    });
    await prisma.reviewCase.create({data:{
      challengeId:refunded.id,requestedByUserId:user.id,
      originalJudgmentId:original.id,finalJudgmentId:finalRefund.id,
      status:"resolved",resolution:"refund",resolvedWinnerId:null,
      reason:"Refunded fixture with previous consent",
      expiresAt:new Date(Date.now()+60_000),
    }});
    await rej(()=>reconcileVerifiedQuestProfessionXp({
      challengeId:refunded.id,userId:user.id,
    }),"A refunded Quest never awards XP even with earlier consent");
    eq(await prisma.professionXpEvent.count({where:{challengeId:refunded.id}}),0,
      "Refund path issues no XP receipt");

    const upheld=await createQuest("upheld",{consent:false});
    const upheldOriginal=await prisma.judgment.findFirstOrThrow({
      where:{challengeId:upheld.id},select:{id:true},
    });
    await prisma.reviewCase.create({data:{
      challengeId:upheld.id,requestedByUserId:friend.id,
      originalJudgmentId:upheldOriginal.id,finalJudgmentId:upheldOriginal.id,
      status:"resolved",resolution:"uphold",resolvedWinnerId:user.id,
      reason:"Human review confirmed completed proof",
      expiresAt:new Date(Date.now()+60_000),
    }});
    const reviewed=await reconcileVerifiedQuestProfessionXp({
      challengeId:upheld.id,userId:friend.id,
    });
    eq(reviewed.amount,80,"Final upheld review can award documented losing participant");

    const all=await prisma.professionXpEvent.findMany({
      where:{challengeId:winning.id},
    });
    ok(all.every(x=>x.ruleVersion==="verified-quest-skill-v1"),"Rule provenance present");
    ok(all.every(x=>x.sourceReceipt!==null),"Final judgment receipt recorded");
    eq(await prisma.creditTx.count({where:{userId:user.id}}),0,
      "Awarding XP never mutates the participant's credit ledger");

    process.env.SUMMON_PERSISTENCE_ENABLED="false";
    await rej(()=>ensureUniversalPico(user.id),"Flag off prevents grants");
    await rej(()=>reconcileVerifiedQuestProfessionXp({
      challengeId:winning.id,userId:user.id,
    }),"Flag off prevents XP reconciliation");
    eq(await accountSummonLedger(user.id),null,"Disabled query never reaches inventory tables");
    process.env.SUMMON_PERSISTENCE_ENABLED="true";
    console.log("SUMMON_DATABASE_LEDGER_TESTS_PASS",checks,"checks");
  }finally{
    process.env.SUMMON_PERSISTENCE_ENABLED="false";
    // Restrictive FK protects history; remove test records in dependent order.
    const challenges=await prisma.challenge.findMany({
      where:{creatorId:{in:users}},select:{id:true},
    });
    const ids=challenges.map(x=>x.id);
    if(ids.length){
      await prisma.professionXpEvent.deleteMany({where:{challengeId:{in:ids}}});
      // Cascades remove Participants/Evidence/Judgments/Responses.
      await prisma.challenge.deleteMany({where:{id:{in:ids}}});
    }
    if(users.length){
      await prisma.summonTicket.deleteMany({where:{ownerId:{in:users}}});
      await prisma.summonInstance.deleteMany({where:{ownerId:{in:users}}});
      await prisma.professionXpEvent.deleteMany({where:{ownerId:{in:users}}});
      await prisma.creditTx.deleteMany({where:{userId:{in:users}}});
      await prisma.activityEvent.deleteMany({where:{userId:{in:users}}});
      await prisma.user.deleteMany({where:{id:{in:users}}});
    }
    await prisma.$disconnect();
  }
}
main().catch(err=>{console.error(err);process.exitCode=1});
