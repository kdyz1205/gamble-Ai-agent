"use client";

import { motion } from "framer-motion";
import { sceneMotion } from "@/lib/scene/scene-motion";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function SealContractButton() {
  return (
    <motion.button
      data-testid="seal-contract-button"
      type="button"
      className="relative isolate min-h-12 overflow-hidden rounded-md px-7 text-sm font-semibold uppercase tracking-[0.2em] min-[1400px]:min-h-14 min-[1400px]:px-8 min-[1400px]:text-base sm:px-10 min-[1400px]:sm:px-14"
      style={{
        background:
          `linear-gradient(90deg, rgba(255,79,189,0.92), ${sceneTokens.color.gold}, ${sceneTokens.color.violet})`,
        border: "1px solid rgba(255,206,239,0.62)",
        color: "#fff7fd",
        boxShadow: "0 0 62px rgba(255,79,189,0.5), 0 14px 58px rgba(0,0,0,0.4), inset 0 0 24px rgba(255,255,255,0.12)",
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
          background: "radial-gradient(circle, rgba(255,255,255,0.42), rgba(255,79,189,0.16) 56%, transparent 72%)",
          border: "1px solid rgba(255,255,255,0.2)",
        }}
      />
      <span
        aria-hidden
        className="absolute right-5 top-1/2 h-7 w-7 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.36), rgba(139,61,255,0.18) 56%, transparent 72%)",
          border: "1px solid rgba(255,255,255,0.18)",
        }}
      />
      <span className="relative z-10">Accept Quest</span>
    </motion.button>
  );
}
