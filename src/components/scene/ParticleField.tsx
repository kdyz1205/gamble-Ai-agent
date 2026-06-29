"use client";

import { motion } from "framer-motion";
import { createSceneParticles } from "@/lib/scene/scene-particles";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface ParticleFieldProps {
  count?: number;
}

export default function ParticleField({ count = 72 }: ParticleFieldProps) {
  const particles = createSceneParticles(count);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {particles.map((particle) => (
        <motion.span
          key={particle.id}
          className="absolute rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            opacity: particle.opacity,
            background:
              particle.kind === "sparkle"
                ? sceneTokens.color.gold
                : particle.kind === "event"
                  ? sceneTokens.color.cyan
                  : "rgba(244,239,255,0.7)",
            boxShadow:
              particle.kind === "dust"
                ? "none"
                : `0 0 14px ${particle.kind === "sparkle" ? sceneTokens.color.goldSoft : "rgba(136,215,255,0.24)"}`,
          }}
          animate={{
            x: [0, particle.driftX, 0],
            y: [0, particle.driftY, 0],
            opacity: [particle.opacity * 0.55, particle.opacity, particle.opacity * 0.55],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
