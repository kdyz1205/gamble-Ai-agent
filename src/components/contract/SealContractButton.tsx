"use client";

import { motion } from "framer-motion";
import { sceneMotion } from "@/lib/scene/scene-motion";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function SealContractButton() {
  return (
    <motion.button
      data-testid="seal-contract-button"
      type="button"
      className="relative isolate min-h-12 overflow-hidden rounded-full px-7 text-sm font-extrabold min-[1400px]:min-h-14 min-[1400px]:px-8 min-[1400px]:text-base sm:px-10 min-[1400px]:sm:px-14"
      style={{
        background: "linear-gradient(135deg, var(--sum-peach), var(--sum-sun))",
        border: "1px solid rgba(255,185,120,0.62)",
        color: "var(--sum-ink)",
        boxShadow: sceneTokens.shadow.gold,
      }}
      {...sceneMotion.ritualClick}
    >
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background: "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.28) 42%, transparent 58%)",
          opacity: 0.38,
        }}
      />
      <span
        aria-hidden
        className="absolute left-5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.72), rgba(255,216,107,0.28) 56%, transparent 72%)",
          border: "1px solid rgba(255,255,255,0.54)",
        }}
      />
      <span
        aria-hidden
        className="absolute right-5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.72), rgba(143,230,193,0.3) 56%, transparent 72%)",
          border: "1px solid rgba(255,255,255,0.54)",
        }}
      />
      <span className="relative z-10">Accept Quest</span>
    </motion.button>
  );
}
