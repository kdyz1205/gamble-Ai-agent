import Link from "next/link";
import QuixMark from "@/components/scene/QuixMark";
import { sceneBrand } from "@/lib/scene/scene-brand";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface SceneTopBarProps {
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function SceneTopBar({ title = sceneBrand.world, rightSlot }: SceneTopBarProps) {
  return (
    <header
      className="relative z-20 flex h-[72px] items-center justify-between overflow-hidden px-4 sm:px-7"
      style={{
        background:
          "linear-gradient(90deg, rgba(3,0,8,0.88), rgba(12,2,24,0.58), rgba(3,0,8,0.78)), radial-gradient(circle at 50% 0%, rgba(255,79,189,0.12), transparent 34%)",
        borderBottom: `1px solid ${sceneTokens.color.line}`,
        backdropFilter: "blur(22px)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.34), rgba(0,240,181,0.18), transparent)",
          boxShadow: "0 0 28px rgba(255,79,189,0.18)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[18%] top-0 h-px w-44"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,79,189,0.54), transparent)" }}
      />

      <Link href="/enter" className="group relative flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-full text-lg transition duration-300 group-hover:scale-[1.04]"
          style={{
            background: "radial-gradient(circle, rgba(255,143,220,0.38), rgba(255,79,189,0.16) 58%, rgba(139,61,255,0.08) 74%, transparent 78%)",
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: "0 0 34px rgba(255,79,189,0.26), inset 0 0 14px rgba(244,239,255,0.08)",
            color: sceneTokens.color.gold,
          }}
        >
          <QuixMark className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold leading-tight" style={{ color: sceneTokens.color.text }}>
            Quix<span style={{ color: sceneTokens.color.gold }}>Nova</span>
          </span>
          <span className="mt-1 block text-[8px] font-semibold uppercase tracking-[0.34em]" style={{ color: sceneTokens.color.textMuted }}>
            {title}
          </span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2 text-xs" style={{ color: sceneTokens.color.textMuted }}>
        {rightSlot ?? (
          <>
            <span
              className="hidden rounded-full px-3 py-1.5 sm:inline-flex"
              style={{
                border: `1px solid ${sceneTokens.color.line}`,
                background: "linear-gradient(180deg, rgba(244,239,255,0.06), rgba(244,239,255,0.02))",
                boxShadow: "inset 0 1px 0 rgba(244,239,255,0.05)",
              }}
            >
              Lore
            </span>
            <span
              className="rounded-full px-3 py-1.5 font-semibold uppercase tracking-[0.16em]"
              style={{
                border: "1px solid rgba(0,240,181,0.3)",
                background: "linear-gradient(180deg, rgba(0,240,181,0.11), rgba(0,240,181,0.045))",
                color: sceneTokens.color.cyan,
                boxShadow: "0 0 26px rgba(0,240,181,0.08), inset 0 1px 0 rgba(244,239,255,0.05)",
              }}
            >
              {sceneBrand.status}
            </span>
          </>
        )}
      </div>
    </header>
  );
}
