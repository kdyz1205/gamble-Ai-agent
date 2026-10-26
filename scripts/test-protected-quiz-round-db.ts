import "dotenv/config";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes,randomUUID,sign} from "node:crypto";
import prisma from "../src/lib/db";
import {
  canonicalProtectedReview,ProtectedBankError,
} from "../src/lib/quiz/protected-quiz-bank";
import {
  reserveProtectedQuizRound,getProtectedQuizRoundForPlayer,
} from "../src/lib/quiz/protected-quiz-round";
import {
  submitProtectedQuizAnswers,getProtectedQuizAnswerView,
  expireProtectedQuizRound,
} from "../src/lib/quiz/protected-quiz-answers";

const uri=new URL(process.env.DATABASE_URL||"postgresql://missing");
if(!["localhost","127.0.0.1"].includes(uri.hostname)||
   uri.pathname!=="/summoner_verification")
  throw Error("Private-round test must use isolated local summoner_verification ONLY");
const saved={
  key:process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY,
  enabled:process.env.QUIZ_PROTECTED_BANK_ENABLED,
};
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const pem=publicKey.export({format:"pem",type:"spki"}).toString();
const version="quiz-private-reviewed-exposure-20261025";
const suffix=randomUUID().replaceAll("-","").slice(0,16);
const users:string[]=[],rounds:string[]=[],questions:string[]=[];
let checks=0;
const eq=(a:unknown,b:unknown,m:string)=>{assert.deepEqual(a,b,m);checks++;};
const ok=(a:unknown,m:string)=>{assert.ok(a,m);checks++;};
const denied=async(fn:()=>Promise<unknown>,code:string,m:string)=>{
  await assert.rejects(fn,e=>e instanceof ProtectedBankError&&e.code===code,m);
  checks++;
};
const requestKey=()=>randomUUID();
async function user(role:string){
  const row=await prisma.user.create({data:{
    username:"private_round_"+role+"_"+suffix,
    email:"private-round-"+role+"-"+suffix+"@example.invalid",
    credits:43,
  }});
  users.push(row.id);return row;
}
async function suite(){
  const [creator,opponent,third,outsider]=await Promise.all([
    user("creator"),user("opponent"),user("third"),user("outsider"),
  ]);
  const beforeFinancial=await prisma.user.findMany({
    where:{id:{in:users}},
    select:{id:true,credits:true,totalCreditsWon:true,
      totalCreditsLost:true,totalCreditsBought:true},
    orderBy:{id:"asc"},
  });
  const before=await Promise.all([
    prisma.quizDuel.count(),prisma.professionXpEvent.count(),
    prisma.summonTicket.count(),prisma.creditTx.count(),
  ]);
  process.env.QUIZ_PROTECTED_BANK_ENABLED="false";
  const invite={creatorId:creator.id,opponentId:opponent.id,
    bankVersion:version,topic:"technology" as const,requestKey:requestKey()};
  await denied(()=>reserveProtectedQuizRound(invite),"PRIVATE_BANK_DISABLED",
    "Protected round cannot be reserved until enabled");
  process.env.QUIZ_PROTECTED_BANK_ENABLED="true";
  await denied(()=>reserveProtectedQuizRound(invite),"POOL_INSUFFICIENT",
    "No fallback to public answer-bearing fixed question pool");
  const specs=Array.from({length:96},(_,i)=>{
    const id="pq_"+randomBytes(16).toString("hex");
    questions.push(id);
    return {
      id,bankVersion:version,topic:"technology" as const,
      prompt:"Private review-only round "+i+
        " requires independent judgment of an explicit state transition, not a client-side answer hint.",
      choices:["State transition entry "+i,
        "Unordered display entry "+i,
        "Fallback graphics entry "+i,
        "Unreviewed metadata entry "+i] as const,
      answerIndex:i%4,reviewedAt:"2026-10-24T18:00:00.000Z",
    };
  });
  await prisma.quizProtectedQuestion.createMany({data:specs.map(q=>({
    id:q.id,bankVersion:q.bankVersion,topic:q.topic,prompt:q.prompt,
    choicesJson:JSON.stringify(q.choices),answerIndex:q.answerIndex,
    reviewSignature:sign(null,
      Buffer.from(canonicalProtectedReview(q),"utf8"),privateKey).toString("hex"),
    reviewedAt:new Date(q.reviewedAt),
  }))});
  const parallel=await Promise.all(Array.from({length:6},
    ()=>reserveProtectedQuizRound(invite)));
  const first=parallel[0];
  rounds.push(first.id);
  eq(new Set(parallel.map(x=>x.id)).size,1,
    "Six same-key concurrent attempts serialize into one exact round");
  eq(parallel.filter(x=>!x.reused).length,1,
    "One transaction reserves questions and every retry returns original");
  eq(first.questions.length,3,"Server stores and exposes three reviewed questions");
  eq(new Set(first.questions.map(q=>q.id)).size,3,
    "No duplicate private question within the same round");
  eq(first.stakeCredits,0,"All private reservations are zero-stake");
  eq(first.careerXp,0,"Private practice has no spendable career XP");
  eq(first.freeSummonTickets,0,"No collectible reward tickets from staging");
  eq(JSON.stringify(first).includes("serverNonce"),false,
    "Client-safe round excludes secret nonce");
  eq(JSON.stringify(first).includes("answerIndex"),false,
    "Client-safe round contains no answer key");
  eq(await prisma.quizPrivateRound.count({where:{id:first.id}}),1,
    "One persisted server-owned answer nonce");
  eq(await prisma.quizPrivateExposure.count({where:{roundId:first.id}}),6,
    "One immutable exposure per three questions per two accounts");

  const guestRead=await getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:opponent.id,
  });
  eq(guestRead.questions,first.questions,
    "Opponent receives identical question order and commitment");
  await denied(()=>getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:outsider.id,
  }),"PLAYER_FORBIDDEN","Foreign account cannot view private round");
  await denied(()=>reserveProtectedQuizRound({...invite,
    opponentId:third.id}),"REQUEST_CONFLICT",
    "Idempotency key cannot be reused with another opponent");
  await denied(()=>reserveProtectedQuizRound({...invite,
    creatorId:opponent.id,opponentId:opponent.id,requestKey:requestKey()}),
    "SELF_PLAY","Never reserve career competition against self");
  await denied(()=>reserveProtectedQuizRound({...invite,
    opponentId:"missing-player-"+suffix,requestKey:requestKey()}),
    "PLAYER_MISSING","Both player IDs must match real users");

  const second=await reserveProtectedQuizRound({...invite,requestKey:requestKey()});
  rounds.push(second.id);
  ok(second.questions.every(q=>!first.questions.some(x=>x.id===q.id)),
    "New match between the same pair never reuses their exposed question IDs");
  eq(await prisma.quizPrivateExposure.count({where:{roundId:second.id}}),6,
    "Second round independently persists exactly six exposures");

  const crossPair=await reserveProtectedQuizRound({...invite,
    opponentId:third.id,requestKey:requestKey(),
  });
  rounds.push(crossPair.id);
  const prior=new Set([...first.questions,...second.questions].map(q=>q.id));
  ok(crossPair.questions.every(q=>!prior.has(q.id)),
    "A player cannot bypass exposure tracking by switching opponents");
  eq(await prisma.quizPrivateExposure.count({where:{roundId:crossPair.id}}),6,
    "Cross-opponent round records both players' protected exposure");

  // Real server-only answer path: six concurrent retries still seal one
  // immutable answer per player, with NO reward or client-exposed answer key.
  const beforeAnswer=await getProtectedQuizAnswerView({
    roundId:first.id,userId:creator.id,
  });
  eq(beforeAnswer.result,null,"Round cannot reveal answers before both players finish");
  eq(beforeAnswer.ownSubmitted,false,"Never invent a submitted answer");
  const correct=first.questions.map(q=>specs.find(s=>s.id===q.id)!.answerIndex);
  const wrong=correct.map(index=>(index+1)%4);
  await denied(()=>getProtectedQuizAnswerView({
    roundId:first.id,userId:outsider.id,
  }),"PLAYER_FORBIDDEN","A stranger cannot read protected round answers");
  await denied(()=>submitProtectedQuizAnswers({
    roundId:first.id,userId:creator.id,choices:[0,1,2,4],
  }),"ANSWERS_INVALID","No invalid fourth answer index can be submitted");
  const six=await Promise.all(Array.from({length:6},
    ()=>submitProtectedQuizAnswers({
      roundId:first.id,userId:creator.id,choices:correct,
    })));
  eq(six.every(r=>r.result===null),true,
    "First submitted player never sees premature score or secret nonce");
  eq(await prisma.quizPrivateAttempt.count({where:{roundId:first.id}}),1,
    "Six concurrent retries seal one real database answer");
  eq(six[0].ownSubmitted,true,"Player receives a verified submitted flag");
  await denied(()=>submitProtectedQuizAnswers({
    roundId:first.id,userId:creator.id,choices:wrong,
  }),"ANSWERS_SEALED","Conflicting answer retry is rejected");
  const verdict=await submitProtectedQuizAnswers({
    roundId:first.id,userId:opponent.id,choices:wrong,
  });
  eq(verdict.result?.outcome,"win","Objective signature-backed 3-0 score is a win");
  eq(verdict.result?.winnerId,creator.id,"Winner matches exact real creator account");
  eq(verdict.result?.scores.find(s=>s.userId===creator.id)?.score,3,
    "Server scoring independently confirms creator's three answers");
  eq(verdict.result?.scores.find(s=>s.userId===opponent.id)?.score,0,
    "Wrong answers remain zero points for the opponent");
  eq(verdict.result?.creditsTransferred,0,"Completed protected practice transfers no credit");
  eq(verdict.result?.careerXp,0,"Protected practice doesn't mint redeemable career XP");
  eq(verdict.result?.freeSummonTickets,0,
    "Protected practice doesn't grant free summon tickets");
  ok(/^[0-9a-f]{64}$/.test(verdict.result!.serverNonce),
    "Server nonce is revealed only when both sealed answers resolve");
  const replay=await submitProtectedQuizAnswers({
    roundId:first.id,userId:creator.id,choices:correct,
  });
  eq(replay.resolutionHash,verdict.resolutionHash,
    "Exact replay returns same immutable final receipt");
  const opponentRead=await getProtectedQuizAnswerView({
    roundId:first.id,userId:opponent.id,
  });
  eq(opponentRead.result?.winnerId,creator.id,
    "Opponent independently reads the same server-finalized verdict");
  await denied(()=>submitProtectedQuizAnswers({
    roundId:first.id,userId:outsider.id,choices:correct,
  }),"PLAYER_FORBIDDEN","Foreign account cannot place an answer");
  const originalAttempt=await prisma.quizPrivateAttempt.findFirstOrThrow({
    where:{roundId:first.id,userId:creator.id},
  });
  await prisma.quizPrivateAttempt.update({where:{id:originalAttempt.id},
    data:{score:0}});
  await denied(()=>getProtectedQuizAnswerView({
    roundId:first.id,userId:creator.id,
  }),"ATTEMPT_TAMPERED","Mutating stored score breaks the signed answer replay");
  await prisma.quizPrivateAttempt.update({where:{id:originalAttempt.id},
    data:{score:originalAttempt.score}});
  const finalRow=await prisma.quizPrivateRound.findUniqueOrThrow({
    where:{id:first.id},
  });
  await prisma.quizPrivateRound.update({where:{id:first.id},
    data:{resultHash:"f".repeat(64)}});
  await denied(()=>getProtectedQuizAnswerView({
    roundId:first.id,userId:creator.id,
  }),"VERDICT_TAMPERED","Mutated final receipt hash cannot pass validation");
  await prisma.quizPrivateRound.update({where:{id:first.id},
    data:{resultHash:finalRow.resultHash}});
  eq((await getProtectedQuizAnswerView({
    roundId:first.id,userId:creator.id,
  })).result?.winnerId,creator.id,
  "Repaired DB tamper fixture reproduces original verified result");

  await denied(()=>expireProtectedQuizRound({
    roundId:second.id,userId:creator.id,
  }),"ROUND_NOT_EXPIRED","A live round cannot be voided early");
  await submitProtectedQuizAnswers({
    roundId:second.id,userId:creator.id,choices:[0,0,0],
  });
  await prisma.quizPrivateRound.update({where:{id:second.id},
    data:{expiresAt:new Date(Date.now()-1000)}});
  const voided=await expireProtectedQuizRound({
    roundId:second.id,userId:opponent.id,
  });
  eq(voided.result?.outcome,"void_timeout","One-sided timeout has no winner");
  eq(voided.result?.winnerId,null,
    "No-show must not declare the only answering player a winner");
  await denied(()=>submitProtectedQuizAnswers({
    roundId:second.id,userId:opponent.id,choices:[0,0,0],
  }),"ROUND_CLOSED","Late opponent submission cannot resurrect a void match");
  eq((await expireProtectedQuizRound({
    roundId:second.id,userId:creator.id,
  })).result?.outcome,"void_timeout",
    "Repeated expiry does not issue a second verdict");
  eq(await prisma.quizPrivateAttempt.count({where:{roundId:{in:rounds}}}),3,
    "Two answered in match one, one in timed-out match two");

  const row=await prisma.quizPrivateRound.findUniqueOrThrow({
    where:{id:first.id},
  });
  await prisma.quizPrivateRound.update({where:{id:first.id},
    data:{serverNonce:"0".repeat(64)}});
  await denied(()=>getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:creator.id,
  }),"COMMITMENT_MISMATCH","Edited stored nonce cannot open answer commitment");
  await prisma.quizPrivateRound.update({where:{id:first.id},
    data:{serverNonce:row.serverNonce}});
  eq((await getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:creator.id,
  })).id,first.id,"Restored nonce verifies original server round");

  const exposed=await prisma.quizPrivateExposure.findFirstOrThrow({
    where:{roundId:first.id,userId:opponent.id},
  });
  await prisma.quizPrivateExposure.delete({where:{id:exposed.id}});
  await denied(()=>getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:opponent.id,
  }),"EXPOSURE_CORRUPT",
  "Incomplete exposure audit can never be presented as a fully verified round");
  await prisma.quizPrivateExposure.create({data:{
    id:exposed.id,roundId:exposed.roundId,userId:exposed.userId,
    questionId:exposed.questionId,bankVersion:exposed.bankVersion,
    createdAt:exposed.createdAt,
  }});

  const selected=specs.find(q=>q.id===first.questions[0].id)!;
  await prisma.quizProtectedQuestion.update({where:{id:selected.id},
    data:{answerIndex:(selected.answerIndex+1)%4}});
  await denied(()=>getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:creator.id,
  }),"QUESTION_TAMPERED",
  "A database-side changed correct answer invalidates the offline reviewer signature");
  await prisma.quizProtectedQuestion.update({where:{id:selected.id},
    data:{answerIndex:selected.answerIndex}});
  eq((await getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:creator.id,
  })).answerCommitment,first.answerCommitment,
  "Source attestation and original answer commitment recover after fixture repair");

  await prisma.quizProtectedQuestion.update({where:{id:selected.id},
    data:{retiredAt:new Date()}});
  await denied(()=>reserveProtectedQuizRound({...invite,
    requestKey:requestKey()}),"POOL_INSUFFICIENT",
    "Retiring a question under the 96 review threshold blocks new rounds");
  eq((await getProtectedQuizRoundForPlayer({
    roundId:first.id,viewerUserId:creator.id,
  })).id,first.id,"Previously reserved retired questions remain auditable");

  eq(await prisma.quizPrivateRound.count({where:{id:{in:rounds}}}),3,
    "Exactly three server-owned rounds recorded");
  eq(await prisma.auditLog.count({where:{
    actorUserId:creator.id,action:"quiz.private-round.reserved",
  }}),3,"One audit event per actual round; retries do not duplicate");
  eq(await prisma.user.findMany({where:{id:{in:users}},
    select:{id:true,credits:true,totalCreditsWon:true,
      totalCreditsLost:true,totalCreditsBought:true},
    orderBy:{id:"asc"},
  }),beforeFinancial,"Player credit/balance totals are byte-for-byte unchanged");
  eq(await Promise.all([
    prisma.quizDuel.count(),prisma.professionXpEvent.count(),
    prisma.summonTicket.count(),prisma.creditTx.count(),
  ]),before,"No public Quiz, career XP, summon tickets or money were created");
  console.log("PROTECTED_QUIZ_ROUND_DB_PASS",checks,"checks");
}
async function run(){
  process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=pem;
  try{await suite();}
  finally{
    try{
      // Cleanup tracks authenticated fixture identities, not just the list
      // populated after successful awaits; interrupted concurrent creations
      // must not leave reservation/exposure data behind in the test database.
      const stored=await prisma.quizPrivateRound.findMany({
        where:{OR:[{creatorId:{in:users}},{opponentId:{in:users}}]},
        select:{id:true},
      });
      const ids=stored.map(row=>row.id);
      await prisma.quizPrivateAttempt.deleteMany({where:{roundId:{in:ids}}});
      await prisma.quizPrivateExposure.deleteMany({where:{roundId:{in:ids}}});
      await prisma.quizPrivateRound.deleteMany({where:{id:{in:ids}}});
      // Completed round audit events have a null actor. Limit cleanup to the
      // exact synthetic round IDs, never global action-based deletion.
      const finals=await prisma.auditLog.findMany({
        where:{action:"quiz.private-round.finalized"},
        select:{id:true,payload:true},
      });
      const finalIDs=finals.filter(a=>{
        try{return ids.includes((JSON.parse(a.payload??"{}") as {roundId?:string}).roundId??"");}
        catch{return false;}
      }).map(a=>a.id);
      await prisma.auditLog.deleteMany({where:{id:{in:finalIDs}}});
      await prisma.auditLog.deleteMany({where:{actorUserId:{in:users},
        action:{in:["quiz.private-round.reserved","quiz.private-answers.sealed"]}}});
      await prisma.quizProtectedQuestion.deleteMany({where:{id:{in:questions}}});
      await prisma.user.deleteMany({where:{id:{in:users}}});
    }finally{
      if(saved.key===undefined)delete process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
      else process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=saved.key;
      if(saved.enabled===undefined)delete process.env.QUIZ_PROTECTED_BANK_ENABLED;
      else process.env.QUIZ_PROTECTED_BANK_ENABLED=saved.enabled;
      await prisma.$disconnect();
    }
  }
}
void run().catch(error=>{
  console.error("PROTECTED_QUIZ_ROUND_DB_FAILED",error);
  process.exitCode=1;
});
