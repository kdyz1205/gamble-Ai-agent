/**
 * Safe, non-secret runtime summary. Separates developer's ChatGPT login from
 * the application's server-issued provider API credentials and local rules.
 */
import {DEFAULT_LLM_PROVIDER_ID,getProviderById} from "@/lib/llm-providers";
import {QUIZ_RULE_VERSION} from "@/lib/quiz/quiz-bank";

export function aiRuntimeCapabilities(){
  const preferred=process.env.ORACLE_DEFAULT_PROVIDER?.trim();
  const provider=getProviderById(preferred||"")||
    getProviderById(DEFAULT_LLM_PROVIDER_ID);
  const keyPresent=Boolean(provider&&process.env[provider.envVar]?.trim());
  const voiceKey=Boolean(process.env.OPENAI_API_KEY?.trim());
  return {
    version:"summoner-ai-gateway-capabilities-v1",
    text:{
      route:"/api/agent/respond",
      providerId:provider?.id??"none",
      model:provider?.defaultModel??null,
      transport:keyPresent?"server-api":"local-safe-rules-only",
      configured:keyPresent,
    },
    speech:{
      route:"/api/transcribe",
      providerId:voiceKey?"openai":"browser-speech-preview",
      configured:voiceKey,
      transport:voiceKey?"server-api":"client-preview-manual-review",
      textReviewRequired:true,
    },
    quizGrading:{
      providerId:"deterministic",
      model:QUIZ_RULE_VERSION,
      transport:"local-curated-answer-bank",
      externalAiCalls:0,
      stakeCreditsAllowed:0,
    },
    subscriptionSharing:{
      availableInThisApp:false,
      reason:"No eligible Sign in with ChatGPT allowance-sharing integration has been installed or approved for Summoner.world",
    },
  } as const;
}
