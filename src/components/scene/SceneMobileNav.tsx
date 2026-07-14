import Link from "next/link";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import { sceneRoutes } from "@/lib/scene/scene-routes";

interface SceneMobileNavProps {
  active: string;
}

export default function SceneMobileNav({ active }: SceneMobileNavProps) {
  return (
    <nav aria-label="Quest world navigation" className="relative z-20 mx-3 mt-3 grid grid-cols-6 gap-1 rounded-[20px] border border-[color:var(--sum-border)] bg-white/86 p-1.5 shadow-[0_12px_30px_rgba(40,102,133,0.1)] backdrop-blur-xl lg:hidden">
      {sceneRoutes.map((route) => {
        const selected = route.href === active;
        return (
          <Link
            key={route.href}
            aria-current={selected ? "page" : undefined}
            aria-label={route.label}
            className="grid min-h-14 place-items-center rounded-2xl px-1 transition"
            href={route.href}
            style={{
              background: selected ? "linear-gradient(135deg, var(--sum-sun), var(--sum-peach))" : "transparent",
              color: "var(--sum-ink)",
            }}
          >
            <SceneRouteGlyph className="h-4 w-4" href={route.href} />
            <span className="mt-1 max-w-full truncate text-[8px] font-extrabold leading-tight sm:text-[9px]">{route.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
