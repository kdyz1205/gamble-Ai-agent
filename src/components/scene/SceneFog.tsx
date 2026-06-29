import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function SceneFog() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.2]"
        style={{
          backgroundImage: "url('/scene/premium/fog-veil.png')",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          mixBlendMode: "screen",
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 h-[36%]"
        style={{
          background: `linear-gradient(180deg, transparent, rgba(3,2,10,0.62) 42%, ${sceneTokens.color.void} 100%)`,
        }}
      />
    </div>
  );
}
