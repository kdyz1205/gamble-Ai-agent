/**
 * Read-only account-bound history. Each displayed match passes the SAME
 * authoritative result digest / sealed answer replay used by Quiz detail.
 *
 * IMPORTANT: This creates NO profession XP/tickets/items. The present
 * source-visible 30-question bank is not suitable for exchangeable rewards.
 */
import prisma from "@/lib/db";
import {getQuizDuelView} from "./quiz-duel";
import {QUIZ_RULE_VERSION} from "./quiz-bank";
import {
  buildQuizHistory,verifyQuizHistoryItem,QUIZ_HISTORY_PAGE_SIZE,
  QUIZ_HISTORY_BANK_VERSION,
} from "./quiz-history-contract";

export async function getVerifiedQuizHistory(ownerId:string){
  if(typeof ownerId!=="string"||
     !/^[-_A-Za-z0-9]{8,128}$/.test(ownerId))
    throw new RangeError("Authenticated Quiz history owner required");
  if(QUIZ_RULE_VERSION!==QUIZ_HISTORY_BANK_VERSION)
    throw new Error("Quiz history bank version requires a code review");
  const rows=await prisma.quizDuel.findMany({
    where:{
      status:"completed",
      challenge:{participants:{some:{
        userId:ownerId,
        role:{in:["creator","opponent"]},
        status:{in:["accepted","completed"]},
      }}},
    },
    select:{
      challengeId:true,finalizedAt:true,winnerId:true,
      attempts:{select:{userId:true,score:true}},
      challenge:{select:{
        creatorId:true,
        participants:{select:{userId:true,role:true,status:true}},
      }},
    },
    orderBy:[{finalizedAt:"desc"},{challengeId:"asc"}],
    take:QUIZ_HISTORY_PAGE_SIZE+1,
  });
  const completed=rows.slice(0,QUIZ_HISTORY_PAGE_SIZE);
  const summaries=[];
  for(const row of completed){
    // This verifier proves SHA-256 final receipt, per-answer hash, raw choice
    // indexes and objective score. A forged/stale result fails the WHOLE read.
    const view=await getQuizDuelView(row.challengeId,ownerId);
    summaries.push(verifyQuizHistoryItem({
      challengeId:row.challengeId,creatorId:row.challenge.creatorId,
      finalizedAt:row.finalizedAt,winnerId:row.winnerId,
      participants:row.challenge.participants,
      attempts:row.attempts,userId:ownerId,view,
    }));
  }
  return buildQuizHistory(summaries,rows.length<QUIZ_HISTORY_PAGE_SIZE);
}
