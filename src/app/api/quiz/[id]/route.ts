import {getAuthUser,unauthorized} from "@/lib/auth";
import {quizPilotEnabled,quizPilotUnavailable} from "@/lib/quiz/availability";
import {getQuizDuelView,QuizDuelError} from "@/lib/quiz/quiz-duel";

export const dynamic="force-dynamic";
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!quizPilotEnabled())return quizPilotUnavailable();
  try{
    const {id}=await params;
    return Response.json({quiz:await getQuizDuelView(id,user.userId)},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/read] internal error",err instanceof Error?err.name:"Unknown");
    return Response.json({error:"Quiz information could not be read"},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
