/**
 * Server-only staging for a PROTECTED, reviewer-attested question bank.
 *
 * Existing Quiz v1 still uses a repository-visible public bank. It MUST NOT
 * receive spendable XP, tickets, credits, stakes or other rewards.
 * This staging service does not change the live Quiz engine or pay anyone.
 */
import {createHash,createPublicKey,randomBytes,randomInt,timingSafeEqual,verify} from "node:crypto";
import prisma from "@/lib/db";

export const PROTECTED_BANK_POLICY="quiz-private-reviewed-v1" as const;
export const PROTECTED_QUESTION_COUNT=3;
export const MIN_REVIEWED_QUESTIONS_PER_TOPIC=96;
export const MAX_REVIEWED_QUESTIONS_PER_TOPIC=5000;
export const TOPICS=["general","technology","science","sports","math"] as const;
export type ProtectedQuizTopic=typeof TOPICS[number];
const QUIZ_BANK_VERSION=/^quiz-private-[a-z0-9][a-z0-9-]{10,92}$/;
const PRIVATE_ID=/^pq_[0-9a-f]{32}$/;
const MAX_EXCLUSION_IDS=5000;

export class ProtectedBankError extends Error{
  constructor(public readonly code:string,message:string){
    super(message);this.name="ProtectedBankError";
  }
}
function fail(code:string,msg:string):never{
  throw new ProtectedBankError(code,msg);
}
const sha256=(input:string)=>createHash("sha256").update(input).digest("hex");
/** The application only receives a REVIEWER PUBLIC KEY. The offline private
 * signature key is never present in this process or deployment.
 */
function reviewerKey(){
  const pem=process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
  if(!pem||pem.length>2048||!pem.includes("BEGIN PUBLIC KEY"))
    fail("REVIEW_KEY_MISSING","Independent Ed25519 reviewer public key is not configured");
  try{
    const key=createPublicKey(pem);
    if(key.asymmetricKeyType!=="ed25519")
      fail("REVIEW_KEY_MISSING","Only Ed25519 review attestations are accepted");
    return key;
  }catch{
    fail("REVIEW_KEY_MISSING","Invalid external Ed25519 reviewer public key");
  }
}
export function protectedBankEnabled(){
  return process.env.QUIZ_PROTECTED_BANK_ENABLED==="true";
}

export type ProtectedQuestionSpec={
  id:string;bankVersion:string;topic:ProtectedQuizTopic;
  prompt:string;choices:readonly [string,string,string,string];
  answerIndex:number;reviewedAt:string;
};
export type ProtectedQuestionRow={
  id:string;bankVersion:string;topic:string;prompt:string;
  choicesJson:string;answerIndex:number;reviewSignature:string;
  reviewedAt:Date;retiredAt:Date|null;
};
export type ProtectedQuizPublicQuestion={
  id:string;prompt:string;
  choices:readonly [string,string,string,string];
};
const norm=(str:string)=>str.trim().normalize("NFKC").toLocaleLowerCase("en");
export const canonicalProtectedReview=(q:ProtectedQuestionSpec)=>JSON.stringify({
  policy:PROTECTED_BANK_POLICY,
  id:q.id,bankVersion:q.bankVersion,topic:q.topic,
  prompt:q.prompt,choices:q.choices,answerIndex:q.answerIndex,
  reviewedAt:q.reviewedAt,
});
export function assertProtectedQuestionSpec(raw:unknown):ProtectedQuestionSpec{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    fail("QUESTION_INVALID","Question must be an approved object");
  const q=raw as Record<string,unknown>;
  if(typeof q.id!=="string"||!PRIVATE_ID.test(q.id)||
     typeof q.bankVersion!=="string"||!QUIZ_BANK_VERSION.test(q.bankVersion)||
     !TOPICS.includes(q.topic as ProtectedQuizTopic)||
     typeof q.prompt!=="string"||
     q.prompt.trim()!==q.prompt||q.prompt.length<20||q.prompt.length>500||
     !Array.isArray(q.choices)||q.choices.length!==4||
     !q.choices.every(v=>typeof v==="string"&&v.length>=2&&
       v.length<=180&&v.trim()===v)||
     new Set((q.choices as string[]).map(norm)).size!==4||
     !Number.isSafeInteger(q.answerIndex)||
     (q.answerIndex as number)<0||(q.answerIndex as number)>3||
     typeof q.reviewedAt!=="string"||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(q.reviewedAt)||
     !Number.isFinite(Date.parse(q.reviewedAt))||
     Date.parse(q.reviewedAt)>Date.now()+60_000)
    fail("QUESTION_INVALID","Protected Quiz question has unsafe or unreviewed content");
  return q as ProtectedQuestionSpec;
}
// Signatures are created OFFLINE by an independent reviewer, never in the app.
// Exposing the canonical message does not expose the reviewer signing key.
export function reviewProtectedQuestion(row:ProtectedQuestionRow):{
  spec:ProtectedQuestionSpec;publicQuestion:ProtectedQuizPublicQuestion;
}{
  let choices:unknown;
  try{choices=JSON.parse(row.choicesJson);}
  catch{fail("QUESTION_INVALID","Reviewed choices JSON is not decodable");}
  const spec=assertProtectedQuestionSpec({
    id:row.id,bankVersion:row.bankVersion,topic:row.topic,
    prompt:row.prompt,choices,answerIndex:row.answerIndex,
    reviewedAt:row.reviewedAt.toISOString(),
  });
  const signed=canonicalProtectedReview(spec);
  if(!/^[0-9a-f]{128}$/.test(row.reviewSignature)||
     !verify(null,Buffer.from(signed,"utf8"),reviewerKey(),
       Buffer.from(row.reviewSignature,"hex")))
    fail("QUESTION_TAMPERED","Protected answer or reviewer signature changed");
  return {
    spec,
    publicQuestion:{
      id:spec.id,prompt:spec.prompt,choices:spec.choices,
    },
  };
}
function assertBankVersion(bankVersion:unknown):string{
  if(typeof bankVersion!=="string"||!QUIZ_BANK_VERSION.test(bankVersion))
    fail("VERSION_INVALID","Pinned protected bank version required");
  return bankVersion as string;
}
function assertTopic(topic:unknown):ProtectedQuizTopic{
  if(!TOPICS.includes(topic as ProtectedQuizTopic))
    fail("TOPIC_INVALID","Reviewed question topic required");
  return topic as ProtectedQuizTopic;
}
function assertGate(){
  if(!protectedBankEnabled())
    fail("PRIVATE_BANK_DISABLED","Protected Quiz bank is not enabled");
  reviewerKey();
}

export async function reviewProtectedBankPool(input:{
  bankVersion:string;topic:ProtectedQuizTopic;
}){
  assertGate();
  const bankVersion=assertBankVersion(input.bankVersion);
  const topic=assertTopic(input.topic);
  const rows=await prisma.quizProtectedQuestion.findMany({
    where:{bankVersion,topic,retiredAt:null},
    orderBy:{id:"asc"},take:MAX_REVIEWED_QUESTIONS_PER_TOPIC+1,
  });
  if(rows.length<MIN_REVIEWED_QUESTIONS_PER_TOPIC||
     rows.length>MAX_REVIEWED_QUESTIONS_PER_TOPIC)
    fail("POOL_INSUFFICIENT","Private reviewed question pool is unavailable or too small");
  const validated=rows.map(reviewProtectedQuestion);
  if(new Set(validated.map(q=>q.spec.id)).size!==validated.length)
    fail("QUESTION_DUPLICATE","Private bank question IDs collided");
  return validated;
}

/**
 * Only the `public` field is suitable for a future client response.
 * `serverNonce` MUST be persisted in a protected server-only store before
 * the first question is sent. No API presently calls this staging function.
 */
export async function prepareProtectedQuizRound(input:{
  bankVersion:string;topic:ProtectedQuizTopic;
  previouslyExposedQuestionIds?:readonly string[];
}){
  const pool=await reviewProtectedBankPool(input);
  const exclusions=input.previouslyExposedQuestionIds??[];
  if(!Array.isArray(exclusions)||exclusions.length>MAX_EXCLUSION_IDS||
     exclusions.some(id=>typeof id!=="string"||!PRIVATE_ID.test(id)))
    fail("EXCLUSIONS_INVALID","Previous exposure history is incomplete or malformed");
  const exposed=new Set(exclusions);
  const eligible=pool.filter(q=>!exposed.has(q.spec.id));
  if(eligible.length<PROTECTED_QUESTION_COUNT)
    fail("POOL_EXHAUSTED","Not enough never-exposed reviewed questions remain");
  const candidates=eligible.slice();
  for(let i=candidates.length-1;i>0;i--){
    const j=randomInt(i+1);
    [candidates[i],candidates[j]]=[candidates[j],candidates[i]];
  }
  const picks=candidates.slice(0,PROTECTED_QUESTION_COUNT);
  const serverNonce=randomBytes(32).toString("hex");
  const commitment=sha256(JSON.stringify({
    policy:PROTECTED_BANK_POLICY,
    bankVersion:input.bankVersion,
    ids:picks.map(p=>p.spec.id),
    answers:picks.map(p=>p.spec.answerIndex),
    serverNonce,
  }));
  return {
    public:{
      bankVersion:input.bankVersion,
      source:PROTECTED_BANK_POLICY,
      questions:picks.map(p=>p.publicQuestion),
      answerCommitment:commitment,
      answerCount:PROTECTED_QUESTION_COUNT,
    },
    serverNonce,
  };
}
export async function verifyProtectedQuizAnswers(input:{
  bankVersion:string;questionIds:readonly string[];
  answerCommitment:string;serverNonce:string;
  submittedChoices:readonly number[];
}){
  assertGate();
  const bankVersion=assertBankVersion(input.bankVersion);
  if(!Array.isArray(input.questionIds)||
     input.questionIds.length!==PROTECTED_QUESTION_COUNT||
     !input.questionIds.every(id=>typeof id==="string"&&PRIVATE_ID.test(id))||
     new Set(input.questionIds).size!==PROTECTED_QUESTION_COUNT||
     !Array.isArray(input.submittedChoices)||
     input.submittedChoices.length!==PROTECTED_QUESTION_COUNT||
     !input.submittedChoices.every(n=>Number.isSafeInteger(n)&&n>=0&&n<=3)||
     typeof input.serverNonce!=="string"||
     !/^[0-9a-f]{64}$/.test(input.serverNonce)||
     typeof input.answerCommitment!=="string"||
     !/^[0-9a-f]{64}$/.test(input.answerCommitment))
    fail("REPLAY_INVALID","Malformed private round replay data");
  const rows=await prisma.quizProtectedQuestion.findMany({
    where:{bankVersion,id:{in:[...input.questionIds]}},
  });
  if(rows.length!==PROTECTED_QUESTION_COUNT)
    fail("QUESTION_MISSING","A pinned reviewed question is unavailable");
  const originals=rows.map(reviewProtectedQuestion);
  const catalog=new Map(originals.map(q=>[q.spec.id,q.spec]));
  const ordered=input.questionIds.map(id=>catalog.get(id)!);
  if(ordered.some(q=>!q)||new Set(ordered.map(q=>q.topic)).size!==1)
    fail("QUESTION_INVALID","Private Quiz questions have mismatched topics or identities");
  const expected=sha256(JSON.stringify({
    policy:PROTECTED_BANK_POLICY,bankVersion,
    ids:input.questionIds,answers:ordered.map(q=>q.answerIndex),
    serverNonce:input.serverNonce,
  }));
  if(!timingSafeEqual(Buffer.from(expected,"hex"),
     Buffer.from(input.answerCommitment,"hex")))
    fail("COMMITMENT_MISMATCH","Pinned non-guessable answer commitment did not match");
  return {
    verified:true as const,source:PROTECTED_BANK_POLICY,
    bankVersion,score:ordered.reduce((total,q,i)=>
      total+Number(q.answerIndex===input.submittedChoices[i]),0),
    reveal:ordered.map(q=>({id:q.id,answer:q.answerIndex})),
    answerCommitment:expected,
  };
}
