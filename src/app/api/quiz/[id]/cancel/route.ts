import prisma from "@/lib/db";
import {getAuthUser,unauthorized} from "@/lib/auth";
import {quizPilotEnabled,quizPilotUnavailable} from "@/lib/quiz/availability";
import {cancelChallengeAtomic} from "@/lib/challenge-cancellation";
import {getQuizDuelView,QuizDuelError} from "@/lib/quiz/quiz-duel";
export const dynamic="force-dynamic";

/** Only creator may cancel an unmatched, zero-stake Quiz invitation. */
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!quizPilotEnabled())return quizPilotUnavailable();
  const {id}=await params;
  const quiz=await prisma.quizDuel.findUnique({where:{challengeId:id},
    select:{challengeId:true}});
  if(!quiz)return Response.json({error:"Quiz not found"},
    {status:404,headers:{"Cache-Control":"private, no-store"}});
  try{
    const result=await cancelChallengeAtomic(id,user.userId);
    if(!result.ok)return Response.json({error:result.error},
      {status:result.status,headers:{"Cache-Control":"private, no-store"}});
    return Response.json({receipt:result,quiz:await getQuizDuelView(id,user.userId)},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/cancel] error",err instanceof Error?err.name:"unknown");
    return Response.json({error:"Quiz cancellation was not confirmed; retry safely"},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
