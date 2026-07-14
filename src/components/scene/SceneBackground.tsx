import ParticleField from "@/components/scene/ParticleField";
import type { SceneTone } from "@/lib/scene/scene-tokens";

interface SceneBackgroundProps {
  tone?: SceneTone;
  particleCount?: number;
}

export default function SceneBackground({ tone = "gateway", particleCount = 72 }: SceneBackgroundProps) {
  const warmth = tone === "contract" ? "rgba(255,185,120,0.26)" : "rgba(255,216,107,0.24)";

  return (
    <div
      aria-hidden
      className="absolute inset-0 overflow-hidden"
      style={{
        background: `radial-gradient(circle at 76% 12%, ${warmth}, transparent 24%), radial-gradient(circle at 16% 28%, rgba(143,230,193,0.34), transparent 28%), linear-gradient(180deg, #dff5ff 0%, #eefaff 52%, #e9fbdc 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(rgba(78,148,171,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(78,148,171,0.09) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "linear-gradient(180deg, transparent, black 24%, black 82%, transparent)",
        }}
      />
      <div className="absolute -left-16 bottom-[-7rem] h-64 w-[46%] rounded-[50%] bg-[color:var(--sum-grass)] opacity-80 blur-[1px]" />
      <div className="absolute -right-20 bottom-[-8rem] h-72 w-[54%] rounded-[50%] bg-[color:var(--sum-mint)] opacity-48 blur-[1px]" />
      <div className="absolute left-[8%] top-[12%] h-6 w-24 rounded-full bg-white/70 blur-sm" />
      <div className="absolute right-[13%] top-[21%] h-8 w-32 rounded-full bg-white/72 blur-sm" />
      <ParticleField count={Math.min(particleCount, 38)} />
    </div>
  );
}
