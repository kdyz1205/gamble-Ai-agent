import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import prisma from "../src/lib/db";
import {provisionSignupUser} from "../src/lib/auth-provisioning";
import {COSTS} from "../src/lib/credits";
import {ensureUniversalPico,accountSummonLedger,starterGrantKey,
  reconcileVerifiedQuestProfessionXp,XP_LEDGER_VERSION}
  from "../src/lib/summons/server-ledger";
import {reconcileFreeCareerTickets,ticketGrantKey,TICKET_GRANT_RULE_VERSION}
  from "../src/lib/summons/free-ticket-ledger";

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
  const ticketRej=async(f:()=>Promise<unknown>,message:string)=>{
    await assert.rejects(f,{name:"SummonTicketSourceError"},message);
    checks++;
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
    await prisma.summonInstance.update({where:{id:instances[0].id},
      data:{form:"evolved"}});
    const afterEvolution=await ensureUniversalPico(user.id);
    eq(afterEvolution.id,instances[0].id,
      "Retry preserves the existing Pico identity after cosmetic evolution");
    eq(afterEvolution.form,"evolved",
      "Retry must not reset a previously earned visual form");
    eq(await prisma.summonInstance.count({where:{originKind:"starter",ownerId:user.id}}),1,
      "No duplicated starter after retry");
    const ledger=await accountSummonLedger(user.id);
    eq(ledger?.starter?.id,instances[0].id,"Read-after-write for authenticated owner");
    eq(ledger?.items.length,0,"No fabricated extra Summons");
    eq(ledger?.xp,null,"Unbackfilled XP remains unknown");
    eq(ledger?.tickets,null,"Unimplemented tickets remain unknown");
    eq((await accountSummonLedger(outsider.id))?.starter,null,
      "Other account cannot see somebody else's Pico");
    const corruptedStarter=await prisma.summonInstance.create({data:{
      ownerId:outsider.id,grantKey:starterGrantKey(outsider.id),
      speciesId:"not-pico",originKind:"starter",
      rarity:"starter",form:"base",status:"owned",
    }});
    await rej(()=>ensureUniversalPico(outsider.id),
      "A conflicting unique starter row is not overwritten or accepted");
    eq((await prisma.summonInstance.findUniqueOrThrow({
      where:{id:corruptedStarter.id},
    })).speciesId,"not-pico","Conflicting starter is unchanged for manual repair");
    await prisma.summonInstance.delete({where:{id:corruptedStarter.id}});
    eq((await accountSummonLedger(outsider.id))?.starter,null,
      "Invalid starter fixture cleanup restores empty account");
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
    const afterAward=await accountSummonLedger(user.id);
    eq(afterAward?.xp?.totalRecordedXp,100,
      "Authenticated account sees only its actual credited XP");
    eq(afterAward?.xp?.receiptCount,1,
      "Nine concurrent award attempts are still one counted receipt");
    eq(afterAward?.xp?.byProfession,[{
      professionId:"software",recordedXp:100,receiptCount:1,
    }],"Recorded profession totals derive from server rows");
    eq(afterAward?.xp?.ruleVersion,"verified-quest-skill-v1",
      "Readback names the exact XP rule");
    eq(afterAward?.xp?.coverage,"partial-since-ledger-activation",
      "Recorded XP never claims lifetime completeness");
    eq(afterAward?.xp?.completeHistory,false,
      "Historical Quests remain explicitly unbackfilled");
    eq((await accountSummonLedger(friend.id))?.xp?.totalRecordedXp,80,
      "The losing account sees its own verified receipts only");
    eq((await accountSummonLedger(outsider.id))?.xp,null,
      "No receipt is UNKNOWN, not zero XP");
    process.env.SUMMON_TICKETS_ENABLED="true";
    const freeFirst=await Promise.all(Array.from({length:10},
      ()=>reconcileFreeCareerTickets({ownerId:user.id,professionId:"software"})));
    eq(new Set(freeFirst.map(x=>x.grantIds[0])).size,1,
      "10 concurrent free-ticket reconciles yield one receipt");
    eq(freeFirst[0].earnedMilestones,1,"100 win XP yields one career ticket");
    eq(freeFirst[0].verifiedXp,100,"Ticket XP is sourced from win event only");
    eq(freeFirst[0].available,1,"First ticket available only once");
    const firstTicket=await prisma.summonTicket.findFirstOrThrow({
      where:{ownerId:user.id,professionId:"software"},
    });
    eq(firstTicket.grantKey,ticketGrantKey(user.id,"software",1),
      "Ticket grant uses stable per-player/per-career key");
    eq(firstTicket.sourceVersion,TICKET_GRANT_RULE_VERSION,
      "Milestone receipts retain original rule version");
    eq((await reconcileFreeCareerTickets({ownerId:friend.id,
      professionId:"software"})).earnedMilestones,0,
      "A documented loss at 80 XP does not yet mint a free ticket");
    eq((await reconcileFreeCareerTickets({ownerId:outsider.id,
      professionId:"software"})).earnedMilestones,0,
      "Nonparticipant earns no profession ticket");

    const more=await createQuest("additional-coding");
    await reconcileVerifiedQuestProfessionXp({challengeId:more.id,userId:user.id});
    eq((await reconcileFreeCareerTickets({ownerId:user.id,
      professionId:"software"})).earnedMilestones,1,
      "200 verified XP remains one ticket");
    const third=await createQuest("third-coding");
    await reconcileVerifiedQuestProfessionXp({challengeId:third.id,userId:user.id});
    const two=await Promise.all(Array.from({length:10},
      ()=>reconcileFreeCareerTickets({ownerId:user.id,professionId:"software"})));
    eq(new Set(two.map(x=>x.grantIds.join(":"))).size,1,
      "Concurrent threshold crossing grants exactly two stable IDs");
    eq(two[0].verifiedXp,300,"Three wins earn 300 verified career XP");
    eq(two[0].earnedMilestones,2,"300 XP reaches second 250 threshold");
    eq(two[0].available,2,"Second ticket issued without duplicating first");
    eq(await prisma.summonTicket.count({where:{ownerId:user.id,
      professionId:"software"}}),2,"Exactly two persisted career tickets");

    const fitness=await createQuest("exercise",{type:"Fitness"});
    await reconcileVerifiedQuestProfessionXp({challengeId:fitness.id,userId:user.id});
    const athletic=await reconcileFreeCareerTickets({
      ownerId:user.id,professionId:"athletics",
    });
    eq(athletic.verifiedXp,100,"Other career has its own recorded XP");
    eq(athletic.earnedMilestones,1,"Separate career can earn its first free ticket");
    eq(await prisma.summonTicket.count({where:{ownerId:friend.id}}),0,
      "No cross-player ticket leak");
    await prisma.summonTicket.update({where:{id:firstTicket.id},
      data:{status:"spent",spentByGrant:"fixture-spend-"+id,spentAt:new Date()}});
    const spent=await reconcileFreeCareerTickets({
      ownerId:user.id,professionId:"software",
    });
    eq([spent.available,spent.spent],[1,1],
      "Previously spent ticket is not restored by reconciliation");
    eq(await prisma.summonTicket.count({where:{
      ownerId:user.id,professionId:"software",
    }}),2,"Spent ticket is not duplicated or reminted");

    await prisma.challenge.update({where:{id:third.id},data:{status:"disputed"}});
    await ticketRej(()=>reconcileFreeCareerTickets({
      ownerId:user.id,professionId:"software",
    }),"Disputed source Quest blocks further ticket issuance");
    eq(await prisma.summonTicket.count({where:{ownerId:user.id,
      professionId:"software"}}),2,"Dispute does not generate replacement tickets");
    await prisma.challenge.update({where:{id:third.id},data:{status:"settled"}});

    const forgedQuest=await createQuest("forged-source");
    const forgedKey="quest-xp:"+XP_LEDGER_VERSION+":"+
      forgedQuest.id+":"+user.id+":software";
    await prisma.professionXpEvent.create({data:{
      ownerId:user.id,challengeId:forgedQuest.id,
      eventKey:forgedKey,professionId:"software",awardType:"verified_quest",
      amount:100,ruleVersion:XP_LEDGER_VERSION,sourceReceipt:"forged-final-receipt",
    }});
    await ticketRej(()=>reconcileFreeCareerTickets({
      ownerId:user.id,professionId:"software",
    }),"Forged final-receipt XP cannot mint free tickets");
    await prisma.professionXpEvent.delete({where:{eventKey:forgedKey}});
    const correctionKey="correction-fixture:"+id;
    await prisma.professionXpEvent.create({data:{
      ownerId:user.id,challengeId:winning.id,
      eventKey:correctionKey,professionId:"software",awardType:"correction",
      amount:-100,ruleVersion:XP_LEDGER_VERSION,sourceReceipt:unique[0].sourceReceipt,
    }});
    await ticketRej(()=>reconcileFreeCareerTickets({
      ownerId:user.id,professionId:"software",
    }),"Corrected XP history requires reconciliation; no silent grants");
    await prisma.professionXpEvent.delete({where:{eventKey:correctionKey}});
    eq(await prisma.professionXpEvent.count({where:{challengeId:winning.id}}),2,
      "No duplicate event for same Quest/player/career");
    eq(await prisma.professionXpEvent.count({where:{ownerId:outsider.id}}),0,
      "Outsider gets no progress");
    const bad=await prisma.professionXpEvent.create({data:{
      ownerId:outsider.id,challengeId:winning.id,
      eventKey:"invalid-profession-"+id,professionId:"not-a-profession",
      awardType:"verified_quest",amount:80,ruleVersion:"verified-quest-skill-v1",
      sourceReceipt:unique[0].sourceReceipt,
    }});
    await rej(()=>accountSummonLedger(outsider.id),
      "Unknown profession receipts must fail closed, not inflate a score");
    await prisma.professionXpEvent.delete({where:{id:bad.id}});
    const forged=await prisma.professionXpEvent.create({data:{
      ownerId:outsider.id,challengeId:winning.id,
      eventKey:"unaudited-"+id,professionId:"software",
      awardType:"verified_quest",amount:7,ruleVersion:"verified-quest-skill-v1",
      sourceReceipt:null,
    }});
    await rej(()=>accountSummonLedger(outsider.id),
      "Rows without a final judgment receipt or valid fixed XP fail closed");
    await prisma.professionXpEvent.delete({where:{id:forged.id}});
    eq((await accountSummonLedger(outsider.id))?.xp,null,
      "Removing invalid fixtures restores UNKNOWN without inventing zero");
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
    await ticketRej(()=>reconcileFreeCareerTickets({ownerId:user.id,
      professionId:"software"}),"Persistence flag OFF rejects ticket issuance");
    process.env.SUMMON_PERSISTENCE_ENABLED="true";
    process.env.SUMMON_TICKETS_ENABLED="false";
    await ticketRej(()=>reconcileFreeCareerTickets({ownerId:user.id,
      professionId:"software"}),"Ticket flag OFF independently rejects issuance");
    process.env.SUMMON_PERSISTENCE_ENABLED="false";
    await rej(()=>ensureUniversalPico(user.id),"Flag off prevents grants");
    await rej(()=>reconcileVerifiedQuestProfessionXp({
      challengeId:winning.id,userId:user.id,
    }),"Flag off prevents XP reconciliation");
    eq(await accountSummonLedger(user.id),null,"Disabled query never reaches inventory tables");
    process.env.SUMMON_PERSISTENCE_ENABLED="true";
    process.env.SUMMON_TICKETS_ENABLED="false";
    console.log("SUMMON_DATABASE_LEDGER_TESTS_PASS",checks,"checks");
  }finally{
    process.env.SUMMON_TICKETS_ENABLED="false";
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
