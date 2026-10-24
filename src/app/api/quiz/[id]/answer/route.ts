import {getAuthUser,unauthorized} from "@/lib/auth";
import {submitQuizAnswers,QuizDuelError} from "@/lib/quiz/quiz-duel";
export const dynamic="force-dynamic";
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  let body:unknown;
  try{body=await req.json();}
  catch{return Response.json({error:"Invalid Quiz answer JSON"},
    {status:400,headers:{"Cache-Control":"private, no-store"}});}
  const answers=body&&typeof body==="object"&&!Array.isArray(body)?
    (body as Record<string,unknown>).answers:undefined;
  try{
    const {id}=await params;
    return Response.json({quiz:await submitQuizAnswers(id,user.userId,answers)},
      {headers:{"Cache-Control":"private, no-store"}});
  }catch(err){
    if(err instanceof QuizDuelError)return Response.json({error:err.message},
      {status:err.statusCode,headers:{"Cache-Control":"private, no-store"}});
    console.error("[quiz/answer] transaction failed",err instanceof Error?err.name:"Unknown");
    return Response.json({error:"Quiz submission was not confirmed. You can safely retry."},
      {status:500,headers:{"Cache-Control":"private, no-store"}});
  }
}
