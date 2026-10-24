/**
 * PostgreSQL-backed end-to-end free Quiz duel.
 * This test uses ONLY the dedicated isolated localhost verification database,
 * creates fresh fake users, and never touches production or purchased credits.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import prisma from "../src/lib/db";
import {
  createQuizDuel,acceptQuizDuel,submitQuizAnswers,
  getQuizDuelView,finalizeExpiredQuiz,QuizDuelError,
} from "../src/lib/quiz/quiz-duel";
import {answerCommitment,revealQuizAnswers} from "../src/lib/quiz/quiz-bank";

const u=new URL(process.env.DATABASE_URL||"postgresql://invalid");
if(!["localhost","127.0.0.1"].includes(u.hostname)||
   u.pathname!=="/summoner_verification")
  throw new Error("Quiz integration may run only on isolated localhost summoner_verification");

let checks=0;
const eq=(a:unknown,b:unknown,msg:string)=>{assert.deepEqual(a,b,msg);checks++;};
const ok=(v:unknown,msg:string)=>{assert.ok(v,msg);checks++;};
const rej=async(f:()=>Promise<unknown>,status:number,msg:string)=>{
  await assert.rejects(f,e=>e instanceof QuizDuelError&&e.statusCode===status,msg);
  checks++;
};
const prefix=randomUUID().replaceAll("-","").slice(0,15);
const createdUsers:string[]=[],createdChallenges:string[]=[];
async function user(label:string){
  const x=await prisma.user.create({data:{
    email:`quiz-${prefix}-${label}@example.invalid`,
    username:`quiz_${prefix}_${label}`,credits:35,
  }});
  createdUsers.push(x.id);
  return x;
}
const key=()=>randomUUID();
const getScore=(view:Awaited<ReturnType<typeof getQuizDuelView>>,userId:string)=>{
  const v=view.result as {scores?:Array<{userId:string;score:number|null}>}|null;
  return v?.scores?.find(x=>x.userId===userId)?.score;
};
async function main(){
  const [alice,bob,outsider]=await Promise.all([user("a"),user("b"),user("c")]);
  const beforeCredits=await prisma.user.findMany({
    where:{id:{in:[alice.id,bob.id,outsider.id]}},
    select:{id:true,credits:true,totalCreditsWon:true,totalCreditsLost:true},
    orderBy:{id:"asc"},
  });
  const beforeLedger=await prisma.creditTx.count({where:{userId:{in:createdUsers}}});
  await rej(()=>createQuizDuel(alice.id,{topic:"science",requestKey:key(),stakeCredits:5}),
    400,"Never allow paid or purchased-credit Quiz wagers");
  await rej(()=>createQuizDuel(alice.id,{topic:"science",requestKey:key(),stakeCredits:-1}),
    400,"Negative wager also denied");
  await rej(()=>createQuizDuel(alice.id,{topic:"science",requestKey:"short"}),
    400,"Idempotent request key is mandatory");
  const requestKey=key();
  const first=await createQuizDuel(alice.id,{
    topic:"technology",requestKey,opponentUsername:bob.username,
    description:"Voice: challenge my friend to a coding knowledge quiz",
    stakeCredits:0,
  });
  createdChallenges.push(first.challengeId);
  eq(first.reused,false,"Quiz creation returns new record");
  const repeated=await Promise.all(Array.from({length:5},()=>createQuizDuel(alice.id,{
    topic:"technology",requestKey,opponentUsername:bob.username,
  })));
  ok(repeated.every(v=>v.challengeId===first.challengeId&&v.reused),
    "Concurrent same-key retries never mint a second challenge");
  await rej(()=>createQuizDuel(alice.id,{
    topic:"sports",requestKey,opponentUsername:bob.username,
  }),409,"Request key cannot be reused for a different topic");
  const invite=await getQuizDuelView(first.challengeId,alice.id);
  eq(invite.questions,null,"No questions before opponent joins");
  eq(invite.status,"open","Not falsely live before acceptance");
  eq(invite.stakeCredits,0,"Free challenge has zero stake");
  ok(/^[a-f0-9]{64}$/.test(invite.answerCommitment),
    "Commitment is published before the answer set opens");
  await rej(()=>getQuizDuelView(first.challengeId,outsider.id),403,
    "Invitation targeted to a real username rejects outsiders");
  await rej(()=>acceptQuizDuel(first.challengeId,outsider.id),403,
    "Outsider cannot accept a target-reserved invitation");
  await rej(()=>acceptQuizDuel(first.challengeId,alice.id),400,
    "Owner cannot self-join to collect winnings");
  await rej(()=>submitQuizAnswers(first.challengeId,alice.id,[0,0,0]),409,
    "Quiz cannot be answered before both players are accepted");

  const races=await Promise.all(Array.from({length:5},()=>acceptQuizDuel(first.challengeId,bob.id)));
  eq(races.filter(x=>!x.reused).length,1,
    "Five simultaneous opponent joins yield one new seat");
  const live=await getQuizDuelView(first.challengeId,alice.id);
  eq(live.status,"live","Match starts only with both confirmations");
  eq(live.questions?.length,3,"Same three questions revealed at start");
  eq((await getQuizDuelView(first.challengeId,bob.id)).questions,live.questions,
    "Both players receive exactly same public questions/order");
  eq(live.questions?.some(q=>"answer" in q),false,
    "Correct answers not leaked before finalization");
  await rej(()=>finalizeExpiredQuiz(first.challengeId,bob.id),409,
    "Premature timeout may not fake a winner");
  await rej(()=>submitQuizAnswers(first.challengeId,outsider.id,[0,0,0]),403,
    "Nonplayer cannot submit Quiz receipts");
  await rej(()=>submitQuizAnswers(first.challengeId,bob.id,[0,0,7]),400,
    "Choice index must be within 0–3");

  const lockedQuestions=live.questions!.map(q=>q.id);
  const correct=revealQuizAnswers(lockedQuestions).map(x=>x.answer);
  eq(answerCommitment(lockedQuestions),live.answerCommitment,
    "Sealed answer key exactly matches commitment published at creation");
  const wrong=correct.map(v=>(v+1)%4);
  const afterAlice=await submitQuizAnswers(first.challengeId,alice.id,correct);
  eq(afterAlice.ownSubmitted,true,"Creator answer is sealed");
  eq(afterAlice.result,null,"No premature score, winner or correct-answer reveal");
  eq((await getQuizDuelView(first.challengeId,bob.id)).result,null,
    "Opponent cannot see creator answers while still playing");
  const afterBob=await submitQuizAnswers(first.challengeId,bob.id,wrong);
  eq(afterBob.status,"completed","Second committed submission triggers deterministic final result");
  eq(getScore(afterBob,alice.id),3,"All-correct answer gets three points");
  eq(getScore(afterBob,bob.id),0,"Incorrect answers score zero");
  eq((afterBob.result as {winnerId:string}).winnerId,alice.id,
    "Exact higher score is the recorded winner");
  eq((afterBob.result as {creditsTransferred:number}).creditsTransferred,0,
    "No fund transfer or prize from Quiz result");
  eq((afterBob.result as {answerCommitment:string}).answerCommitment,
    live.answerCommitment,"Final revealed answer key must match original commitment");
  await rej(()=>submitQuizAnswers(first.challengeId,alice.id,wrong),409,
    "Sealed answer cannot be edited to farm correct results");
  const replay=await submitQuizAnswers(first.challengeId,alice.id,correct);
  eq(replay.status,"completed","Same answer replay is idempotent after settlement");
  eq(await prisma.quizAttempt.count({where:{challengeId:first.challengeId}}),2,
    "Exactly two immutable answer receipts");
  eq(await prisma.judgment.count({where:{challengeId:first.challengeId}}),1,
    "One final objective verdict, never duplicate");
  const ch=await prisma.challenge.findUniqueOrThrow({where:{id:first.challengeId}});
  eq(ch.status,"settled","Actual linked Challenge settled through explicit server state machine");
  eq(ch.stake,0,"Linked Challenge always had zero escrow");
  eq(ch.aiModel,"quiz-curated-mcq-v1","Judgment names rule-bank version, not a fake GPT model");
  ok((ch.resolutionHash||"").length===64,"Final outcome has verified digest");
  const logs=await prisma.auditLog.findMany({where:{challengeId:first.challengeId}});
  ok(["quiz.created","quiz.accepted","quiz.answers.sealed","quiz.verdict.committed"].every(
    action=>logs.some(l=>l.action===action)),"Full creation/join/submit/verdict audit chain");

  const tie=await createQuizDuel(alice.id,{topic:"math",requestKey:key()});
  createdChallenges.push(tie.challengeId);
  eq(tie.reused,false,"Independent second Quiz");
  await acceptQuizDuel(tie.challengeId,bob.id);
  const tieView=await getQuizDuelView(tie.challengeId,bob.id);
  const same=revealQuizAnswers(tieView.questions!.map(q=>q.id)).map(x=>x.answer);
  await submitQuizAnswers(tie.challengeId,alice.id,same);
  const tied=await submitQuizAnswers(tie.challengeId,bob.id,same);
  eq((tied.result as {outcome:string}).outcome,"tie","Equal score is an explicit draw");
  eq((tied.result as {winnerId:string|null}).winnerId,null,
    "Draw never invents a winning user");

  const expire=await createQuizDuel(alice.id,{topic:"general",requestKey:key()});
  createdChallenges.push(expire.challengeId);
  await acceptQuizDuel(expire.challengeId,bob.id);
  const expirationView=await getQuizDuelView(expire.challengeId,bob.id);
  const answers=revealQuizAnswers(expirationView.questions!.map(q=>q.id)).map(q=>q.answer);
  await submitQuizAnswers(expire.challengeId,alice.id,answers);
  await prisma.quizDuel.update({where:{challengeId:expire.challengeId},
    data:{expiresAt:new Date(Date.now()-1200)}});
  await rej(()=>submitQuizAnswers(expire.challengeId,bob.id,answers),409,
    "Late answer cannot overturn an expired Quiz");
  const voided=await finalizeExpiredQuiz(expire.challengeId,alice.id);
  eq((voided.result as {outcome:string}).outcome,"void_timeout",
    "No-show does not produce a fraudulent free winner");
  eq((voided.result as {winnerId:string|null}).winnerId,null,
    "Timeout remains no-winner");
  const voidRetry=await finalizeExpiredQuiz(expire.challengeId,bob.id);
  eq(voidRetry.status,"completed","Expired finalization is idempotent");

  const open=await createQuizDuel(alice.id,{topic:"sports",requestKey:key()});
  createdChallenges.push(open.challengeId);
  const openView=await getQuizDuelView(open.challengeId,outsider.id);
  eq(openView.canJoin,true,"Share link allows a different authenticated user");
  await acceptQuizDuel(open.challengeId,outsider.id);
  await rej(()=>acceptQuizDuel(open.challengeId,bob.id),409,
    "Third competitor cannot steal already accepted quiz seat");

  eq(await prisma.creditTx.count({where:{userId:{in:createdUsers}}}),
    beforeLedger,"No credit debits or winnings anywhere in Quiz lifecycle");
  const afterCredits=await prisma.user.findMany({
    where:{id:{in:createdUsers}},
    select:{id:true,credits:true,totalCreditsWon:true,totalCreditsLost:true},
    orderBy:{id:"asc"},
  });
  eq(afterCredits,beforeCredits,"Balances and player lifetime credit totals unchanged");
  eq(await prisma.quizDuel.count({where:{challengeId:{in:createdChallenges}}}),4,
    "Expected exact four real database Quiz sessions");
  console.log("VERIFIED_QUIZ_DUEL_DB_PASS",checks,"checks");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
  for(const id of createdChallenges){
    await prisma.challenge.deleteMany({where:{id}}).catch(()=>{});
  }
  await prisma.user.deleteMany({where:{id:{in:createdUsers}}}).catch(()=>{});
  await prisma.$disconnect();
});
