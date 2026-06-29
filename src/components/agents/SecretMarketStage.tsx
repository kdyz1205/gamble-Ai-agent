import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function SecretMarketStage() {
  return <div className="min-h-[360px] rounded-[38px] p-6" style={{ background: sceneTokens.color.panelStrong, border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.text }}>Private arena ready.</div>;
}
