import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function GatewaySeal() {
  return (
    <div className="relative mx-auto h-[430px] w-[430px] max-w-[82vw]" data-testid="gateway-seal">
      <div
        className="absolute inset-[8%] rounded-[46%]"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(244,239,255,0.16), rgba(93,63,211,0.18) 42%, rgba(3,2,10,0.92) 72%)",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: sceneTokens.shadow.seal,
        }}
      />
      <div
        className="absolute left-1/2 top-[49%] h-[72%] w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-t-full"
        style={{
          background: "linear-gradient(180deg, rgba(5,3,14,0.26), rgba(3,2,10,0.96))",
          border: `1px solid ${sceneTokens.color.goldSoft}`,
          boxShadow: "inset 0 0 44px rgba(217,184,108,0.12)",
        }}
      />
      <div
        className="absolute left-1/2 top-[48%] h-[48%] w-[27%] -translate-x-1/2 -translate-y-1/2 rounded-t-full"
        style={{
          background: "radial-gradient(circle at 50% 18%, rgba(217,184,108,0.22), transparent 36%), rgba(3,2,10,0.78)",
          border: `1px solid rgba(217,184,108,0.48)`,
        }}
      />
      <div
        className="absolute left-1/2 top-[73%] h-[2px] w-[62%] -translate-x-1/2"
        style={{ background: `linear-gradient(90deg, transparent, ${sceneTokens.color.gold}, transparent)` }}
      />
      <div
        className="absolute left-1/2 top-[49%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: sceneTokens.color.gold,
          boxShadow: "0 0 34px rgba(217,184,108,0.45)",
        }}
      />
      <div
        className="absolute inset-x-[15%] bottom-[8%] h-14"
        style={{
          background: "linear-gradient(180deg, rgba(217,184,108,0.16), rgba(3,2,10,0))",
          clipPath: "polygon(12% 0, 88% 0, 100% 100%, 0 100%)",
        }}
      />
    </div>
  );
}
