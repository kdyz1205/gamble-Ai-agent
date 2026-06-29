"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { sceneMotion } from "@/lib/scene/scene-motion";

export default function SceneTransition({
  children,
  transitionKey,
}: {
  children: React.ReactNode;
  transitionKey?: string;
}) {
  const sceneKey = transitionKey ?? "scene";
  const reduceMotion = useReducedMotion();
  const [revealId, setRevealId] = useState(0);

  useEffect(() => {
    if (reduceMotion) return undefined;

    setRevealId((current) => current + 1);
    const timer = window.setTimeout(() => setRevealId(0), 1800);
    return () => window.clearTimeout(timer);
  }, [sceneKey, reduceMotion]);

  return (
    <div className="relative z-10 h-full overflow-hidden" data-testid="scene-transition-shell">
      <motion.div
        key={sceneKey}
        className="relative z-10 h-full"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, filter: "blur(5px)" }}
        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={reduceMotion ? { duration: 0.22 } : sceneMotion.page.transition}
      >
        {children}
      </motion.div>

      {!reduceMotion && revealId > 0 && (
        <div
          key={`reveal-${sceneKey}-${revealId}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-20 overflow-hidden"
          data-testid="scene-transition-reveal"
          style={{
            animation: "sceneTransitionReveal 1800ms cubic-bezier(0.18, 1, 0.28, 1) forwards",
          }}
        >
          <motion.div
            className="absolute left-[-12%] top-[15%] h-px w-[124%]"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,143,220,0.18), rgba(255,79,189,0.9), rgba(139,61,255,0.36), transparent)",
              boxShadow: "0 0 30px rgba(255,79,189,0.28)",
            }}
            initial={{ x: "-22%", opacity: 0.86 }}
            animate={{ x: "22%", opacity: 0 }}
            transition={{ duration: 2.15, ease: [0.18, 1, 0.28, 1] }}
          />
          <motion.div
            className="absolute left-[6%] top-0 h-full w-px"
            style={{
              background: "linear-gradient(180deg, transparent, rgba(255,79,189,0.62), transparent)",
              boxShadow: "0 0 26px rgba(255,79,189,0.24)",
            }}
            initial={{ y: "-24%", opacity: 0.58 }}
            animate={{ y: "24%", opacity: 0 }}
            transition={{ duration: 2.2, ease: [0.18, 1, 0.28, 1] }}
          />
          <motion.div
            className="absolute right-[9%] top-0 h-full w-px"
            style={{
              background: "linear-gradient(180deg, transparent, rgba(139,61,255,0.58), transparent)",
              boxShadow: "0 0 26px rgba(139,61,255,0.22)",
            }}
            initial={{ y: "24%", opacity: 0.5 }}
            animate={{ y: "-24%", opacity: 0 }}
            transition={{ duration: 2.2, ease: [0.18, 1, 0.28, 1] }}
          />
          <motion.div
            className="absolute left-1/2 top-[45%] h-[54vh] w-[54vh] max-w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              border: "1px solid rgba(255,143,220,0.24)",
              boxShadow: "0 0 82px rgba(255,79,189,0.14), inset 0 0 66px rgba(139,61,255,0.08)",
            }}
            initial={{ scale: 0.82, opacity: 0.34, rotate: -12 }}
            animate={{ scale: 1.18, opacity: 0, rotate: 18 }}
            transition={{ duration: 2.2, ease: [0.18, 1, 0.28, 1] }}
          />
          <motion.div
            className="absolute inset-x-[12%] bottom-[8%] h-px"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(0,240,181,0.16), rgba(255,79,189,0.72), transparent)",
              boxShadow: "0 0 34px rgba(255,79,189,0.24)",
            }}
            initial={{ scaleX: 0.16, opacity: 0.62 }}
            animate={{ scaleX: 0.86, opacity: 0 }}
            transition={{ duration: 1.9, ease: [0.18, 1, 0.28, 1] }}
          />
          <style>{`
            @keyframes sceneTransitionReveal {
              0% { opacity: 0.46; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
