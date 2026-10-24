import assert from "node:assert/strict";
import {
  QUIZ_RULE_VERSION,QUIZ_QUESTION_COUNT,QUIZ_TOPICS,
  assertQuizTopic,assertQuestionIds,assertQuizAnswers,chooseQuestionIds,
  publicQuizQuestions,scoreQuizAnswers,answerCommitment,
  quizAnswerDigest,revealQuizAnswers,topicFromDescription,
} from "../src/lib/quiz/quiz-bank";

let checks=0;
const eq=(a:unknown,b:unknown,label:string)=>{assert.deepEqual(a,b,label);checks++;};
const ok=(a:unknown,label:string)=>{assert.ok(a,label);checks++;};
const bad=(f:()=>unknown,label:string)=>{assert.throws(f,RangeError,label);checks++;};

eq(QUIZ_RULE_VERSION,"quiz-curated-mcq-v1","Fixed auditable rule version");
eq(QUIZ_QUESTION_COUNT,3,"Every duel has three questions");
eq(QUIZ_TOPICS.length,5,"Five reviewed topics");
for(const t of QUIZ_TOPICS){
  eq(assertQuizTopic(t),t,"Known topic "+t);
  const ids=chooseQuestionIds(t);
  eq(ids.length,3,"Question count "+t);
  eq(new Set(ids).size,3,"No duplicate questions "+t);
  eq(assertQuestionIds(ids),ids,"Question IDs trusted by parser "+t);
  const publicItems=publicQuizQuestions(ids);
  ok(publicItems.every(q=>q.choices.length===4&&q.prompt.length>12),"All choices valid "+t);
  ok(publicItems.every(q=>!Object.keys(q).some(k=>/answer|correct|score/i.test(k))),
    "Correct answers never appear on public question JSON "+t);
  const key=revealQuizAnswers(ids);
  const right=key.map(q=>q.answer);
  const wrong=right.map(n=>(n+1)%4);
  eq(scoreQuizAnswers(ids,right),3,"Server oracle gets all right "+t);
  eq(scoreQuizAnswers(ids,wrong),0,"Counterexample never wins "+t);
  eq(scoreQuizAnswers(ids,[right[0],wrong[1],wrong[2]]),1,
    "Intermediate correct answer scoring "+t);
  ok(/^[0-9a-f]{64}$/.test(answerCommitment(ids)),"Auditable bank hash "+t);
  ok(answerCommitment(ids)!==answerCommitment([...ids].reverse()),
    "Question order is part of sealed commitment "+t);
  eq(quizAnswerDigest(right),quizAnswerDigest([...right]),"Replay hash stable "+t);
  ok(quizAnswerDigest(wrong)!==quizAnswerDigest(right),"Conflicting replay digest differs "+t);
}
eq(topicFromDescription("Create a coding quiz about AI"),"technology","Spoken AI topic");
eq(topicFromDescription("来个羽毛球知识问答"),"sports","Spoken Chinese sports topic");
eq(topicFromDescription("随机数学竞赛"),"math","Spoken math topic");
eq(topicFromDescription("Chemistry facts please"),"science","Spoken science topic");
eq(topicFromDescription("Quiz someone about history"),"general","General fallback");
for(const wrong of ["","unknown","trivia","cash"])
  bad(()=>assertQuizTopic(wrong),"Reject unsupported topic "+wrong);
for(const wrong of [[],[0],[0,0,0,0],[-1,1,2],[0,4,1],["1",2,3],[NaN,0,1]])
  bad(()=>assertQuizAnswers(wrong),"Reject invalid answer sequence");
bad(()=>assertQuestionIds(["gen-01","gen-01","gen-02"]),"No duplicated question IDs");
bad(()=>assertQuestionIds(["gen-01","tech-01","sci-01"]),"No cross-topic bank");
bad(()=>assertQuestionIds(["gen-01","gen-02","not-real"]),"Unknown question cannot be graded");
console.log("VERIFIED_QUIZ_BANK_RULES_PASS",checks,"assertions");
