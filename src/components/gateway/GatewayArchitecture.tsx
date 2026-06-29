import GatewaySeal from "@/components/gateway/GatewaySeal";
import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function GatewayArchitecture() {
  return (
    <div className="relative flex min-h-[560px] items-center justify-center" data-testid="gateway-architecture">
      <Pillar side="left" />
      <Pillar side="right" />
      <div
        className="absolute bottom-8 left-1/2 h-[84px] w-[72%] -translate-x-1/2"
        style={{
          background: "linear-gradient(180deg, rgba(217,184,108,0.16), rgba(3,2,10,0))",
          clipPath: "polygon(18% 0, 82% 0, 100% 100%, 0 100%)",
          borderTop: `1px solid ${sceneTokens.color.goldSoft}`,
        }}
      />
      <GatewaySeal />
    </div>
  );
}

function Pillar({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={`absolute top-20 hidden h-[410px] w-[88px] md:block ${side === "left" ? "left-[8%]" : "right-[8%]"}`}
      style={{
        background: "linear-gradient(180deg, rgba(244,239,255,0.12), rgba(28,16,64,0.2) 38%, rgba(3,2,10,0.78))",
        border: `1px solid ${sceneTokens.color.line}`,
        boxShadow: "inset 0 0 40px rgba(0,0,0,0.34)",
        clipPath: "polygon(22% 0, 78% 0, 100% 100%, 0 100%)",
      }}
    />
  );
}
