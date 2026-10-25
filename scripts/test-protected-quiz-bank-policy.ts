import assert from "node:assert/strict";
import {generateKeyPairSync,randomBytes,sign} from "node:crypto";
import {
  assertProtectedQuestionSpec,canonicalProtectedReview,reviewProtectedQuestion,
  protectedBankEnabled,MIN_REVIEWED_QUESTIONS_PER_TOPIC,
  PROTECTED_BANK_POLICY,PROTECTED_QUESTION_COUNT,ProtectedBankError,
} from "../src/lib/quiz/protected-quiz-bank";

let checks=0;
const eq=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;};
const fails=(fn:()=>unknown,code:string,label:string)=>{
  assert.throws(fn,e=>e instanceof ProtectedBankError&&e.code===code,label);checks++;
};
const previousPublic=process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
const oldFlag=process.env.QUIZ_PROTECTED_BANK_ENABLED;
const {publicKey,privateKey}=generateKeyPairSync("ed25519");
const pem=publicKey.export({format:"pem",type:"spki"}).toString();
const sample={
  id:"pq_"+randomBytes(16).toString("hex"),
  bankVersion:"quiz-private-reviewed-fixture-20261025",
  topic:"technology" as const,
  prompt:"Which computation model processes ordered tasks with explicit state transitions?",
  choices:["A verified finite-state machine","An unordered image gallery",
    "An unspecified cloud region","An untyped metadata snippet"] as const,
  answerIndex:0,reviewedAt:"2026-10-24T12:00:00.000Z",
};
const signature=(s:typeof sample)=>sign(null,Buffer.from(
  canonicalProtectedReview(s),"utf8"),privateKey).toString("hex");
try{
  process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=pem;
  process.env.QUIZ_PROTECTED_BANK_ENABLED="false";
  eq(protectedBankEnabled(),false,"Private bank disabled by default");
  process.env.QUIZ_PROTECTED_BANK_ENABLED="true";
  eq(protectedBankEnabled(),true,"Explicit private-bank gate is required");
  eq(PROTECTED_BANK_POLICY,"quiz-private-reviewed-v1","Pinned review policy");
  eq(PROTECTED_QUESTION_COUNT,3,"Exactly three questions per round");
  eq(MIN_REVIEWED_QUESTIONS_PER_TOPIC,96,"Small, public quiz banks cannot qualify");
  eq(assertProtectedQuestionSpec(sample),sample,"Reviewed structure accepted");
  const signed=signature(sample);
  eq(signed.length,128,"Offline Ed25519 signature has 64 binary bytes");
  const good=reviewProtectedQuestion({
    ...sample,choicesJson:JSON.stringify(sample.choices),
    reviewSignature:signed,reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  });
  eq(good.publicQuestion.prompt,sample.prompt,"Prompt is accurate");
  eq(good.publicQuestion.choices,sample.choices,"Public choices stay in reviewer order");
  eq(JSON.stringify(good.publicQuestion).includes("answerIndex"),false,
    "Public wire excludes answer");
  eq(JSON.stringify(good.publicQuestion).includes("reviewSignature"),false,
    "Public wire excludes reviewer attestation");
  fails(()=>reviewProtectedQuestion({
    ...sample,prompt:sample.prompt+" tampered",
    choicesJson:JSON.stringify(sample.choices),
    reviewSignature:signed,
    reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  }),"QUESTION_TAMPERED","Changed prompt cannot be attested by a public key");
  fails(()=>reviewProtectedQuestion({
    ...sample,answerIndex:2,choicesJson:JSON.stringify(sample.choices),
    reviewSignature:signed,
    reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  }),"QUESTION_TAMPERED","Changed answer cannot be attested");
  fails(()=>reviewProtectedQuestion({
    ...sample,choicesJson:JSON.stringify(sample.choices),
    reviewSignature:"f".repeat(128),
    reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  }),"QUESTION_TAMPERED","Fabricated reviewer signature refused");
  fails(()=>assertProtectedQuestionSpec({...sample,id:"tech-01"}),
    "QUESTION_INVALID","Public legacy question IDs do not qualify");
  fails(()=>assertProtectedQuestionSpec({...sample,
    choices:["same","Same ","same","same"]}),
    "QUESTION_INVALID","Duplicate normalized choices refused");
  fails(()=>assertProtectedQuestionSpec({...sample,answerIndex:4}),
    "QUESTION_INVALID","Out-of-range correct answer refused");
  fails(()=>assertProtectedQuestionSpec({...sample,reviewedAt:"later"}),
    "QUESTION_INVALID","Unsigned review date refused");
  fails(()=>assertProtectedQuestionSpec({...sample,
    reviewedAt:new Date(Date.now()+86_400_000).toISOString()}),
    "QUESTION_INVALID","Future reviewer attestation refused");
  fails(()=>assertProtectedQuestionSpec({...sample,bankVersion:"quiz-curated-mcq-v1"}),
    "QUESTION_INVALID","Public bank version cannot claim private provenance");
  process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY="NOT_A_PUBLIC_KEY";
  fails(()=>reviewProtectedQuestion({
    ...sample,choicesJson:JSON.stringify(sample.choices),
    reviewSignature:signed,reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  }),"REVIEW_KEY_MISSING","An invalid public key cannot verify the reviewed bank");
  delete process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
  fails(()=>reviewProtectedQuestion({
    ...sample,choicesJson:JSON.stringify(sample.choices),
    reviewSignature:signed,reviewedAt:new Date(sample.reviewedAt),retiredAt:null,
  }),"REVIEW_KEY_MISSING","Missing public key blocks all private bank loading");
  console.log("PROTECTED_QUIZ_BANK_POLICY_PASS",checks,"checks");
}finally{
  if(previousPublic===undefined)delete process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY;
  else process.env.QUIZ_PROTECTED_REVIEW_PUBLIC_KEY=previousPublic;
  if(oldFlag===undefined)delete process.env.QUIZ_PROTECTED_BANK_ENABLED;
  else process.env.QUIZ_PROTECTED_BANK_ENABLED=oldFlag;
}
