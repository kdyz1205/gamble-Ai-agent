"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { sceneMotion } from "@/lib/scene/scene-motion";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface RitualButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: ReactNode;
  variant?: "primary" | "ghost";
}

export default function RitualButton({
  children,
  className = "",
  disabled,
  style,
  variant = "primary",
  ...props
}: RitualButtonProps) {
  const primary = variant === "primary";

  return (
    <motion.button
      className={`relative isolate overflow-hidden rounded-full font-extrabold outline-none transition disabled:cursor-not-allowed disabled:opacity-45 focus-visible:ring-4 focus-visible:ring-[rgba(255,185,120,0.36)] ${className}`}
      disabled={disabled}
      style={{
        background: primary
          ? "linear-gradient(135deg, var(--sum-peach), var(--sum-sun))"
          : "rgba(255,255,255,0.74)",
        border: `1px solid ${primary ? "rgba(255,185,120,0.62)" : sceneTokens.color.line}`,
        boxShadow: primary && !disabled ? sceneTokens.shadow.gold : "none",
        color: sceneTokens.color.text,
        ...style,
      }}
      {...(!disabled ? sceneMotion.hoverLift : {})}
      {...props}
    >
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        initial={false}
        style={{
          background: primary
            ? "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.24) 42%, transparent 58%)"
            : "radial-gradient(circle at 50% 50%, rgba(143,230,193,0.2), transparent 64%)",
          opacity: primary ? 0.42 : 0.2,
          x: "-120%",
        }}
        whileHover={!disabled ? { x: "120%" } : undefined}
        transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
      />
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
