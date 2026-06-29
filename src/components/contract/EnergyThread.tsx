import { sceneTokens } from "@/lib/scene/scene-tokens";

interface EnergyThreadProps {
  side: "left" | "right";
}

export default function EnergyThread({ side }: EnergyThreadProps) {
  const left = side === "left";

  return (
    <div
      className={`pointer-events-none absolute top-[43%] hidden h-32 w-[27%] lg:block ${left ? "left-[26.5%]" : "right-[26.5%]"}`}
      aria-hidden
    >
      <div
        className={`absolute top-1/2 h-2 w-full rounded-full blur-[1px] ${left ? "left-0" : "right-0"}`}
        style={{
          background: left
            ? `linear-gradient(90deg, transparent, rgba(255,79,189,0.22), ${sceneTokens.color.gold}, rgba(255,232,174,0.68))`
            : `linear-gradient(90deg, rgba(216,189,255,0.68), ${sceneTokens.color.violet}, rgba(139,61,255,0.22), transparent)`,
          boxShadow: left ? "0 0 40px rgba(255,79,189,0.5)" : "0 0 42px rgba(139,61,255,0.42)",
          transform: left ? "rotate(9deg)" : "rotate(-9deg)",
          transformOrigin: left ? "right center" : "left center",
        }}
      />
      <div
        className={`absolute top-[38%] h-px w-full ${left ? "left-0" : "right-0"}`}
        style={{
          background: left
            ? "linear-gradient(90deg, transparent, rgba(255,143,220,0.74), transparent)"
            : "linear-gradient(90deg, transparent, rgba(186,126,255,0.7), transparent)",
          transform: left ? "rotate(-4deg)" : "rotate(4deg)",
          boxShadow: left ? sceneTokens.shadow.gold : "0 0 34px rgba(139,61,255,0.34)",
        }}
      />
      <div
        className={`absolute top-[calc(50%-14px)] h-7 w-7 rounded-full ${left ? "right-[-12px]" : "left-[-12px]"}`}
        style={{
          background: left
            ? "radial-gradient(circle, rgba(255,191,234,0.92), rgba(255,79,189,0.5), transparent 72%)"
            : "radial-gradient(circle, rgba(216,189,255,0.92), rgba(139,61,255,0.5), transparent 72%)",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: left ? sceneTokens.shadow.gold : "0 0 44px rgba(139,61,255,0.3)",
        }}
      />
      <div
        className="absolute inset-0 opacity-70 blur-md"
        style={{
          background: left
            ? "radial-gradient(ellipse at 70% 50%, rgba(255,79,189,0.22), transparent 58%)"
            : "radial-gradient(ellipse at 30% 50%, rgba(139,61,255,0.22), transparent 58%)",
        }}
      />
    </div>
  );
}
