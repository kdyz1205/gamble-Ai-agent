import {getAuthUser,unauthorized} from "@/lib/auth";
import {acceptQuizDuel,getQuizDuelView,QuizDuelError} from "@/lib/quiz/quiz-duel";
export const dynamic="force-dynamic";
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  try{
    const {id}=await params;
    const receipt=await acceptQuizDuel(id,user.userId);
    return Response.json({receipt,quiz:await getQuizDuelView(id,user.userId)},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/accept] transaction failed",err instanceof Error?err.name:"Unknown");
    return Response.json({error:"Could not join Quiz. No credits were charged."},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
