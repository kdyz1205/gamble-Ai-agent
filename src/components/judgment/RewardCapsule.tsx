import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function RewardCapsule() {
  return <div className="rounded-full px-6 py-4 text-center text-sm" style={{ background: "rgba(217,184,108,0.12)", border: `1px solid ${sceneTokens.color.goldSoft}`, color: sceneTokens.color.text }}>Reward capsule sealed.</div>;
}
