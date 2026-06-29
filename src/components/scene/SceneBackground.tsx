import ParticleField from "@/components/scene/ParticleField";
import SceneAtmosphereEffects from "@/components/scene/SceneAtmosphereEffects";
import SceneFog from "@/components/scene/SceneFog";
import { sceneTokens, type SceneTone } from "@/lib/scene/scene-tokens";

interface SceneBackgroundProps {
  tone?: SceneTone;
  particleCount?: number;
}

export default function SceneBackground({ tone = "gateway", particleCount = 72 }: SceneBackgroundProps) {
  const background =
    tone === "world"
      ? "radial-gradient(circle at 48% 18%, rgba(255,79,189,0.18), transparent 25%), radial-gradient(circle at 72% 46%, rgba(139,61,255,0.16), transparent 30%), radial-gradient(circle at 28% 62%, rgba(255,47,143,0.12), transparent 28%), linear-gradient(180deg, #030006 0%, #080012 44%, #030006 100%)"
      : tone === "contract"
        ? `radial-gradient(circle at 50% 48%, rgba(255,79,189,0.18), transparent 28%), linear-gradient(180deg, ${sceneTokens.color.void} 0%, ${sceneTokens.color.deep} 48%, ${sceneTokens.color.veil} 100%)`
        : `radial-gradient(circle at 50% 42%, rgba(255,79,189,0.16), transparent 32%), linear-gradient(180deg, ${sceneTokens.color.void} 0%, ${sceneTokens.color.deep} 48%, ${sceneTokens.color.veil} 100%)`;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{
        background,
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,79,189,0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(139,61,255,0.13) 1px, transparent 1px)",
          backgroundSize: "112px 112px",
          maskImage: "radial-gradient(circle at 50% 42%, black 0%, transparent 72%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 52% 18%, rgba(255,79,189,0.2), transparent 24%), radial-gradient(circle at 76% 64%, rgba(139,61,255,0.14), transparent 28%), radial-gradient(circle at 28% 62%, rgba(255,47,143,0.12), transparent 28%)",
          mixBlendMode: "screen",
          opacity: 0.9,
        }}
      />
      <SceneAtmosphereEffects className="hidden opacity-80 sm:block" />
      <SceneFog />
      <ParticleField count={particleCount} />
    </div>
  );
}
