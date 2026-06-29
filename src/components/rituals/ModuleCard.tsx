import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function ModuleCard({ name = "Module" }: { name?: string }) {
  return <div className="rounded-3xl p-4 text-sm" style={{ background: sceneTokens.color.panel, border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.text }}>{name}</div>;
}
