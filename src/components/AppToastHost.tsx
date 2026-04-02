"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { APP_TOAST_EVENT } from "@/lib/app-toast";

export default function AppToastHost() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let hide: number | undefined;
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{ message?: string }>;
      const m = ce.detail?.message?.trim();
      if (!m) return;
      if (hide) clearTimeout(hide);
      setMsg(m);
      hide = window.setTimeout(() => setMsg(null), 5200);
    };
    window.addEventListener(APP_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(APP_TOAST_EVENT, onToast);
      if (hide) clearTimeout(hide);
    };
  }, []);

  return (
    <AnimatePresence>
      {msg && (
        <motion.div
          className="fixed bottom-24 left-1/2 z-[60] max-w-md px-4"
          style={{ translateX: "-50%" }}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: "spring", damping: 24, stiffness: 320 }}
        >
          <div
            className="rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl"
            style={{
              background: "linear-gradient(135deg, rgba(124,92,252,0.95), rgba(0,212,200,0.9))",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.12)",
            }}
          >
            {msg}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
