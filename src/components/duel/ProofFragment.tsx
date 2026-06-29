import { sceneTokens } from "@/lib/scene/scene-tokens";

export default function ProofFragment({ label = "Proof Fragment" }: { label?: string }) {
  return (
    <div className="rounded-2xl px-4 py-3 text-sm" style={{ background: "rgba(136,215,255,0.1)", border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.text }}>
      {label}
    </div>
  );
}
