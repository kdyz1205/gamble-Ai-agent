import Link from "next/link";
import QuixMark from "@/components/scene/QuixMark";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import SummonerSigil from "@/components/scene/SummonerSigil";
import { sceneBrand } from "@/lib/scene/scene-brand";
import { sceneRoutes } from "@/lib/scene/scene-routes";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface SceneSidebarProps {
  active: string;
}

export default function SceneSidebar({ active }: SceneSidebarProps) {
  return (
    <aside
      className="relative z-10 hidden h-[calc(100svh-72px)] w-[236px] shrink-0 self-start overflow-hidden px-4 py-6 lg:flex lg:flex-col"
      style={{
        background:
          "linear-gradient(180deg, rgba(10,0,18,0.9), rgba(4,0,10,0.76)), radial-gradient(circle at 50% 0%, rgba(255,79,189,0.16), transparent 36%)",
        borderRight: `1px solid ${sceneTokens.color.line}`,
        backdropFilter: "blur(22px)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(255,143,220,0.56), rgba(0,240,181,0.2), transparent)",
          boxShadow: "0 0 32px rgba(255,79,189,0.22)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-28 w-28 -translate-x-1/2 rounded-full blur-3xl"
        style={{ background: "rgba(255,79,189,0.12)" }}
      />

      <div className="relative mb-8 px-3">
        <div
          className="mx-auto grid h-16 w-16 place-items-center rounded-full text-2xl"
          style={{
            background:
              "radial-gradient(circle, rgba(255,143,220,0.46), rgba(255,79,189,0.18) 48%, rgba(139,61,255,0.08) 72%, transparent 76%)",
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: "0 0 54px rgba(255,79,189,0.28), inset 0 0 18px rgba(244,239,255,0.08)",
            color: sceneTokens.color.gold,
          }}
        >
          <QuixMark className="h-9 w-9" />
        </div>
        <p className="mt-3 text-center text-2xl font-semibold leading-[1.12]" style={{ color: sceneTokens.color.text }}>
          Summoner<span style={{ color: sceneTokens.color.gold }}>.world</span>
        </p>
        <p className="mt-2 text-center text-[9px] font-semibold uppercase tracking-[0.36em]" style={{ color: sceneTokens.color.textMuted }}>
          {sceneBrand.world}
        </p>
        <div
          aria-hidden
          className="mx-auto mt-5 h-px w-24"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(255,79,189,0.62), rgba(0,240,181,0.24), transparent)",
          }}
        />
      </div>

      <nav className="relative space-y-2">
        {sceneRoutes.map((route) => {
          const selected = route.href === active;
          return (
            <Link
              key={route.href}
              href={route.href}
              aria-current={selected ? "page" : undefined}
              className="group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-3 transition duration-300 hover:bg-white/[0.035]"
              style={{
                background: selected
                  ? "linear-gradient(90deg, rgba(255,79,189,0.24), rgba(139,61,255,0.1) 58%, rgba(0,240,181,0.04))"
                  : "transparent",
                border: `1px solid ${selected ? sceneTokens.color.lineStrong : "transparent"}`,
                boxShadow: selected ? "0 0 38px rgba(255,79,189,0.13) inset, 0 12px 38px rgba(0,0,0,0.18)" : "none",
                color: selected ? sceneTokens.color.text : sceneTokens.color.textMuted,
              }}
            >
              {selected && (
                <>
                  <span
                    aria-hidden
                    className="absolute inset-y-2 left-0 w-0.5 rounded-full"
                    style={{
                      background: "linear-gradient(180deg, rgba(255,143,220,0.2), rgba(255,79,189,0.98), rgba(0,240,181,0.5))",
                      boxShadow: "0 0 20px rgba(255,79,189,0.72)",
                    }}
                  />
                  <span
                    aria-hidden
                    className="absolute inset-x-3 top-0 h-px"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.42), transparent)" }}
                  />
                </>
              )}
              <span
                className="relative grid h-8 w-8 shrink-0 place-items-center rounded-md text-[10px] font-bold uppercase transition duration-300 group-hover:scale-[1.04]"
                style={{
                  border: `1px solid ${selected ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
                  background: selected
                    ? "radial-gradient(circle, rgba(255,143,220,0.28), rgba(255,79,189,0.13) 64%, rgba(5,0,10,0.7))"
                    : "rgba(244,239,255,0.03)",
                  color: selected ? sceneTokens.color.gold : sceneTokens.color.textFaint,
                  boxShadow: selected ? "0 0 24px rgba(255,79,189,0.18)" : "none",
                }}
              >
                <SceneRouteGlyph className="h-4 w-4" href={route.href} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold leading-tight">{route.label}</span>
                <span className="mt-1.5 block text-[10px]" style={{ color: sceneTokens.color.textFaint }}>
                  {route.phase}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div
        className="relative mt-auto overflow-hidden rounded-lg p-4"
        style={{
          border: `1px solid ${sceneTokens.color.line}`,
          background: "linear-gradient(180deg, rgba(244,239,255,0.052), rgba(5,0,10,0.28))",
          boxShadow: "inset 0 1px 0 rgba(244,239,255,0.05)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-4 top-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(0,240,181,0.28), rgba(255,79,189,0.3), transparent)" }}
        />
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(255,79,189,0.34), rgba(139,61,255,0.12) 62%, transparent 72%)",
              border: `1px solid ${sceneTokens.color.lineStrong}`,
              color: sceneTokens.color.gold,
              boxShadow: "0 0 28px rgba(255,79,189,0.2)",
            }}
          >
            <SummonerSigil className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold" style={{ color: sceneTokens.color.text }}>Summoner</p>
            <p className="text-xs" style={{ color: sceneTokens.color.textMuted }}>Level 42</p>
          </div>
        </div>
        <div className="mt-4 h-1 overflow-hidden rounded-full" style={{ background: "rgba(244,239,255,0.08)" }}>
          <div className="h-full w-[72%]" style={{ background: sceneTokens.color.gold, boxShadow: sceneTokens.shadow.gold }} />
        </div>
        <div
          className="mt-4 rounded-md px-3 py-2 text-xs font-semibold"
          style={{ border: "1px solid rgba(0,240,181,0.24)", background: "rgba(0,240,181,0.07)", color: sceneTokens.color.cyan }}
        >
          {sceneBrand.status}
        </div>
      </div>
    </aside>
  );
}
