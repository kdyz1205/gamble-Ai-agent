import { DEFAULT_LLM_PROVIDER_ID } from "./llm-providers";

export const ORACLE_LS_PROVIDER = "oracle_llm_provider";
export const ORACLE_LS_MODEL = "oracle_llm_model";

/** Read oracle UI prefs (client-only; safe to call from "use client" components). */
export function readOracleLlmPrefs(): { providerId: string; model: string | null } {
  if (typeof window === "undefined") {
    return { providerId: DEFAULT_LLM_PROVIDER_ID, model: null };
  }
  const providerId = localStorage.getItem(ORACLE_LS_PROVIDER) || DEFAULT_LLM_PROVIDER_ID;
  const model = localStorage.getItem(ORACLE_LS_MODEL);
  return { providerId, model: model && model.trim() ? model.trim() : null };
}

export function writeOracleLlmPrefs(providerId: string, model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORACLE_LS_PROVIDER, providerId);
  localStorage.setItem(ORACLE_LS_MODEL, model);
}
