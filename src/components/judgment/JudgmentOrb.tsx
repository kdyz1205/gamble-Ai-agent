import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function JudgmentOrb() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[38px]" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}` }}>
      <div className="h-36 w-36 rounded-full" style={{ background: "radial-gradient(circle, rgba(244,239,255,0.86), rgba(93,63,211,0.3) 48%, rgba(3,2,10,0.64))", boxShadow: sceneTokens.shadow.seal }} />
    </div>
  );
}
