import Link from "next/link";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import { sceneRoutes } from "@/lib/scene/scene-routes";

interface SceneMobileNavProps {
  active: string;
}

export default function SceneMobileNav({ active }: SceneMobileNavProps) {
  return (
    <nav aria-label="Quest world navigation" className="quest-mobile-dock lg:hidden">
      {sceneRoutes.map((route) => {
        const selected = route.href === active;
        return (
          <Link
            key={route.href}
            aria-current={selected ? "page" : undefined}
            aria-label={route.label}
            className="quest-nav-item px-1"
            data-active={selected ? "true" : "false"}
            href={route.href}
          >
            <SceneRouteGlyph className="h-4 w-4" href={route.href} />
            <span className="mt-1 max-w-full truncate text-[8px] font-black leading-tight sm:text-[9px]">{route.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
