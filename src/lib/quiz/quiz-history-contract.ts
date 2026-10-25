/**
 * Public READ-ONLY wire contract for server-verified, completed zero-stake Quizzes.
 * These matches do NOT grant Quest XP, career XP, free tickets or cash.
 */
// Client import must NEVER transitively bundle the answer-bearing quiz-bank.
// Mirror only public release constants; the server asserts version match.
export const QUIZ_HISTORY_BANK_VERSION="quiz-curated-mcq-v1" as const;
const QUIZ_PUBLIC_TOPICS=["general","technology","science","sports","math"] as const;
const QUIZ_QUESTION_COUNT=3;

export const QUIZ_HISTORY_SOURCE="verified-zero-stake-quiz-history-v1" as const;
export const QUIZ_HISTORY_PAGE_SIZE=20;

export type QuizHistoryOutcome="won"|"lost"|"tie"|"void_timeout";
export type VerifiedQuizHistoryItem={
  challengeId:string;topic:string;opponentUsername:string;
  finalizedAt:string;outcome:QuizHistoryOutcome;
  myScore:number|null;opponentScore:number|null;
  resolutionHash:string;verified:true;stakeCredits:0;
  creditedCareerXp:0;creditedSummonTickets:0;
};
export type VerifiedQuizHistory={
  source:typeof QUIZ_HISTORY_SOURCE;
  available:true;
  coverage:"latest-completed-20-only";
  completeHistory:boolean;
  items:VerifiedQuizHistoryItem[];
  stats:{won:number;lost:number;tied:number;voided:number};
  note:string;
};

const validID=(x:unknown)=>typeof x==="string"&&
  /^[-_A-Za-z0-9]{8,128}$/.test(x);
const resultScore=(x:unknown):x is number|null=>
  x===null||(typeof x==="number"&&Number.isSafeInteger(x)&&
    x>=0&&x<=QUIZ_QUESTION_COUNT);
const digest=(x:unknown)=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const safeName=(x:unknown)=>typeof x==="string"&&
  x.trim().length>0&&x.length<=100;
function fail(msg:string):never{
  throw new Error("Quiz history failed verification: "+msg);
}

export function verifyQuizHistoryItem(args:{
  challengeId:string;creatorId:string;finalizedAt:Date|null;
  winnerId:string|null;
  participants:readonly {userId:string;role:string;status:string}[];
  userId:string;
  view:unknown;
}):VerifiedQuizHistoryItem{
  const {challengeId,creatorId,participants,userId,finalizedAt}=args;
  if(!validID(challengeId)||!validID(creatorId)||!validID(userId)||
     !(finalizedAt instanceof Date)||!Number.isFinite(finalizedAt.getTime()))
    fail("Missing authenticated participant or finalization time");
  if(!Array.isArray(participants)||participants.length!==2||
     new Set(participants.map(p=>p.userId)).size!==2||
     participants.filter(p=>p.role==="creator"&&p.userId===creatorId).length!==1||
     participants.filter(p=>p.role==="opponent").length!==1||
     !participants.every(p=>validID(p.userId)&&
       ["creator","opponent"].includes(p.role)&&
       ["accepted","completed"].includes(p.status))||
     !participants.some(p=>p.userId===userId))
    fail("Two distinct authenticated competitors required");
  const view=args.view as Record<string,unknown>|null;
  if(!view||typeof view!=="object"||Array.isArray(view)||
     view.id!==challengeId||view.playerUserId!==userId||
     view.accepted!==true||view.status!=="completed"||
     view.challengeStatus!=="settled"||view.stakeCredits!==0||
     view.stakesEnabled!==false||view.bankVersion!==QUIZ_HISTORY_BANK_VERSION||
     typeof view.topic!=="string"||
     !QUIZ_PUBLIC_TOPICS.includes(view.topic as (typeof QUIZ_PUBLIC_TOPICS)[number])||
     !digest(view.resolutionHash))
    fail("Quiz match lacks verified, settled, zero-stake provenance");
  const isCreator=userId===creatorId;
  if(view.isCreator!==isCreator)fail("User role disagrees with authenticated account");
  const opponent=isCreator?view.opponentUsername:view.creatorUsername;
  if(!safeName(opponent))fail("Opponent username missing from actual two-player room");

  const r=view.result as Record<string,unknown>|null;
  if(!r||typeof r!=="object"||Array.isArray(r)||
     r.version!=="quiz-resolution-v1"||
     r.bankVersion!==QUIZ_HISTORY_BANK_VERSION||
     r.challengeId!==challengeId||
     r.creditsTransferred!==0||r.escrowCredits!==0||
     r.winnerId!==args.winnerId||
     !Array.isArray(r.scores)||r.scores.length!==2)
    fail("Final Quiz result missing or would imply credit payouts");
  const scores=r.scores as unknown[];
  const ids=new Set(participants.map(p=>p.userId));
  const parsed=scores.map(s=>{
    if(!s||typeof s!=="object"||Array.isArray(s))fail("Invalid score entry");
    const row=s as Record<string,unknown>;
    if(!ids.has(row.userId as string)||!resultScore(row.score))
      fail("Score does not belong to a competing account");
    return {userId:row.userId as string,score:row.score as number|null};
  });
  if(new Set(parsed.map(p=>p.userId)).size!==2)
    fail("Duplicate or missing competitor score");
  const mine=parsed.find(s=>s.userId===userId);
  const other=parsed.find(s=>s.userId!==userId);
  if(!mine||!other)fail("Authenticated player score cannot be located");
  let outcome:QuizHistoryOutcome;
  if(r.outcome==="win"){
    if(!validID(r.winnerId)||mine.score===null||other.score===null||
       mine.score===other.score||
       r.winnerId!==(mine.score>other.score?mine.userId:other.userId))
      fail("Recorded winner contradicts independently checked scores");
    outcome=r.winnerId===userId?"won":"lost";
  }else if(r.outcome==="tie"){
    if(r.winnerId!==null||mine.score===null||other.score===null||
       mine.score!==other.score)
      fail("A tied Quiz cannot claim a winner or unequal scores");
    outcome="tie";
  }else if(r.outcome==="void_timeout"){
    if(r.winnerId!==null||(mine.score!==null&&other.score!==null))
      fail("An expired Quiz cannot declare a completed winning match");
    outcome="void_timeout";
  }else fail("Unsupported Quiz outcome");
  return {
    challengeId,topic:view.topic as string,opponentUsername:opponent as string,
    finalizedAt:finalizedAt.toISOString(),outcome,
    myScore:mine.score,opponentScore:other.score,
    resolutionHash:view.resolutionHash as string,verified:true,
    stakeCredits:0,creditedCareerXp:0,creditedSummonTickets:0,
  };
}

export function buildQuizHistory(items:readonly VerifiedQuizHistoryItem[],
  completeHistory:boolean):VerifiedQuizHistory{
  if(!Array.isArray(items)||items.length>QUIZ_HISTORY_PAGE_SIZE||
     typeof completeHistory!=="boolean"||
     (items.length===QUIZ_HISTORY_PAGE_SIZE&&completeHistory))
    fail("Unbounded or falsely complete history page");
  const seen=new Set<string>();
  for(const item of items){
    if(!validID(item.challengeId)||seen.has(item.challengeId)||
       !digest(item.resolutionHash)||!Number.isFinite(Date.parse(item.finalizedAt))||
       item.verified!==true||item.stakeCredits!==0||
       item.creditedCareerXp!==0||item.creditedSummonTickets!==0||
       !safeName(item.opponentUsername)||
       !["won","lost","tie","void_timeout"].includes(item.outcome)||
       !resultScore(item.myScore)||!resultScore(item.opponentScore))
      fail("Client history item is not an authenticated zero-reward receipt");
    seen.add(item.challengeId);
  }
  return {
    source:QUIZ_HISTORY_SOURCE,available:true,
    coverage:"latest-completed-20-only",completeHistory,
    items:[...items],
    stats:{
      won:items.filter(x=>x.outcome==="won").length,
      lost:items.filter(x=>x.outcome==="lost").length,
      tied:items.filter(x=>x.outcome==="tie").length,
      voided:items.filter(x=>x.outcome==="void_timeout").length,
    },
    note:"Verified completed Quiz history only. No career XP, tickets, wager or paid prize. Small fixed public question bank is not anti-cheat-safe for spendable rewards.",
  };
}

export function assertQuizHistoryWire(value:unknown):VerifiedQuizHistory{
  if(!value||typeof value!=="object"||Array.isArray(value))
    fail("History response is not an object");
  const source=value as Record<string,unknown>;
  if(source.source!==QUIZ_HISTORY_SOURCE||source.available!==true||
     source.coverage!=="latest-completed-20-only"||
     !Array.isArray(source.items)||typeof source.completeHistory!=="boolean")
    fail("History response source or coverage is missing");
  const expected=buildQuizHistory(
    source.items as VerifiedQuizHistoryItem[],source.completeHistory);
  if(JSON.stringify(source.stats)!==JSON.stringify(expected.stats)||
     source.note!==expected.note)
    fail("Server results and score totals disagree");
  return expected;
}
