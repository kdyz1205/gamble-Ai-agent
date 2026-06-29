import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function EvidenceTimeline() {
  return (
    <div className="rounded-[28px] p-5 text-sm" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.textMuted }}>
      Proof timeline opens when proof is submitted.
    </div>
  );
}
