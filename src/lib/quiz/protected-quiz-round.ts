/**
 * Server-private, zero-reward Quiz round reservation and exposure ledger.
 *
 * Staging only: NO public route, NO modification of existing public QuizDuel,
 * NO XP/tickets/Credits, and NO client access to the 256-bit answer nonce.
 *
 * Account-wide advisory locks serialize exposure across ALL opponent pairs.
 * Six unique exposure rows (three per person) and the server nonce are written
 * in ONE transaction before a client-safe question set may be returned.
 */
import prisma from "@/lib/db";
import type {Prisma} from "@/generated/prisma/client";
import {
  protectedBankEnabled,prepareProtectedQuizRound,reviewProtectedQuestion,
  verifyProtectedQuizAnswers,PROTECTED_BANK_POLICY,ProtectedBankError,
  type ProtectedQuizTopic,
} from "./protected-quiz-bank";

const SCOPE="quiz-private-round-v1:";
const ID=/^[-_A-Za-z0-9]{8,128}$/;
const KEY=/^[-_A-Za-z0-9]{16,80}$/;
const PRIVATE_ID=/^pq_[0-9a-f]{32}$/;
const MAX_EXPOSURES_PER_PLAYER=5000;
const ROUND_LIFETIME_MS=15*60*1000;

function reject(code:string,message:string):never{
  throw new ProtectedBankError(code,message);
}
function assertIdentity(raw:unknown,label:string){
  if(typeof raw!=="string"||!ID.test(raw))
    reject("ROUND_ID_INVALID","Authenticated "+label+" account required");
  return raw as string;
}
function assertRequest(raw:unknown){
  if(typeof raw!=="string"||!KEY.test(raw))
    reject("ROUND_REQUEST_INVALID","One stable private-round request key required");
  return raw as string;
}

type RoundWithExposures={
  id:string;creatorId:string;opponentId:string;
  bankVersion:string;topic:string;status:string;expiresAt:Date;
  questionIdsJson:string;answerCommitment:string;serverNonce:string;
  exposures:{userId:string;questionId:string;bankVersion:string}[];
};
export async function verifiedPublic(
  tx:Prisma.TransactionClient,row:RoundWithExposures,reused:boolean,
){
  let ids:unknown;
  try{ids=JSON.parse(row.questionIdsJson);}
  catch{reject("ROUND_CORRUPT","Saved selected question identities are invalid");}
  if(!Array.isArray(ids)||ids.length!==3||
     ids.some(id=>typeof id!=="string"||!PRIVATE_ID.test(id))||
     new Set(ids).size!==3||
     !["reserved","completed","void"].includes(row.status)||
     !Number.isFinite(row.expiresAt.getTime())||
     row.creatorId===row.opponentId)
    reject("ROUND_CORRUPT","Saved private-round state or identities are inconsistent");
  const required=new Set([
    ...ids.map(id=>row.creatorId+"|"+id),
    ...ids.map(id=>row.opponentId+"|"+id),
  ]);
  if(row.exposures.length!==6||
     row.exposures.some(x=>x.bankVersion!==row.bankVersion||
       !required.delete(x.userId+"|"+x.questionId))||
     required.size!==0)
    reject("EXPOSURE_CORRUPT","Private round has no complete, unique exposure ledger");
  // The replay scorer independently checks every offline Ed25519 signature
  // and the original nonce/answer commitment. Its answer array stays SERVER
  // SIDE; only verified public question projections leave this function.
  await verifyProtectedQuizAnswers({
    bankVersion:row.bankVersion,questionIds:ids,
    answerCommitment:row.answerCommitment,serverNonce:row.serverNonce,
    submittedChoices:[0,0,0],
  });
  const reviewed=await tx.quizProtectedQuestion.findMany({
    where:{id:{in:ids},bankVersion:row.bankVersion},
  });
  if(reviewed.length!==3)reject("QUESTION_MISSING","Pinned reviewed questions missing");
  const byId=new Map(reviewed.map(q=>{
    const validated=reviewProtectedQuestion(q);
    return [q.id,validated] as const;
  }));
  if([...byId.values()].some(x=>x.spec.topic!==row.topic))
    reject("ROUND_CORRUPT","Question topic does not match pinned round");
  return {
    id:row.id,source:PROTECTED_BANK_POLICY,
    bankVersion:row.bankVersion,topic:row.topic,
    status:row.status,reused,
    questions:ids.map(id=>byId.get(id)!.publicQuestion),
    answerCommitment:row.answerCommitment,
    expiresAt:row.expiresAt.toISOString(),
    stakeCredits:0 as const,careerXp:0 as const,
    freeSummonTickets:0 as const,
  };
}

export async function reserveProtectedQuizRound(input:{
  creatorId:string;opponentId:string;bankVersion:string;
  topic:ProtectedQuizTopic;requestKey:string;
}){
  if(!protectedBankEnabled())
    reject("PRIVATE_BANK_DISABLED","Protected Quiz round creation is not enabled");
  const creatorId=assertIdentity(input.creatorId,"creator");
  const opponentId=assertIdentity(input.opponentId,"opponent");
  const requestKey=assertRequest(input.requestKey);
  if(creatorId===opponentId)
    reject("SELF_PLAY","A protected private round needs two different players");
  const scoped=SCOPE+creatorId+":"+requestKey;
  return prisma.$transaction(async tx=>{
    const sorted=[creatorId,opponentId].sort();
    for(const playerId of sorted){
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${playerId}, 84219))`;
    }
    const users=await tx.user.findMany({
      where:{id:{in:sorted}},select:{id:true},
    });
    if(users.length!==2)
      reject("PLAYER_MISSING","Both reviewed private-Quiz players must exist");

    const previous=await tx.quizPrivateRound.findUnique({
      where:{requestKey:scoped},include:{exposures:{
        select:{userId:true,questionId:true,bankVersion:true},
      }},
    });
    if(previous){
      if(previous.creatorId!==creatorId||previous.opponentId!==opponentId||
         previous.bankVersion!==input.bankVersion||
         previous.topic!==input.topic)
        reject("REQUEST_CONFLICT","A retry key was used for different players or rules");
      return verifiedPublic(tx,previous,true);
    }
    const exposures=await tx.quizPrivateExposure.findMany({
      where:{userId:{in:sorted},bankVersion:input.bankVersion},
      select:{userId:true,questionId:true},
      take:MAX_EXPOSURES_PER_PLAYER*2+1,
    });
    if(exposures.length>MAX_EXPOSURES_PER_PLAYER*2||
       sorted.some(id=>exposures.filter(e=>e.userId===id).length>=
         MAX_EXPOSURES_PER_PLAYER))
      reject("EXPOSURE_CAP","Player exposure history is incomplete; manual review required");
    const oldIds=[...new Set(exposures.map(e=>e.questionId))];
    const picked=await prepareProtectedQuizRound({
      bankVersion:input.bankVersion,topic:input.topic,
      previouslyExposedQuestionIds:oldIds,
    });
    const ids=picked.public.questions.map(q=>q.id);
    // Protect against a reviewer retiring/modifying questions between the
    // initial pool lookup and the atomic exposure reservation.
    const current=await tx.quizProtectedQuestion.findMany({
      where:{id:{in:ids},bankVersion:input.bankVersion,
        topic:input.topic,retiredAt:null},
    });
    if(current.length!==ids.length)
      reject("QUESTION_CHANGED","Selected question became unavailable during reservation");
    for(const question of current)reviewProtectedQuestion(question);
    const record=await tx.quizPrivateRound.create({data:{
      requestKey:scoped,creatorId,opponentId,
      bankVersion:input.bankVersion,topic:input.topic,
      questionIdsJson:JSON.stringify(ids),
      answerCommitment:picked.public.answerCommitment,
      serverNonce:picked.serverNonce,status:"reserved",
      expiresAt:new Date(Date.now()+ROUND_LIFETIME_MS),
    }});
    const exposureRows=sorted.flatMap(userId=>ids.map(questionId=>({
      roundId:record.id,userId,questionId,bankVersion:input.bankVersion,
    })));
    const inserted=await tx.quizPrivateExposure.createMany({
      data:exposureRows,skipDuplicates:false,
    });
    if(inserted.count!==6)
      reject("EXPOSURE_CONFLICT","Six unique exposure records required");
    await tx.auditLog.create({data:{
      action:"quiz.private-round.reserved",actorUserId:creatorId,
      payload:JSON.stringify({
        roundId:record.id,bankVersion:input.bankVersion,topic:input.topic,
        players:sorted,answerCommitment:picked.public.answerCommitment,
        questionCount:3,stakeCredits:0,careerXp:0,
        freeSummonTickets:0,secretNonceRecordedOnServer:true,
      }),
    }});
    return verifiedPublic(tx,{
      ...record,exposures:exposureRows,
    },false);
  },{maxWait:20_000,timeout:35_000});
}

/** This read is allowed only to the TWO authenticated owner accounts. */
export async function getProtectedQuizRoundForPlayer(input:{
  roundId:string;viewerUserId:string;
}){
  if(!protectedBankEnabled())
    reject("PRIVATE_BANK_DISABLED","Protected Quiz rounds are not enabled");
  const id=assertIdentity(input.roundId,"round");
  const viewer=assertIdentity(input.viewerUserId,"viewer");
  return prisma.$transaction(async tx=>{
    const row=await tx.quizPrivateRound.findUnique({
      where:{id},include:{exposures:{
        select:{userId:true,questionId:true,bankVersion:true},
      }},
    });
    if(!row||![row.creatorId,row.opponentId].includes(viewer))
      reject("PLAYER_FORBIDDEN","Only the two protected Quiz players can view a round");
    return verifiedPublic(tx,row,true);
  },{maxWait:20_000,timeout:35_000});
}
