/** Strict activation boundary for the isolated free Quiz pilot.
 * A successful build is NOT proof that the target database has the additive
 * QuizDuel/QuizAttempt migration. Enable only after explicit DB verification.
 * Default OFF for production and all unconfigured preview environments.
 */
export function quizPilotEnabled():boolean{
  return process.env.VERIFIED_QUIZ_ENABLED==="true";
}

/** Authenticated callers receive 503 before any Quiz table is accessed. */
export function quizPilotUnavailable():Response{
  return Response.json({
    error:"Free Quiz is not activated in this environment.",
    code:"QUIZ_PILOT_DISABLED",
    stakeCreditsAllowed:0,
  },{
    status:503,headers:{"Cache-Control":"private, no-store"},
  });
}
