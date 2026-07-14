import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import SceneRouteGlyph from "@/components/scene/SceneRouteGlyph";
import { sceneRoutes } from "@/lib/scene/scene-routes";

interface SceneSidebarProps {
  active: string;
}

export default function SceneSidebar({ active }: SceneSidebarProps) {
  return (
    <aside className="relative z-10 hidden h-[calc(100svh-72px)] w-[236px] shrink-0 self-start border-r border-[color:var(--sum-border)] bg-white/72 px-4 py-6 backdrop-blur-xl lg:flex lg:flex-col">
      <div className="sum-world-panel mb-5 flex items-center gap-3 p-3">
        <PicoFamiliar className="h-14 w-14 shrink-0" />
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[color:var(--sum-muted)]">Your Familiar</p>
          <p className="mt-1 text-base font-extrabold text-[color:var(--sum-ink)]">Pico</p>
          <p className="text-[11px] font-semibold text-[color:var(--sum-muted)]">Proof scout</p>
        </div>
      </div>

      <nav aria-label="Quest world navigation" className="space-y-2">
        {sceneRoutes.map((route) => {
          const selected = route.href === active;
          return (
            <Link
              key={route.href}
              href={route.href}
              aria-current={selected ? "page" : undefined}
              className="group flex items-center gap-3 rounded-[18px] border px-3 py-3 transition hover:-translate-y-0.5"
              style={{
                background: selected ? "linear-gradient(135deg, rgba(255,216,107,0.72), rgba(255,185,120,0.5))" : "rgba(255,255,255,0.62)",
                borderColor: selected ? "rgba(255,185,120,0.58)" : "var(--sum-border)",
                boxShadow: selected ? "0 10px 24px rgba(255,164,96,0.18)" : "none",
              }}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/80 text-[color:var(--sum-ink)]">
                <SceneRouteGlyph className="h-4 w-4" href={route.href} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-[color:var(--sum-ink)]">{route.label}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-[color:var(--sum-muted)]">{route.phase}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[20px] border border-[color:var(--sum-border)] bg-[rgba(143,230,193,0.2)] p-4">
        <p className="text-xs font-extrabold text-[color:var(--sum-ink)]">How Pico helps</p>
        <p className="mt-1.5 text-[11px] font-semibold leading-5 text-[color:var(--sum-muted)]">
          Pico turns your sentence into fair rules, checks proof, and explains the result.
        </p>
      </div>
    </aside>
  );
}
