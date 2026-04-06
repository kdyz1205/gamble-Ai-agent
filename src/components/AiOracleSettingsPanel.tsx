"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LLM_PROVIDERS, getProviderById } from "@/lib/llm-providers";
import { readOracleLlmPrefs, writeOracleLlmPrefs } from "@/lib/oracle-prefs";

/**
 * Collapsed-by-default panel: pick LLM vendor + model for parse / AI judge calls.
 */
function initialOraclePrefs() {
  const p = readOracleLlmPrefs();
  const def = getProviderById(p.providerId);
  return {
    providerId: p.providerId,
    model: p.model ?? def?.defaultModel ?? "",
  };
}

export default function AiOracleSettingsPanel() {
  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState(() => initialOraclePrefs().providerId);
  const [model, setModel] = useState(() => initialOraclePrefs().model);

  const provider = getProviderById(providerId);

  const persist = useCallback((pid: string, m: string) => {
    writeOracleLlmPrefs(pid, m);
  }, []);

  const onProviderChange = (pid: string) => {
    setProviderId(pid);
    const def = getProviderById(pid);
    const nextModel = def?.defaultModel ?? "";
    setModel(nextModel);
    persist(pid, nextModel);
  };

  const onModelChange = (m: string) => {
    setModel(m);
    persist(providerId, m);
  };

  return (
    <div
      className="fixed left-4 z-30 max-w-[min(100vw-2rem,20rem)]"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
    >
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border border-border-subtle"
        style={{
          background: "rgba(8,8,20,0.92)",
          backdropFilter: "blur(12px)",
          color: "rgba(240,240,255,0.85)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
        }}
        whileTap={{ scale: 0.98 }}
        aria-expanded={open}
      >
        <span className="text-accent">⚖</span>
        <span>Oracle LLM</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-text-muted">
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: 6, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 overflow-hidden rounded-2xl border border-border-subtle"
            style={{
              background: "rgba(10,10,26,0.96)",
              backdropFilter: "blur(16px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
            }}
          >
            <div className="p-4 space-y-3 max-h-[min(70vh,22rem)] overflow-y-auto">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                Off-chain AI oracle backend (keys stay on server)
              </p>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-text-secondary">Provider</span>
                <select
                  value={providerId}
                  onChange={(e) => onProviderChange(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-semibold bg-bg-input border border-border-subtle text-text-primary"
                >
                  {LLM_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-bold text-text-secondary">Model id</span>
                <input
                  list={`models-${providerId}`}
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder={provider?.defaultModel ?? "model name"}
                  className="w-full rounded-xl px-3 py-2.5 text-xs font-medium bg-bg-input border border-border-subtle text-text-primary placeholder:text-text-muted"
                />
                {provider && provider.models.length > 0 && (
                  <datalist id={`models-${providerId}`}>
                    {provider.models.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </label>
              {provider && (
                <a
                  href={provider.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[10px] font-bold text-accent hover:underline"
                >
                  API docs →
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
