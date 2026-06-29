import Link from "next/link";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import { sceneRoutes } from "@/lib/scene/scene-routes";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface SceneMobileNavProps {
  active: string;
}

export default function SceneMobileNav({ active }: SceneMobileNavProps) {
  return (
    <nav
      aria-label="Scene navigation"
      className="relative z-20 mx-3 mt-3 grid grid-cols-6 gap-1 overflow-hidden rounded-lg p-1.5 lg:hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(13,2,24,0.92), rgba(4,0,10,0.94)), radial-gradient(circle at 50% 0%, rgba(255,79,189,0.16), transparent 42%)",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: "0 18px 70px rgba(0,0,0,0.54), 0 0 46px rgba(255,79,189,0.12), inset 0 1px 0 rgba(244,239,255,0.05)",
        backdropFilter: "blur(22px)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.46), rgba(0,240,181,0.2), transparent)" }}
      />
      {sceneRoutes.map((route) => {
        const selected = route.href === active;
        return (
          <Link
            key={route.href}
            aria-current={selected ? "page" : undefined}
            aria-label={route.label}
            className="relative grid min-h-14 place-items-center overflow-hidden rounded-md px-1 transition duration-300"
            href={route.href}
            style={{
              background: selected
                ? "linear-gradient(180deg, rgba(255,79,189,0.25), rgba(139,61,255,0.13) 62%, rgba(0,240,181,0.035))"
                : "rgba(244,239,255,0.025)",
              border: `1px solid ${selected ? sceneTokens.color.lineStrong : "transparent"}`,
              color: selected ? sceneTokens.color.text : sceneTokens.color.textMuted,
              boxShadow: selected ? "inset 0 1px 0 rgba(244,239,255,0.06), 0 0 24px rgba(255,79,189,0.1)" : "none",
            }}
          >
            {selected && (
              <span
                aria-hidden
                className="absolute inset-x-2 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.58), transparent)" }}
              />
            )}
            <span
              className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold uppercase"
              style={{
                background: selected
                  ? "radial-gradient(circle, rgba(255,143,220,0.26), rgba(255,79,189,0.13) 66%, rgba(5,0,10,0.72))"
                  : "rgba(5,0,10,0.6)",
                color: selected ? sceneTokens.color.gold : sceneTokens.color.textFaint,
                boxShadow: selected ? "0 0 26px rgba(255,79,189,0.22)" : "none",
              }}
            >
                <SceneRouteGlyph className="h-4 w-4" href={route.href} />
              </span>
            <span className="mt-1 max-w-full truncate text-[8px] font-semibold leading-tight sm:text-[9px]">
              {route.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
