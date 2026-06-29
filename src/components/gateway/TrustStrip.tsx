import { sceneTokens } from "@/lib/scene/scene-tokens";

interface TrustStripProps {
  items: readonly string[];
}

export default function TrustStrip({ items }: TrustStripProps) {
  return (
    <div
      className="mx-auto grid max-w-3xl grid-cols-1 gap-2 rounded-3xl px-4 py-3 text-xs md:grid-cols-3"
      style={{
        background: "rgba(3,2,10,0.36)",
        border: `1px solid ${sceneTokens.color.line}`,
        color: sceneTokens.color.textMuted,
      }}
    >
      {items.map((item) => (
        <div key={item} className="flex items-center justify-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: sceneTokens.color.gold }} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}
