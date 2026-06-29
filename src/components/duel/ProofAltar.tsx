import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function ProofAltar() {
  return (
    <div className="flex min-h-[360px] items-center justify-center rounded-[38px]" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}`, boxShadow: sceneTokens.shadow.seal }}>
      <div className="h-32 w-24 rounded-[45%]" style={{ background: "linear-gradient(180deg, rgba(136,215,255,0.5), rgba(93,63,211,0.18))" }} />
    </div>
  );
}
