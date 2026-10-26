import {getAuthUser,unauthorized} from "@/lib/auth";
import {quizPilotEnabled,quizPilotUnavailable} from "@/lib/quiz/availability";
import {getVerifiedQuizHistory} from "@/lib/quiz/quiz-history";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

export async function GET(){
  const user=await getAuthUser();
  if(!user)return unauthorized();
  if(!quizPilotEnabled())return quizPilotUnavailable();
  try{
    const history=await getVerifiedQuizHistory(user.userId);
    return Response.json({history},{headers});
  }catch(error){
    // Any score, opponent, grant, source or digest ambiguity blocks the
    // entire history instead of returning partial fabricated victories.
    console.error("[quiz/history] receipt verification failed",
      error instanceof Error?error.name:"Unknown");
    return Response.json({
      error:"Verified Quiz history is temporarily unavailable. No scores or rewards have been changed.",
    },{status:503,headers});
  }
}
