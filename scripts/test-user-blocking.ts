import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma } from "../src/generated/prisma/client";
import prisma from "../src/lib/db";
import { acceptChallengeAtomic } from "../src/lib/challenge-acceptance";
import { blockedPeerIds, blockedFeedExclusions, publicChallengePeerExclusions, isBlockedQuestViewer } from "../src/lib/user-blocks";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  assert(["localhost","127.0.0.1"].includes(db.hostname) && db.pathname === "/summoner_verification",
    "Blocking integration tests require isolated local verification DB");
  const run = randomUUID().replaceAll("-","");
  const user = async (label: string) => prisma.user.create({ data: {
    email: `block_${label}_${run}@example.invalid`, username: `block_${label}_${run}`, credits: 100,
  } });
  const a=await user("a"), b=await user("b"), c=await user("c");
  const makeQuest = async (creatorId:string,label:string) => prisma.challenge.create({data:{
    creatorId, title:`Block fixture ${label} ${run}`, type:"General", stake:7,
    status:"open", isPublic:true, visibility:"public", maxParticipants:2,
    participants:{create:{userId:creatorId,role:"creator",status:"accepted"}},
  }});
  const bQuest=await makeQuest(b.id,"blocked"),cQuest=await makeQuest(c.id,"allowed");
  await prisma.activityEvent.createMany({data:[
    {type:"status",userId:b.id,challengeId:bQuest.id,message:"B event"},
    {type:"status",userId:c.id,challengeId:cQuest.id,message:"C event"},
  ]});
  try {
    const whereBase: Prisma.ActivityEventWhereInput = {
      OR:[{challengeId:null},{challenge:{is:{isPublic:true,visibility:"public"}}}],
    };
    assert.equal((await prisma.activityEvent.count({where:whereBase}))>=2,true);
    await prisma.userBlock.create({data:{blockerId:a.id,blockedId:b.id}});
    await prisma.userBlock.upsert({
      where:{blockerId_blockedId:{blockerId:a.id,blockedId:b.id}},
      create:{blockerId:a.id,blockedId:b.id},update:{},
    });
    assert.equal(await prisma.userBlock.count({where:{blockerId:a.id,blockedId:b.id}}),1,"repeat is idempotent");
    const peers=await blockedPeerIds(a.id);
    assert.deepEqual(peers,[b.id]);
    assert.deepEqual(await blockedPeerIds(b.id),[a.id],"block affects both parties");
    const detailedQuest=await prisma.challenge.findUniqueOrThrow({
      where:{id:bQuest.id},include:{participants:{select:{userId:true}}},
    });
    assert.equal(await isBlockedQuestViewer(a.id,detailedQuest),true,"direct public link must be hidden");
    assert.equal(await isBlockedQuestViewer(b.id,detailedQuest),false,"original creator retains historical access");
    const events=await prisma.activityEvent.findMany({where:{...whereBase,...blockedFeedExclusions(peers)}});
    assert(!events.some(e=>e.userId===b.id || e.challengeId===bQuest.id),"blocked content hidden server-side");
    assert(events.some(e=>e.userId===c.id),"unblocked public event preserved");
    const challenges=await prisma.challenge.findMany({where:{
      status:"open",isPublic:true,visibility:"public",...publicChallengePeerExclusions(peers),
    }});
    assert(!challenges.some(x=>x.id===bQuest.id));
    assert(challenges.some(x=>x.id===cQuest.id));
    const before=await prisma.user.findUniqueOrThrow({where:{id:a.id},select:{credits:true}});
    const refused=await acceptChallengeAtomic(bQuest.id,a.id);
    assert(!refused.ok && refused.status===403,"blocked invitation cannot be accepted");
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).credits,before.credits);
    assert.equal(await prisma.creditTx.count({where:{challengeId:bQuest.id}}),0);
    assert.equal(await prisma.participant.count({where:{challengeId:bQuest.id}}),1);
    await prisma.userBlock.delete({where:{blockerId_blockedId:{blockerId:a.id,blockedId:b.id}}});
    assert.deepEqual(await blockedPeerIds(a.id),[]);
    assert.equal(await isBlockedQuestViewer(a.id,detailedQuest),false,"unblocking restores public detail");
    const accepted=await acceptChallengeAtomic(bQuest.id,a.id);
    assert(accepted.ok && accepted.creditsDebited===7,"unblock restores explicit consent path");
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:a.id}})).credits,before.credits-7);
    assert.equal(await prisma.creditTx.count({where:{challengeId:bQuest.id}}),1);
    console.log("USER_BLOCKING_VERIFIED: durable, bidirectional feed/discover exclusion, idempotent, reversible, zero blocked debits");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
