/**
 * SERVER-ONLY: sealed answers, objective scoring and immutable, zero-reward
 * final receipts for already reserved private Quiz rounds. No public route,
 * player invitation, XP, ticket or paid-credit activation.
 */
import {createHash} from "node:crypto";
import prisma from "@/lib/db";
import type {Prisma} from "@/generated/prisma/client";
import {
  protectedBankEnabled,verifyProtectedQuizAnswers,ProtectedBankError,
  PROTECTED_BANK_POLICY,
} from "./protected-quiz-bank";
import {verifiedPublic} from "./protected-quiz-round";

export const PRIVATE_ANSWER_RULE="private-reviewed-quiz-answer-v1" as const;
const USER_ID=/^[-_A-Za-z0-9]{8,128}$/;
const COUNT=3;
const sha256=(data:string)=>createHash("sha256").update(data).digest("hex");
function fail(code:string,reason:string):never{
  throw new ProtectedBankError(code,reason);
}
function identity(v:unknown,label:string):string{
  if(typeof v!=="string"||!USER_ID.test(v))
    fail("PLAYER_INVALID","Valid authenticated "+label+" required");
  return v as string;
}
export function validatePrivateQuizChoices(value:unknown):number[]{
  if(!Array.isArray(value)||value.length!==COUNT||
     !value.every(v=>Number.isSafeInteger(v)&&v>=0&&v<=3))
    fail("ANSWERS_INVALID","Exactly three multiple-choice indexes 0-3 are required");
  return [...value] as number[];
}
export function digestPrivateQuizAnswers(answers:readonly number[]):string{
  return sha256(JSON.stringify(validatePrivateQuizChoices(answers)));
}

type Attempt={userId:string;score:number;answersJson:string;answerHash:string};
type Round={
  id:string;creatorId:string;opponentId:string;topic:string;
  bankVersion:string;status:string;expiresAt:Date;
  questionIdsJson:string;answerCommitment:string;serverNonce:string;
  resultJson:string|null;resultHash:string|null;finalizedAt:Date|null;
  attempts:Attempt[];
  exposures:{userId:string;questionId:string;bankVersion:string}[];
};
async function originalSnapshot(tx:Prisma.TransactionClient,row:Round,userId:string){
  if(![row.creatorId,row.opponentId].includes(userId))
    fail("PLAYER_FORBIDDEN","Only exact protected round players may read or submit");
  return verifiedPublic(tx,row,true);
}
function safeIds(row:Round):string[]{
  let ids:unknown;
  try{ids=JSON.parse(row.questionIdsJson);}
  catch{fail("ROUND_CORRUPT","Recorded questions have invalid encoding");}
  if(!Array.isArray(ids)||ids.length!==COUNT||
     ids.some(id=>typeof id!=="string"||!/^pq_[0-9a-f]{32}$/.test(id))||
     new Set(ids).size!==COUNT)
    fail("ROUND_CORRUPT","Private round is missing three distinct pinned questions");
  return ids as string[];
}
async function replayAttempts(row:Round){
  if(row.attempts.length>2||
     new Set(row.attempts.map(a=>a.userId)).size!==row.attempts.length||
     row.attempts.some(a=>![row.creatorId,row.opponentId].includes(a.userId)))
    fail("ATTEMPT_CORRUPT","An outsider or duplicate sealed answer is present");
  const questionIds=safeIds(row);
  const byUser=new Map<string,number>();
  for(const attempt of row.attempts){
    let raw:unknown;
    try{raw=JSON.parse(attempt.answersJson);}
    catch{fail("ATTEMPT_CORRUPT","Sealed answer indexes cannot be decoded");}
    const answers=validatePrivateQuizChoices(raw);
    if(attempt.answerHash!==digestPrivateQuizAnswers(answers))
      fail("ATTEMPT_TAMPERED","Sealed answer hash no longer matches choices");
    const recomputed=await verifyProtectedQuizAnswers({
      bankVersion:row.bankVersion,questionIds,
      serverNonce:row.serverNonce,answerCommitment:row.answerCommitment,
      submittedChoices:answers,
    });
    if(attempt.score!==recomputed.score)
      fail("ATTEMPT_TAMPERED","Stored Quiz score contradicts signed answer key");
    byUser.set(attempt.userId,recomputed.score);
  }
  return byUser;
}
async function expectedReceipt(row:Round,byUser:Map<string,number>,finalizedAt:Date){
  const players=[row.creatorId,row.opponentId].sort();
  const scores=players.map(userId=>({userId,score:byUser.get(userId)??null}));
  const completed=scores.every(score=>score.score!==null);
  const outcome=completed?
    scores[0].score===scores[1].score?"tie":"win":
    "void_timeout";
  const winnerId=outcome==="win"?
    scores[0].score!>scores[1].score!?scores[0].userId:scores[1].userId:null;
  const pinned=safeIds(row);
  const verified=await verifyProtectedQuizAnswers({
    bankVersion:row.bankVersion,questionIds:pinned,
    answerCommitment:row.answerCommitment,serverNonce:row.serverNonce,
    submittedChoices:[0,0,0],
  });
  const receipt={
    version:PRIVATE_ANSWER_RULE,
    source:PROTECTED_BANK_POLICY,
    roundId:row.id,bankVersion:row.bankVersion,topic:row.topic,
    questionIds:pinned,
    answerCommitment:row.answerCommitment,
    serverNonce:row.serverNonce,
    correctAnswers:verified.reveal,
    scores,winnerId,outcome,
    finalizedAt:finalizedAt.toISOString(),
    stakeCredits:0,creditsTransferred:0,careerXp:0,freeSummonTickets:0,
  };
  return receipt;
}
async function verifyRound(
  tx:Prisma.TransactionClient,row:Round,userId:string,
){
  const base=await originalSnapshot(tx,row,userId);
  const scores=await replayAttempts(row);
  const mine=scores.has(userId);
  const opponent=userId===row.creatorId?row.opponentId:row.creatorId;
  if(row.status==="reserved"){
    if(row.resultJson!==null||row.resultHash!==null||
       row.finalizedAt!==null)
      fail("ROUND_CORRUPT","Unfinalized Quiz cannot contain a premature verdict");
    return {...base,ownSubmitted:mine,opponentSubmitted:scores.has(opponent),
      result:null,resolutionHash:null};
  }
  if(!["completed","void"].includes(row.status)||
     !row.resultJson||!row.resultHash||!row.finalizedAt||
     !Number.isFinite(row.finalizedAt.getTime()))
    fail("ROUND_CORRUPT","Completed Quiz must carry one complete final receipt");
  const expected=await expectedReceipt(row,scores,row.finalizedAt);
  if(row.status==="void"&&row.finalizedAt.getTime()<row.expiresAt.getTime())
    fail("VERDICT_TAMPERED","A no-show verdict cannot predate the expiry deadline");
  if((row.status==="void")!==(expected.outcome==="void_timeout")||
     row.resultJson!==JSON.stringify(expected)||
     row.resultHash!==sha256(row.resultJson))
    fail("VERDICT_TAMPERED","Stored private Quiz verdict differs from sealed answers");
  return {...base,ownSubmitted:mine,opponentSubmitted:scores.has(opponent),
    result:expected,resolutionHash:row.resultHash};
}
async function lookup(tx:Prisma.TransactionClient,roundId:string){
  return tx.quizPrivateRound.findUnique({
    where:{id:roundId},
    include:{
      exposures:{select:{userId:true,questionId:true,bankVersion:true}},
      attempts:{select:{userId:true,score:true,answersJson:true,answerHash:true}},
    },
  });
}
function ensureEnabled(){
  if(!protectedBankEnabled())
    fail("PRIVATE_BANK_DISABLED","Private Quiz answer handling is disabled");
}
function guardedRoundId(roundId:unknown){
  return identity(roundId,"round");
}
async function lockRound(tx:Prisma.TransactionClient,roundId:string){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${roundId}, 74318))`;
}
async function finish(tx:Prisma.TransactionClient,row:Round,expires:boolean){
  const scoreMap=await replayAttempts(row);
  if(row.status!=="reserved")
    fail("ROUND_CONFLICT","A finalized Quiz cannot be settled again");
  if(scoreMap.size<2&&!expires)return;
  if(scoreMap.size<2&&row.expiresAt.getTime()>Date.now())
    fail("ROUND_NOT_EXPIRED","No-show cannot be declared before actual deadline");
  const when=new Date();
  const final=await expectedReceipt(row,scoreMap,when);
  const status=final.outcome==="void_timeout"?"void":"completed";
  const json=JSON.stringify(final),hash=sha256(json);
  const changed=await tx.quizPrivateRound.updateMany({
    where:{id:row.id,status:"reserved",resultJson:null},
    data:{status,resultJson:json,resultHash:hash,finalizedAt:when},
  });
  if(changed.count!==1)
    fail("ROUND_CONFLICT","This round has already been finalized");
  await tx.auditLog.create({data:{
    actorUserId:null,action:"quiz.private-round.finalized",
    payload:JSON.stringify({
      roundId:row.id,status,outcome:final.outcome,
      resolutionHash:hash,creditsTransferred:0,careerXp:0,
      freeSummonTickets:0,
    }),
  }});
}
/** Called by an independently authenticated user; never trusts client XP. */
export async function submitProtectedQuizAnswers(input:{
  roundId:string;userId:string;choices:unknown;
}){
  ensureEnabled();
  const roundId=guardedRoundId(input.roundId),userId=identity(input.userId,"player");
  const answers=validatePrivateQuizChoices(input.choices);
  const answerHash=digestPrivateQuizAnswers(answers);
  return prisma.$transaction(async tx=>{
    await lockRound(tx,roundId);
    const row=await lookup(tx,roundId);
    if(!row)fail("ROUND_MISSING","Unknown protected private Quiz");
    await verifyRound(tx,row,userId);
    const previous=row.attempts.find(a=>a.userId===userId);
    if(previous){
      if(previous.answerHash!==answerHash||
         previous.answersJson!==JSON.stringify(answers))
        fail("ANSWERS_SEALED","A submitted answer cannot be edited");
    }else{
      if(row.status!=="reserved"||row.expiresAt.getTime()<=Date.now())
        fail("ROUND_CLOSED","Protected Quiz has already closed");
      const questionIds=safeIds(row);
      const scored=await verifyProtectedQuizAnswers({
        bankVersion:row.bankVersion,questionIds,
        answerCommitment:row.answerCommitment,serverNonce:row.serverNonce,
        submittedChoices:answers,
      });
      await tx.quizPrivateAttempt.create({data:{
        roundId,userId,answersJson:JSON.stringify(answers),
        answerHash,score:scored.score,
      }});
      await tx.auditLog.create({data:{
        action:"quiz.private-answers.sealed",actorUserId:userId,
        payload:JSON.stringify({roundId,answerHash,choicesCount:3,
          cashTransferred:0,careerXp:0,freeSummonTickets:0}),
      }});
    }
    let current=await lookup(tx,roundId);
    if(!current)fail("ROUND_MISSING","Protected Quiz was lost during submission");
    if(current.status==="reserved"&&current.attempts.length===2){
      await finish(tx,current,false);
      current=await lookup(tx,roundId);
      if(!current)fail("ROUND_MISSING","Finalized Quiz receipt not found");
    }
    return verifyRound(tx,current,userId);
  },{maxWait:20_000,timeout:35_000});
}
/** Timeout is a void/no-win, even if one player answered. */
export async function expireProtectedQuizRound(input:{
  roundId:string;userId:string;
}){
  ensureEnabled();
  const roundId=guardedRoundId(input.roundId),userId=identity(input.userId,"player");
  return prisma.$transaction(async tx=>{
    await lockRound(tx,roundId);
    const row=await lookup(tx,roundId);
    if(!row)fail("ROUND_MISSING","Protected Quiz does not exist");
    await verifyRound(tx,row,userId);
    if(row.status==="reserved"){
      await finish(tx,row,true);
    }
    const updated=await lookup(tx,roundId);
    if(!updated)fail("ROUND_MISSING","Finalized private round cannot be read");
    return verifyRound(tx,updated,userId);
  },{maxWait:20_000,timeout:35_000});
}
/** Private read: anonymous or unrelated users never see scores or prompts. */
export async function getProtectedQuizAnswerView(input:{
  roundId:string;userId:string;
}){
  ensureEnabled();
  const roundId=guardedRoundId(input.roundId),userId=identity(input.userId,"player");
  return prisma.$transaction(async tx=>{
    const row=await lookup(tx,roundId);
    if(!row)fail("ROUND_MISSING","Private Quiz round does not exist");
    return verifyRound(tx,row,userId);
  },{maxWait:20_000,timeout:35_000});
}
