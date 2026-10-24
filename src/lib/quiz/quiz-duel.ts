/**
 * End-to-end two-person knowledge quiz engine.
 *
 * This is an objective, auditable ZERO-STAKE game. It explicitly rejects
 * cash/purchased-credit betting and never calls an LLM to guess a grade.
 * No API call is allowed to bypass identity, accepted opponent, reply lock,
 * quiz expiry, sealed answer set or a single final judgment.
 */
import {createHash} from "node:crypto";
import type {Prisma} from "@/generated/prisma/client";
import prisma from "@/lib/db";
import {assertChallengeTransition} from "@/lib/challenge-state-machine";
import {ChallengeStatus} from "@/lib/enums";
import {
  QUIZ_RULE_VERSION,QUIZ_QUESTION_COUNT,assertQuizTopic,
  assertQuestionIds,assertQuizAnswers,chooseQuestionIds,
  answerCommitment,publicQuizQuestions,revealQuizAnswers,
  scoreQuizAnswers,quizAnswerDigest,topicFromDescription,
  type QuizTopic,
} from "./quiz-bank";

export class QuizDuelError extends Error{
  constructor(public readonly statusCode:number,message:string){super(message);}
}
function fail(status:number,message:string):never{
  throw new QuizDuelError(status,message);
}
export const QUIZ_JOIN_WINDOW_MS=24*60*60*1000;
export const QUIZ_PLAY_WINDOW_MS=15*60*1000;
const safeId=(id:unknown)=>{
  if(typeof id!=="string"||!/^[-_A-Za-z0-9]{8,128}$/.test(id))
    fail(400,"Invalid Quiz reference");
  return id as string;
};
const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const inputKey=(userId:string,raw:unknown)=>{
  if(typeof raw!=="string"||!/^[-_a-zA-Z0-9]{16,80}$/.test(raw))
    fail(400,"A stable unique request key is required");
  return userId+":"+raw;
};
const stringify=(obj:unknown)=>JSON.stringify(obj);

type CreateInput={
  topic?:unknown;description?:unknown;opponentUsername?:unknown;
  stakeCredits?:unknown;requestKey?:unknown;
};
const createInput=(actorId:string,raw:unknown)=>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    fail(400,"Quiz creation requires an object");
  const body=raw as CreateInput;
  if(body.stakeCredits!==undefined&&body.stakeCredits!==0)
    fail(400,"Verified Quiz pilot only supports zero-stake play. Paid/purchased credits cannot be wagered.");
  if(body.opponentUsername!==undefined&&
    (typeof body.opponentUsername!=="string"||body.opponentUsername.length>48))
    fail(400,"Invalid opponent username");
  if(body.description!==undefined&&
    (typeof body.description!=="string"||body.description.length>300))
    fail(400,"The spoken Quiz request is too long");
  const description=(body.description||"").toString().trim();
  let topic:QuizTopic;
  try{topic=body.topic?assertQuizTopic(body.topic):topicFromDescription(description);}
  catch{fail(400,"Unknown Quiz topic");}
  return {
    topic,description,
    username:typeof body.opponentUsername==="string"?body.opponentUsername.trim():undefined,
    requestKey:inputKey(actorId,body.requestKey),
  };
};
const displayTopic=(topic:QuizTopic)=>({
  general:"General knowledge",technology:"Software & AI",
  science:"Science",sports:"Sports",math:"Mathematics",
})[topic];

const safeJsonIds=(raw:string)=>{try{return assertQuestionIds(JSON.parse(raw));}
  catch{throw new Error("Stored Quiz question IDs are inconsistent");}
};
const parseFinal=(raw:string|null)=>{
  if(!raw)return null;
  try{return JSON.parse(raw) as Record<string,unknown>;}
  catch{throw new Error("Stored Quiz decision receipt is invalid");}
};

/** Creation is one DB commit: challenge, reserved opponent, Quiz and audit. */
export async function createQuizDuel(userId:string,raw:unknown){
  const input=createInput(userId,raw);
  const intendedOpponent=input.username
    ?await prisma.user.findUnique({where:{username:input.username},select:{id:true}})
    :null;
  if(input.username&&!intendedOpponent)fail(404,"Invited username does not exist");
  const originalDescription=input.description||"A shared, verifiable knowledge challenge.";
  const sameRequest=(existing:{
    topic:string;invitedUserId:string|null;
    challenge:{creatorId:string;description:string|null};
  })=>{
    if(existing.challenge.creatorId!==userId||existing.topic!==input.topic||
       existing.invitedUserId!==(intendedOpponent?.id??null)||
       existing.challenge.description!==originalDescription)
      fail(409,"Request key was already used for different Quiz settings");
  };
  const existing=await prisma.quizDuel.findUnique({
    where:{requestKey:input.requestKey},
    include:{challenge:{select:{creatorId:true,description:true}}},
  });
  if(existing){
    sameRequest(existing);
    return {challengeId:existing.challengeId,reused:true};
  }
  const selected=chooseQuestionIds(input.topic);
  const commitment=answerCommitment(selected);
  try{
    return await prisma.$transaction(async tx=>{
      // Serialize the very first attempts sharing a retry key. The pre-read
      // outside this transaction is not enough when all requests race before
      // the unique row exists.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestKey}, 7009))`;
      const prior=await tx.quizDuel.findUnique({
        where:{requestKey:input.requestKey},
        include:{challenge:{select:{creatorId:true,description:true}}},
      });
      if(prior){
        sameRequest(prior);
        return {challengeId:prior.challengeId,reused:true};
      }
      const creator=await tx.user.findUnique({where:{id:userId},
        select:{id:true,username:true}});
      if(!creator)fail(401,"Authentication required");
      let invitee:{id:string;username:string}|null=null;
      if(input.username){
        invitee=await tx.user.findUnique({where:{username:input.username},
          select:{id:true,username:true}});
        if(!invitee)fail(404,"Invited username does not exist");
        if(invitee.id===userId)fail(400,"You cannot challenge yourself");
      }
      const openUntil=new Date(Date.now()+QUIZ_JOIN_WINDOW_MS);
      const challenge=await tx.challenge.create({data:{
        creatorId:userId,title:displayTopic(input.topic)+" · 3-question Quiz duel",
        description:input.description||"A shared, verifiable knowledge challenge.",
        proposition:"Two players answer the same three sealed multiple-choice questions. Highest verified score wins; ties draw.",
        type:"Learning",marketType:"head_to_head",stake:0,stakeToken:"credits",
        status:"open",isPublic:false,visibility:"invite_only",
        maxParticipants:2,evidenceType:"text",settlementMode:"oracle",
        aiReview:false,deadline:openUntil,proofSource:"both",
        arbiter:"quiz-curated-mcq-v1",fallbackRule:"expired quiz has no winner and no credit movement",
        rules:"Free only. Three same questions for both players; four choices each. No answer edits. "+
          "Both players submit within 15 minutes of joining. Ties draw. No-show expires void. "+
          "Grade determined by immutable server question bank; no AI guess or paid credit transfer.",
        participants:{create:[
          {userId,role:"creator",status:"accepted"},
          ...(invitee?[{userId:invitee.id,role:"opponent",status:"pending"}]:[]),
        ]},
      }});
      await tx.quizDuel.create({data:{
        challengeId:challenge.id,requestKey:input.requestKey,
        topic:input.topic,bankVersion:QUIZ_RULE_VERSION,
        questionIds:stringify(selected),answerCommitment:commitment,
        invitedUserId:invitee?.id??null,status:"open",
      }});
      await tx.auditLog.create({data:{
        action:"quiz.created",actorUserId:userId,challengeId:challenge.id,
        payload:stringify({topic:input.topic,stake:0,commitment,
          invitedUserId:invitee?.id??null,questionCount:QUIZ_QUESTION_COUNT,
          bankVersion:QUIZ_RULE_VERSION}),
      }});
      await tx.activityEvent.create({data:{
        type:"quiz_created",userId,challengeId:challenge.id,
        message:creator.username+" created a free Quiz duel",
      }});
      return {challengeId:challenge.id,reused:false};
    },{timeout:15_000});
  }catch(err){
    // Concurrent retry may lose the requestKey uniqueness race. Do not
    // create a second invite, and never reuse somebody else's request.
    if((err as {code?:string}).code==="P2002"){
      const previous=await prisma.quizDuel.findUnique({
        where:{requestKey:input.requestKey},
        include:{challenge:{select:{creatorId:true,description:true}}},
      });
      if(previous){
        sameRequest(previous);
        return {challengeId:previous.challengeId,reused:true};
      }
      fail(409,"Quiz request key conflict");
    }
    throw err;
  }
}

/** Creator or invitee may read the invitation; answers stay sealed. */
export async function getQuizDuelView(challengeIdRaw:unknown,userId:string){
  const challengeId=safeId(challengeIdRaw);
  const duel=await prisma.quizDuel.findUnique({
    where:{challengeId},
    include:{challenge:{
      select:{id:true,title:true,creatorId:true,status:true,stake:true,
        arbiter:true,resolutionHash:true,deadline:true,
        creator:{select:{username:true}},
        participants:{select:{userId:true,status:true,role:true,
          user:{select:{username:true}}}},
      }},
      attempts:{select:{userId:true,score:true,submittedAt:true}},
    },
  });
  if(!duel)fail(404,"Quiz not found");
  if(duel.challenge.stake!==0||duel.challenge.arbiter!==QUIZ_RULE_VERSION)
    fail(409,"The Quiz answer and credit contract is inconsistent");
  const validPairs={
    open:"open",live:"live",completed:"settled",cancelled:"cancelled",
  } as const;
  if(duel.challenge.status!==validPairs[duel.status as keyof typeof validPairs])
    throw new Error("Quiz and Quest lifecycle require reconciliation");
  const participant=duel.challenge.participants.find(p=>p.userId===userId);
  const invited=duel.invitedUserId===userId;
  if(!participant && duel.invitedUserId&&!invited)
    fail(403,"This Quiz was invited to another account");
  if(!participant&&!invited&&duel.status!=="open")
    fail(403,"Only accepted competitors can see this Quiz");
  const joined=Boolean(participant&&["accepted","completed"].includes(participant.status));
  const canJoin=duel.status==="open"&&!joined&&
    (!duel.invitedUserId||invited)&&
    (!duel.challenge.deadline||duel.challenge.deadline.getTime()>Date.now());
  const result=duel.status==="completed"?parseFinal(duel.resultJson):null;
  const ids=safeJsonIds(duel.questionIds);
  if(duel.bankVersion!==QUIZ_RULE_VERSION||
     answerCommitment(ids)!==duel.answerCommitment)
    throw new Error("Quiz bank or original answer commitment is inconsistent");
  if(duel.status==="completed"){
    if(!result||result.version!=="quiz-resolution-v1"||
       result.challengeId!==challengeId||result.bankVersion!==duel.bankVersion||
       result.answerCommitment!==duel.answerCommitment||
       result.winnerId!==duel.winnerId||
       result.creditsTransferred!==0||result.escrowCredits!==0||
       duel.challenge.resolutionHash!==hash(stringify(result)))
      throw new Error("Final Quiz receipt digest failed verification");
  }else if(duel.resultJson!==null||duel.winnerId!==null){
    throw new Error("Unfinished Quiz contains a premature verdict");
  }
  return {
    id:duel.challengeId,
    title:duel.challenge.title,topic:duel.topic,bankVersion:duel.bankVersion,
    status:duel.status,challengeStatus:duel.challenge.status,
    stakeCredits:0,stakesEnabled:false,
    creatorUsername:duel.challenge.creator.username,
    isCreator:duel.challenge.creatorId===userId,
    playerUserId:userId,accepted:joined,canJoin,
    opponentUsername:duel.challenge.participants.find(p=>p.role==="opponent")?.user.username??null,
    invitedToOtherAccount:Boolean(duel.invitedUserId&&!invited&&!joined),
    expiresAt:duel.expiresAt?.toISOString()??null,
    answerCommitment:duel.answerCommitment,
    // Before accepted join and live status, no one can see questions.
    questions:joined && ["live","completed"].includes(duel.status)
      ?publicQuizQuestions(ids):null,
    ownSubmitted:duel.attempts.some(p=>p.userId===userId),
    opponentSubmitted:joined&&duel.attempts.some(p=>p.userId!==userId),
    result:joined?result:null,
    receiptVersion:"quiz-duel-read-v1",
  };
}

export async function acceptQuizDuel(challengeIdRaw:unknown,userId:string){
  const challengeId=safeId(challengeIdRaw);
  return prisma.$transaction(async tx=>{
    // Coordinate with all transitions for this challenge.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7117))`;
    await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${challengeId} FOR UPDATE`;
    const quiz=await tx.quizDuel.findUnique({where:{challengeId}});
    const challenge=await tx.challenge.findUnique({
      where:{id:challengeId},
      include:{participants:true},
    });
    if(!quiz||!challenge)fail(404,"Quiz not found");
    if(challenge.stake!==0)fail(409,"Paid Quiz wagers are disabled");
    const existing=challenge.participants.find(p=>p.userId===userId);
    if(userId===challenge.creatorId)fail(400,"Quiz creator cannot accept their own match");
    if(quiz.invitedUserId&&quiz.invitedUserId!==userId)
      fail(403,"This invitation belongs to another account");
    if(existing?.role==="opponent"&&existing.status==="accepted"&&
       quiz.status==="live")return {challengeId,reused:true};
    if(quiz.status!=="open"||challenge.status!=="open")
      fail(409,"Quiz is not open for joining");
    if(challenge.deadline&&challenge.deadline.getTime()<=Date.now())
      fail(409,"This invitation expired without any stake changes");
    if(existing&&!(existing.role==="opponent"&&existing.status==="pending"))
      fail(409,"This Quiz seat is not available");
    if(challenge.participants.some(p=>p.role==="opponent"&&p.userId!==userId))
      fail(409,"The opponent seat is already reserved");
    const startedAt=new Date();
    const expiresAt=new Date(startedAt.getTime()+QUIZ_PLAY_WINDOW_MS);
    if(existing)await tx.participant.update({
      where:{id:existing.id},data:{status:"accepted"},
    });
    else await tx.participant.create({data:{
      challengeId,userId,role:"opponent",status:"accepted",
    }});
    assertChallengeTransition(ChallengeStatus.open,ChallengeStatus.live);
    await tx.challenge.update({where:{id:challengeId},data:{
      status:"live",deadline:expiresAt,
    }});
    await tx.quizDuel.update({where:{challengeId},data:{
      status:"live",startedAt,expiresAt,
    }});
    await tx.auditLog.create({data:{
      action:"quiz.accepted",actorUserId:userId,challengeId,
      payload:stringify({stake:0,expiresAt:expiresAt.toISOString()}),
    }});
    return {challengeId,reused:false};
  },{maxWait:15_000,timeout:15_000});
}

function resultReceipt(duel:{
  challengeId:string;questionIds:string;answerCommitment:string;
  topic:string;bankVersion:string;expiresAt:Date|null;
},playerIds:readonly string[],attempts:readonly {
  userId:string;score:number;answerHash:string;answersJson:string;
}[]){
  const ids=safeJsonIds(duel.questionIds);
  if(duel.bankVersion!==QUIZ_RULE_VERSION||
     answerCommitment(ids)!==duel.answerCommitment)
    throw new Error("Quiz answers changed from the published commitment");
  // Recalculate from immutable raw answers at finalization. The mutable score
  // column is never trusted as authority for a winner, even within our DB.
  const scores=playerIds.slice().sort().map(userId=>{
    const row=attempts.find(a=>a.userId===userId);
    if(!row)return {userId,score:null,answerHash:null};
    let answers:number[];
    try{answers=assertQuizAnswers(JSON.parse(row.answersJson));}
    catch{throw new Error("Stored Quiz answers are invalid");}
    if(quizAnswerDigest(answers)!==row.answerHash||
       scoreQuizAnswers(ids,answers)!==row.score)
      throw new Error("Quiz response digest or recorded score failed verification");
    return {userId,score:row.score,answerHash:row.answerHash};
  });
  const fullyAnswered=scores.every(p=>typeof p.score==="number");
  let winnerId:string|null=null;
  let outcome:"win"|"tie"|"void_timeout";
  if(fullyAnswered){
    if(scores[0].score!==scores[1].score){
      winnerId=(scores[0].score!>scores[1].score!?scores[0]:scores[1]).userId;
      outcome="win";
    }else outcome="tie";
  }else outcome="void_timeout";
  const receipt={
    version:"quiz-resolution-v1",bankVersion:duel.bankVersion,
    questionIds:ids,correctAnswers:revealQuizAnswers(ids),
    answerCommitment:duel.answerCommitment,topic:duel.topic,
    challengeId:duel.challengeId,scores,winnerId,outcome,
    escrowCredits:0,creditsTransferred:0,
    expiresAt:duel.expiresAt?.toISOString()??null,
  };
  return {receipt,hash:hash(stringify(receipt)),winnerId};
}

/** Must be called only while the Quiz challenge is locked and live. */
async function finalizeLocked(tx:Prisma.TransactionClient,duel:{
  challengeId:string;questionIds:string;answerCommitment:string;topic:string;
  bankVersion:string;expiresAt:Date|null;
},challenge:{id:string;status:string;creatorId:string;stake:number},
  forceExpired:boolean){
  if(challenge.status!=="live"||challenge.stake!==0)
    fail(409,"Quiz challenge cannot be adjudicated");
  const players=await tx.participant.findMany({
    where:{challengeId:duel.challengeId,role:{in:["creator","opponent"]},
      status:"accepted"},
    select:{userId:true,role:true},
  });
  if(players.length!==2||players.filter(p=>p.role==="creator").length!==1||
     players.filter(p=>p.role==="opponent").length!==1)
    fail(409,"Both accepted Quiz competitors are required");
  const attempts=await tx.quizAttempt.findMany({
    where:{challengeId:duel.challengeId},
    select:{userId:true,score:true,answerHash:true,answersJson:true},
  });
  if(attempts.some(a=>!players.some(p=>p.userId===a.userId)))
    throw new Error("An outsider Quiz response was stored");
  if(attempts.length<2&&!forceExpired) return null;
  const adjudication=resultReceipt(duel,players.map(p=>p.userId),attempts);
  assertChallengeTransition(ChallengeStatus.live,ChallengeStatus.judging);
  assertChallengeTransition(ChallengeStatus.judging,ChallengeStatus.settled);
  await tx.challenge.update({where:{id:duel.challengeId},data:{
    status:"judging",
  }});
  const winner=adjudication.winnerId;
  await tx.judgment.create({data:{
    challengeId:duel.challengeId,
    method:"rules",aiModel:QUIZ_RULE_VERSION,winnerId:winner,
    reasoning:adjudication.receipt.outcome==="void_timeout"
      ?"Quiz expired without both answer receipts; no winner and no credits transferred."
      :"Exact, committed multiple-choice answer key; scores independently recomputed on server.",
    confidence:1,status:"completed",
  }});
  const done=await tx.challenge.update({where:{id:duel.challengeId},data:{
    status:"settled",resolutionHash:adjudication.hash,aiModel:QUIZ_RULE_VERSION,
  }});
  if(done.stake!==0)throw new Error("Quiz stake must never change");
  await tx.quizDuel.update({where:{challengeId:duel.challengeId},data:{
    status:"completed",winnerId:winner,finalizedAt:new Date(),
    resultJson:stringify(adjudication.receipt),
  }});
  await tx.auditLog.create({data:{
    action:"quiz.verdict.committed",actorUserId:null,challengeId:duel.challengeId,
    payload:stringify({resolutionHash:adjudication.hash,
      outcome:adjudication.receipt.outcome,
      scores:adjudication.receipt.scores,creditsTransferred:0,
      bankVersion:QUIZ_RULE_VERSION}),
  }});
  return adjudication.receipt;
}

export async function submitQuizAnswers(challengeIdRaw:unknown,
  userId:string,rawAnswers:unknown){
  const challengeId=safeId(challengeIdRaw);
  let answers:number[];
  try{answers=assertQuizAnswers(rawAnswers);}
  catch{fail(400,"Exactly three choices (0–3) are required");}
  const answerHash=quizAnswerDigest(answers);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7117))`;
    const duel=await tx.quizDuel.findUnique({where:{challengeId}});
    const challenge=await tx.challenge.findUnique({where:{id:challengeId}});
    if(!duel||!challenge)fail(404,"Quiz not found");
    if(challenge.stake!==0)fail(409,"Paid Quiz adjudication is disabled");
    const seat=await tx.participant.findUnique({
      where:{challengeId_userId:{challengeId,userId}},
    });
    if(!seat||seat.status!=="accepted"||!["creator","opponent"].includes(seat.role))
      fail(403,"Only accepted Quiz players may answer");
    const previous=await tx.quizAttempt.findUnique({
      where:{challengeId_userId:{challengeId,userId}},
    });
    if(previous){
      if(previous.answerHash!==answerHash||previous.answersJson!==stringify(answers))
        fail(409,"Quiz answer is sealed and cannot be edited");
      // Idempotent response, including retries after both players resolve.
      return;
    }
    if(duel.status!=="live"||challenge.status!=="live"||
       !duel.expiresAt||Date.now()>=duel.expiresAt.getTime())
      fail(409,"Quiz is not accepting new answers");
    const ids=safeJsonIds(duel.questionIds);
    if(duel.answerCommitment!==answerCommitment(ids))
      fail(409,"The Quiz answer commitment is inconsistent");
    const score=scoreQuizAnswers(ids,answers);
    await tx.quizAttempt.create({data:{
      challengeId,userId,answersJson:stringify(answers),answerHash,score,
    }});
    await tx.auditLog.create({data:{
      action:"quiz.answers.sealed",actorUserId:userId,challengeId,
      payload:stringify({answerHash,questionCount:QUIZ_QUESTION_COUNT,
        timestamp:new Date().toISOString()}),
    }});
    await finalizeLocked(tx,duel,challenge,false);
  },{maxWait:15_000,timeout:20_000});
  return getQuizDuelView(challengeId,userId);
}

/** Explicit expiry operation: no scoring endpoint may invent a winner. */
export async function finalizeExpiredQuiz(challengeIdRaw:unknown,userId:string){
  const challengeId=safeId(challengeIdRaw);
  await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${challengeId}, 7117))`;
    const duel=await tx.quizDuel.findUnique({where:{challengeId}});
    const challenge=await tx.challenge.findUnique({where:{id:challengeId}});
    if(!duel||!challenge)fail(404,"Quiz not found");
    if(challenge.stake!==0)fail(409,"Paid Quiz adjudication is disabled");
    const seat=await tx.participant.findUnique({
      where:{challengeId_userId:{challengeId,userId}},
    });
    if(!seat||seat.status!=="accepted"||!["creator","opponent"].includes(seat.role))
      fail(403,"Only accepted players may complete this Quiz");
    if(duel.status==="completed")return;
    if(duel.status!=="live"||challenge.status!=="live")
      fail(409,"Quiz has not started");
    if(!duel.expiresAt||duel.expiresAt.getTime()>Date.now())
      fail(409,"Quiz deadline has not passed");
    await finalizeLocked(tx,duel,challenge,true);
  },{maxWait:15_000,timeout:20_000});
  return getQuizDuelView(challengeId,userId);
}

/**
 * Background-only expiration sweep. Never invoke the generic AI judge.
 * Its caller MUST gate this on a migrated Quiz DB and verified CRON_SECRET.
 * Every candidate is rechecked after the exact same transaction advisory key
 * used by create/accept/submit; timeouts never award a credit or ghost winner.
 */
export async function sweepExpiredQuizDuels(limit=15){
  if(!Number.isSafeInteger(limit)||limit<1||limit>30)
    throw new RangeError("Quiz sweep limit must be between 1 and 30");
  const now=new Date();
  const due=await prisma.quizDuel.findMany({
    where:{OR:[
      {status:"live",expiresAt:{not:null,lte:now}},
      {status:"open",challenge:{deadline:{not:null,lte:now}}},
    ]},
    select:{challengeId:true},take:limit,
    orderBy:{createdAt:"asc"},
  });
  const summary:{scanned:number;finalized:number;cancelled:number;
    skipped:number;failures:Array<{id:string;error:string}>}={
    scanned:due.length,finalized:0,cancelled:0,skipped:0,failures:[],
  };
  for(const row of due){
    const id=row.challengeId;
    try{
      const status=await prisma.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${id}, 7117))`;
        await tx.$queryRaw`SELECT id FROM "Challenge" WHERE id = ${id} FOR UPDATE`;
        const duel=await tx.quizDuel.findUnique({where:{challengeId:id}});
        const challenge=await tx.challenge.findUnique({where:{id}});
        if(!duel||!challenge)
          throw new Error("Missing Quiz or Quest record");
        if(challenge.stake!==0||challenge.arbiter!==QUIZ_RULE_VERSION)
          throw new Error("Quiz monetary or rule boundary inconsistent");
        if(await tx.creditTx.count({where:{challengeId:id}}))
          throw new Error("Unexpected credit ledger rows on free Quiz");
        if(duel.status==="live"&&challenge.status==="live"&&
           duel.expiresAt&&duel.expiresAt.getTime()<=Date.now()){
          await finalizeLocked(tx,duel,challenge,true);
          return "finalized" as const;
        }
        if(duel.status==="open"&&challenge.status==="open"&&
           challenge.deadline&&challenge.deadline.getTime()<=Date.now()){
          const accepted=await tx.participant.count({where:{
            challengeId:id,role:"opponent",status:"accepted",
          }});
          if(accepted)throw new Error("An accepted opponent exists in open Quiz");
          assertChallengeTransition(ChallengeStatus.open,ChallengeStatus.cancelled);
          await tx.challenge.update({where:{id},data:{status:"cancelled"}});
          await tx.quizDuel.update({where:{challengeId:id},
            data:{status:"cancelled"}});
          await tx.auditLog.create({data:{
            action:"quiz.invitation.expired",challengeId:id,actorUserId:null,
            payload:stringify({stakeCredits:0,expiry:challenge.deadline.toISOString()}),
          }});
          return "cancelled" as const;
        }
        return "skipped" as const;
      },{maxWait:10_000,timeout:15_000});
      summary[status]++;
    }catch(err){
      summary.failures.push({id,error:err instanceof Error?err.message.slice(0,140):
        "Unknown expiration failure"});
    }
  }
  return summary;
}
