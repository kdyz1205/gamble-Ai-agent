import assert from "node:assert/strict";
import {
  QUIZ_HISTORY_SOURCE,QUIZ_HISTORY_PAGE_SIZE,QUIZ_HISTORY_BANK_VERSION,
  verifyQuizHistoryItem,buildQuizHistory,assertQuizHistoryWire,
} from "../src/lib/quiz/quiz-history-contract";
import {QUIZ_RULE_VERSION} from "../src/lib/quiz/quiz-bank";

let checks=0;
const eq=(actual:unknown,expected:unknown,label:string)=>{
  assert.deepEqual(actual,expected,label);checks++;
};
const fails=(fn:()=>unknown,label:string)=>{assert.throws(fn,label);checks++;};
const alice="quiz-alice-12345",bob="quiz-bob-67890",challenge="quiz-match-11111111";
const participants=[
  {userId:alice,role:"creator",status:"accepted"},
  {userId:bob,role:"opponent",status:"accepted"},
];
const receipt={
  version:"quiz-resolution-v1",bankVersion:QUIZ_RULE_VERSION,
  challengeId:challenge,creditsTransferred:0,escrowCredits:0,
  winnerId:alice as string|null,outcome:"win" as "win"|"tie"|"void_timeout",
  scores:[{userId:alice,score:3 as number|null},{userId:bob,score:1 as number|null}],
};
const view={
  id:challenge,playerUserId:alice,isCreator:true,accepted:true,
  status:"completed",challengeStatus:"settled",stakeCredits:0,stakesEnabled:false,
  bankVersion:QUIZ_RULE_VERSION,topic:"technology",
  resolutionHash:"a".repeat(64),
  creatorUsername:"Alice",opponentUsername:"Bob",
  result:receipt,
};
const template={
  challengeId:challenge,creatorId:alice,
  finalizedAt:new Date("2026-10-25T18:00:00.000Z") as Date|null,
  winnerId:alice as string|null,participants,userId:alice,view,
};
const mutate=(fn:(fixture:typeof template)=>void)=>{
  const f=structuredClone(template);fn(f);return f;
};
const verify=(input:typeof template)=>verifyQuizHistoryItem(input);
eq(QUIZ_HISTORY_BANK_VERSION,QUIZ_RULE_VERSION,
  "The public contract mirrors the authoritative server bank version");
eq(QUIZ_HISTORY_PAGE_SIZE,20,"History requests are bounded");
const won=verify(template);
eq(won.outcome,"won","Verified creator win is from real score");
eq([won.myScore,won.opponentScore],[3,1],"Correct player perspective");
eq(won.creditedCareerXp,0,"Fixed public answers never issue reward XP");
eq(won.creditedSummonTickets,0,"No collectible ticket from quiz history");
const lost=verify(mutate(x=>{
  x.userId=bob;x.view.playerUserId=bob;x.view.isCreator=false;
}));
eq(lost.outcome,"lost","Other player's perspective is a loss");
eq(lost.opponentUsername,"Alice","Opponent identity is role-correct");
eq([lost.myScore,lost.opponentScore],[1,3],"Opponent score is not your score");
const tied=verify(mutate(x=>{
  x.winnerId=null;x.view.result.winnerId=null;
  x.view.result.outcome="tie";x.view.result.scores[1].score=3;
}));
eq(tied.outcome,"tie","Equal verified scores remain an explicit tie");
const voided=verify(mutate(x=>{
  x.winnerId=null;x.view.result.winnerId=null;
  x.view.result.outcome="void_timeout";x.view.result.scores[1].score=null as never;
}));
eq(voided.outcome,"void_timeout","No-show cannot mint a victory");
fails(()=>verify(mutate(x=>{x.view.result.winnerId=bob;})),
  "Forged winner conflicts with stored source");
fails(()=>verify(mutate(x=>{x.view.result.scores[0].score=0;})),
  "Reported winner must match highest score");
fails(()=>verify(mutate(x=>{x.view.result.scores[1].userId=alice;})),
  "One competitor cannot occupy both receipt rows");
fails(()=>verify(mutate(x=>{x.view.result.scores[1].score=4;})),
  "Three-question scores cannot exceed three");
fails(()=>verify(mutate(x=>{x.view.result.creditsTransferred=5;})),
  "Any financial movement is not a valid free Quiz");
fails(()=>verify(mutate(x=>{x.view.stakeCredits=2;})),
  "Paid-stake match cannot appear as free verified history");
fails(()=>verify(mutate(x=>{x.view.bankVersion="unknown";})),
  "Unknown question-bank version cannot count");
fails(()=>verify(mutate(x=>{x.view.resolutionHash="x";})),
  "Bad cryptographic receipt cannot be shown");
fails(()=>verify(mutate(x=>{x.view.accepted=false;})),
  "Unaccepted invitee cannot see another account's match");
fails(()=>verify(mutate(x=>{x.participants[1].userId=alice;})),
  "Self-play is invalid");
fails(()=>verify(mutate(x=>{x.view.playerUserId=bob;})),
  "Cross-account output cannot be relabeled to a different player");
fails(()=>verify(mutate(x=>{x.view.opponentUsername="";})),
  "Missing other participant is unknown, not a fake name");
fails(()=>verify(mutate(x=>{x.finalizedAt=null;})),
  "Unfinalized matches do not count as completed");
fails(()=>verify(mutate(x=>{x.view.result.outcome="tie";})),
  "Tie cannot be declared if scores differ");
fails(()=>verify(mutate(x=>{x.view.result.outcome="void_timeout";})),
  "Complete pair of answers cannot become a no-show");
const history=buildQuizHistory([
  won,
  {...lost,challengeId:"quiz-match-22222222"},
  {...tied,challengeId:"quiz-match-33333333"},
  {...voided,challengeId:"quiz-match-44444444"},
],true);
eq(history.source,QUIZ_HISTORY_SOURCE,"Only actual verified history is accepted");
eq(history.stats,{won:1,lost:1,tied:1,voided:1},"Summary matches individual outcomes");
eq(assertQuizHistoryWire(history).stats,history.stats,
  "Client validator accepts authoritative stats");
fails(()=>assertQuizHistoryWire({...history,stats:{...history.stats,won:40}}),
  "Client must reject forged win total");
fails(()=>buildQuizHistory([won,won],true),
  "Duplicate match rows cannot be counted twice");
fails(()=>assertQuizHistoryWire({...history,items:[{...won,creditedCareerXp:100}]}),
  "Client cannot turn history into career XP");
fails(()=>assertQuizHistoryWire({...history,items:[{...won,stakeCredits:5}]}),
  "Client cannot invent cash stakes");
fails(()=>buildQuizHistory(Array.from({length:21},(_,i)=>({
  ...won,challengeId:"quiz-match-abc"+i,
})),false),"Long result must not exceed 20");
fails(()=>buildQuizHistory(Array.from({length:20},(_,i)=>({
  ...won,challengeId:"quiz-match-abc"+i,
})),true),"Exactly 20 results cannot claim complete history");
console.log("QUIZ_HISTORY_CONTRACT_PASS",checks,"checks");
