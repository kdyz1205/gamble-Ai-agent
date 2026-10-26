import assert from "node:assert/strict";
import {
  PRIVATE_ANSWER_RULE,validatePrivateQuizChoices,digestPrivateQuizAnswers,
} from "../src/lib/quiz/protected-quiz-answers";
import {ProtectedBankError} from "../src/lib/quiz/protected-quiz-bank";
let checks=0;
function eq(a:unknown,b:unknown,label:string){
  assert.deepEqual(a,b,label);checks++;
}
function denied(raw:unknown,label:string){
  assert.throws(()=>validatePrivateQuizChoices(raw),
    e=>e instanceof ProtectedBankError&&e.code==="ANSWERS_INVALID",label);
  checks++;
}
eq(PRIVATE_ANSWER_RULE,"private-reviewed-quiz-answer-v1",
  "A protected round uses an independently versioned immutable receipt");
eq(validatePrivateQuizChoices([0,1,2]),[0,1,2],
  "Three precise multiple-choice indexes accepted");
eq(validatePrivateQuizChoices([3,3,3]),[3,3,3],
  "Highest valid answer index accepted");
eq(digestPrivateQuizAnswers([0,1,2]).length,64,
  "Sealed answer digest is 256-bit");
eq(digestPrivateQuizAnswers([0,1,2]),
  digestPrivateQuizAnswers([0,1,2]),"Exact retries remain idempotent");
eq(digestPrivateQuizAnswers([0,1,2])!==
  digestPrivateQuizAnswers([0,1,3]),true,
  "Changing one choice changes the immutable answer digest");
denied([],"Missing choices refused");
denied([0,0],"Partial Quiz answer refused");
denied([0,1,2,3],"Extra question cannot be submitted");
denied([0,1,4],"Invalid index 4 rejected");
denied([-1,1,2],"Negative choice refused");
denied([1.2,2,3],"Fractional answer refused");
denied([null,2,3],"Null is not an answer index");
denied(["0",1,2],"Text is not a valid choice");
denied({answers:[0,1,2]},"Object payload cannot spoof list");
denied(null,"Null payload refused");
denied([0,1,NaN],"Non-finite values refused");
denied([0,1,Infinity],"Infinite values refused");
denied([0,1,{}],"Arbitrary object cannot become a selected answer");
console.log("PROTECTED_QUIZ_ANSWER_POLICY_PASS",checks,"checks");
