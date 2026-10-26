/**
 * Real isolated PostgreSQL verification: protected bank stays server-private,
 * unsigned/unreviewed rows fail closed, sealed replay needs the secret nonce.
 * Never connects to production. Never writes career XP, tickets or credits.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes,sign} from "node:crypto";
import prisma from "../src/lib/db";
import {
  MIN_REVIEWED_QUESTIONS_PER_TOPIC,PROTECTED_BANK_POLICY,
  ProtectedBankError,canonicalProtectedReview,reviewProtectedBankPool,
  prepareProtectedQuizRound,verifyProtectedQuizAnswers,
} from "../src/lib/quiz/protected-quiz-bank";

const url=new URL(process.env.DATABASE_URL||"postgresql://invalid");
if(!["localhost","127.0.0.1"].includes(url.hostname)||
   url.pathname!=="/summoner_verification")
  throw Error("Only isolated localhost summoner_verification may run protected bank tests");
const priorPublic=process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
const priorFlag=process.env.QUIZ_PROTECTED_BANK_ENABLED;
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const pem=publicKey.export({format:"pem",type:"spki"}).toString();
const version="quiz-private-reviewed-fixture-20261025";
const seedIds:string[]=[];
let checks=0;
const eq=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;};
const refuses=async(fn:()=>Promise<unknown>,code:string,label:string)=>{
  await assert.rejects(fn,e=>e instanceof ProtectedBankError&&e.code===code,label);
  checks++;
};
async function runIntegrationTest(){
try{
  process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=pem;
  process.env.QUIZ_PROTECTED_BANK_ENABLED="false";
  await refuses(()=>reviewProtectedBankPool({bankVersion:version,topic:"technology"}),
    "PRIVATE_BANK_DISABLED","Unconfigured gate never reads an allegedly reviewed pool");
  process.env.QUIZ_PROTECTED_BANK_ENABLED="true";
  await refuses(()=>prepareProtectedQuizRound({bankVersion:version,topic:"technology"}),
    "POOL_INSUFFICIENT","Cannot silently use the public 30-question bank as a private fallback");
  const reviewedAt="2026-10-24T12:00:00.000Z";
  const rows=Array.from({length:MIN_REVIEWED_QUESTIONS_PER_TOPIC},(_,i)=>{
    const id="pq_"+randomBytes(16).toString("hex");
    seedIds.push(id);
    const spec={
      id,bankVersion:version,topic:"technology" as const,
      prompt:"Reviewed isolated training question "+i+
        ": Which independent binary-state machine step follows an explicit input transition?",
      choices:["Validated state transition "+i,
        "Unordered visual rendering "+i,
        "Unreviewed external artifact "+i,
        "Unknown routing subsystem "+i] as const,
      answerIndex:i%4,
      reviewedAt,
    };
    return {...spec,choicesJson:JSON.stringify(spec.choices),
      reviewSignature:sign(null,
        Buffer.from(canonicalProtectedReview(spec),"utf8"),privateKey).toString("hex"),
      reviewedAt:new Date(spec.reviewedAt)};
  });
  const before=await Promise.all([
    prisma.quizDuel.count(),prisma.professionXpEvent.count(),
    prisma.summonTicket.count(),prisma.creditTx.count(),
  ]);
  await prisma.quizProtectedQuestion.createMany({data:rows.map(row=>({
    id:row.id,bankVersion:row.bankVersion,topic:row.topic,
    prompt:row.prompt,choicesJson:row.choicesJson,
    answerIndex:row.answerIndex,reviewSignature:row.reviewSignature,
    reviewedAt:row.reviewedAt,
  }))});
  eq((await reviewProtectedBankPool({bankVersion:version,topic:"technology"})).length,
    MIN_REVIEWED_QUESTIONS_PER_TOPIC,"Exactly the 96 attested server rows appear");
  const first=await prepareProtectedQuizRound({bankVersion:version,topic:"technology"});
  eq(first.public.source,PROTECTED_BANK_POLICY,"Private source is versioned, not legacy");
  eq(first.public.questions.length,3,"Three secure questions selected");
  eq(new Set(first.public.questions.map(q=>q.id)).size,3,
    "One question may not appear twice in a protected round");
  ok(/^[0-9a-f]{64}$/.test(first.public.answerCommitment),
    "Round reveals only an opaque SHA-256 commitment");
  ok(/^[0-9a-f]{64}$/.test(first.serverNonce),
    "Server retains an independent non-guessable 256-bit nonce");
  const exposed=JSON.stringify(first.public);
  ok(!exposed.includes("answerIndex")&&!exposed.includes("reviewSignature")&&
      !exposed.includes("serverNonce")&&!exposed.includes(first.serverNonce),
    "Client-safe projection contains no answer key, reviewer key, or opening salt");

  const byId=new Map(rows.map(r=>[r.id,r]));
  const correct=first.public.questions.map(q=>byId.get(q.id)!.answerIndex);
  const good=await verifyProtectedQuizAnswers({
    bankVersion:version,questionIds:first.public.questions.map(q=>q.id),
    submittedChoices:correct,serverNonce:first.serverNonce,
    answerCommitment:first.public.answerCommitment,
  });
  eq(good.score,3,"Secret reviewed answers produce an actual server score");
  eq(good.reveal.map(r=>r.answer),correct,
    "After settlement, exact answer evidence supports independent recount");
  const wrong=correct.map(i=>(i+1)%4);
  const failed=await verifyProtectedQuizAnswers({
    bankVersion:version,questionIds:first.public.questions.map(q=>q.id),
    submittedChoices:wrong,serverNonce:first.serverNonce,
    answerCommitment:first.public.answerCommitment,
  });
  eq(failed.score,0,"Wrong choices never earn a server-verified score");
  await refuses(()=>verifyProtectedQuizAnswers({
    bankVersion:version,questionIds:first.public.questions.map(q=>q.id),
    submittedChoices:correct,serverNonce:randomBytes(32).toString("hex"),
    answerCommitment:first.public.answerCommitment,
  }),"COMMITMENT_MISMATCH",
  "Brute-forceable answer choices cannot open commitment without server nonce");
  const second=await prepareProtectedQuizRound({
    bankVersion:version,topic:"technology",
    previouslyExposedQuestionIds:first.public.questions.map(q=>q.id),
  });
  ok(second.public.questions.every(q=>
    !first.public.questions.some(x=>x.id===q.id)),
    "Exposure-aware selection never repeats a known recently used question");
  ok(second.public.answerCommitment!==first.public.answerCommitment,
    "Fresh server nonce changes commitment on every round");
  await refuses(()=>prepareProtectedQuizRound({
    bankVersion:version,topic:"technology",
    previouslyExposedQuestionIds:rows.slice(0,rows.length-2).map(r=>r.id),
  }),"POOL_EXHAUSTED","Insufficient never-exposed questions stop future rounds");
  const attacked=byId.get(first.public.questions[0].id)!;
  await prisma.quizProtectedQuestion.update({where:{id:attacked.id},
    data:{answerIndex:(attacked.answerIndex+1)%4}});
  await refuses(()=>prepareProtectedQuizRound({
    bankVersion:version,topic:"technology",
  }),"QUESTION_TAMPERED","A database-side answer rewrite invalidates reviewer HMAC");
  await prisma.quizProtectedQuestion.update({where:{id:attacked.id},
    data:{answerIndex:attacked.answerIndex}});
  await prisma.quizProtectedQuestion.update({where:{id:attacked.id},
    data:{retiredAt:new Date()}});
  await refuses(()=>reviewProtectedBankPool({
    bankVersion:version,topic:"technology",
  }),"POOL_INSUFFICIENT","Retiring even one row under minimum fails without public fallback");
  const original=await verifyProtectedQuizAnswers({
    bankVersion:version,questionIds:first.public.questions.map(q=>q.id),
    submittedChoices:correct,serverNonce:first.serverNonce,
    answerCommitment:first.public.answerCommitment,
  });
  eq(original.score,3,"Retired questions remain available for historical result replay");
  const after=await Promise.all([
    prisma.quizDuel.count(),prisma.professionXpEvent.count(),
    prisma.summonTicket.count(),prisma.creditTx.count(),
  ]);
  eq(after,before,
    "Private bank staging, scoring and tamper tests never mint duels, credits, XP or tickets");
  console.log("PROTECTED_QUIZ_BANK_DB_PASS",checks,"checks");
}finally{
  if(seedIds.length){
    await prisma.quizProtectedQuestion.deleteMany({
      where:{id:{in:seedIds}},
    }).catch(()=>{});
  }
  if(priorPublic===undefined)delete process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
  else process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=priorPublic;
  if(priorFlag===undefined)delete process.env.QUIZ_PROTECTED_BANK_ENABLED;
  else process.env.QUIZ_PROTECTED_BANK_ENABLED=priorFlag;
  await prisma.$disconnect();
}
}
void runIntegrationTest().catch(error=>{
  console.error("PROTECTED_QUIZ_BANK_DB_FAILED",error);
  process.exitCode=1;
});
