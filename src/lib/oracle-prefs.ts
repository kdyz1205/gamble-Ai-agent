export const ORACLE_LS_PROVIDER = "oracle_llm_provider";
export const ORACLE_LS_MODEL = "oracle_llm_model";

/**
 * Read oracle UI prefs (client-only; safe to call from "use client" components).
 * Returns null for providerId when the user has NOT explicitly chosen one —
 * this way the server's ORACLE_DEFAULT_PROVIDER env var takes over (currently openai).
 * Previously we defaulted to "anthropic" here, which silently overrode the env.
 */
export function readOracleLlmPrefs(): { providerId: string | null; model: string | null } {
  if (typeof window === "undefined") {
    return { providerId: null, model: null };
  }
  const providerId = localStorage.getItem(ORACLE_LS_PROVIDER);
  const model = localStorage.getItem(ORACLE_LS_MODEL);
  return {
    providerId: providerId && providerId.trim() ? providerId.trim() : null,
    model: model && model.trim() ? model.trim() : null,
  };
}

export function writeOracleLlmPrefs(providerId: string, model: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ORACLE_LS_PROVIDER, providerId);
  localStorage.setItem(ORACLE_LS_MODEL, model);
}
