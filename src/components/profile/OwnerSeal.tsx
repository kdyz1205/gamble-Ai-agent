import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function OwnerSeal() {
  return <div className="h-40 w-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(217,184,108,0.34), rgba(3,2,10,0.72))", border: `1px solid ${sceneTokens.color.goldSoft}`, boxShadow: sceneTokens.shadow.seal }} />;
}
