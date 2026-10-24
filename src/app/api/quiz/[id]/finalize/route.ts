import {getAuthUser,unauthorized} from "@/lib/auth";
import {finalizeExpiredQuiz,QuizDuelError} from "@/lib/quiz/quiz-duel";
export const dynamic="force-dynamic";
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  try{
    const {id}=await params;
    return Response.json({quiz:await finalizeExpiredQuiz(id,user.userId)},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/finalize] transaction failed",err instanceof Error?err.name:"Unknown");
    return Response.json({error:"The expired Quiz could not be finalized"},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
