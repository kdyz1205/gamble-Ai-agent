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
        background: `radial-gradient(circle at 76% 12%, ${warmth}, transparent 24%), radial-gradient(circle at 16% 28%, rgba(112,214,165,0.3), transparent 28%), linear-gradient(180deg, #c8efff 0%, #effcff 52%, #effbdc 100%)`,
      }}
    >
      <div className="absolute -left-16 bottom-[-8rem] h-72 w-[52%] rounded-[50%] bg-[color:var(--sum-grass)] opacity-90" />
      <div className="absolute -right-20 bottom-[-10rem] h-80 w-[58%] rounded-[50%] bg-[color:var(--sum-mint)] opacity-58" />
      <div className="absolute left-[7%] top-[13%] h-6 w-28 rounded-full bg-white/72 shadow-[42px_7px_0_5px_rgba(255,255,255,0.54)]" />
      <div className="absolute right-[12%] top-[23%] h-8 w-36 rounded-full bg-white/74 shadow-[-28px_5px_0_3px_rgba(255,255,255,0.46)]" />
      <div className="absolute right-[7%] top-[9%] h-20 w-20 rounded-full bg-[color:var(--sum-sun)] opacity-70 shadow-[0_0_0_18px_rgba(255,216,95,0.13)]" />
      <ParticleField count={Math.min(particleCount, 38)} />
    </div>
  );
}
