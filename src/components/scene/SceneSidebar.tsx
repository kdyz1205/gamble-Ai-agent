import Link from "next/link";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import { sceneRoutes } from "@/lib/scene/scene-routes";

interface SceneSidebarProps {
  active: string;
}

export default function SceneSidebar({ active }: SceneSidebarProps) {
  return (
    <aside className="quest-nav-rail relative z-10 hidden lg:block">
      <nav aria-label="Quest world navigation">
        {sceneRoutes.map((route) => {
          const selected = route.href === active;
          return (
            <Link
              key={route.href}
              href={route.href}
              aria-current={selected ? "page" : undefined}
              className="quest-nav-item"
              data-active={selected ? "true" : "false"}
            >
              <SceneRouteGlyph className="h-5 w-5" href={route.href} />
              <span className="mt-1 block">{route.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
