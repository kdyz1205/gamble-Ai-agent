import {NextRequest} from "next/server";
import {getAuthUser,unauthorized} from "@/lib/auth";
import {quizPilotEnabled,quizPilotUnavailable} from "@/lib/quiz/availability";
import {createQuizDuel,QuizDuelError} from "@/lib/quiz/quiz-duel";

export const dynamic="force-dynamic";
export async function POST(req:NextRequest){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!quizPilotEnabled())return quizPilotUnavailable();
  let body:unknown;
  try{body=await req.json();}
  catch{return Response.json({error:"Invalid Quiz request JSON"},
    {status:400,headers:{"Cache-Control":"private, no-store"}});}
  try{
    const result=await createQuizDuel(user.userId,body);
    return Response.json({...result,stakeCredits:0,
      note:"Free Quiz only. Invitation and answers are audited; no purchased credits."},
      {status:result.reused?200:201,
        headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/create] internal failure",err instanceof Error?err.name:"Unknown");
    return Response.json({error:"Quiz could not be created; no stake or invite was committed"},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
