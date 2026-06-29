import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function DeployedFamiliars() {
  return <div className="rounded-[30px] p-5" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.textMuted }}>No Familiars deployed.</div>;
}
