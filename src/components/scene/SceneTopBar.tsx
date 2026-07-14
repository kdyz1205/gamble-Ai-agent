import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { sceneBrand } from "@/lib/scene/scene-brand";

interface SceneTopBarProps {
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function SceneTopBar({ title = sceneBrand.world, rightSlot }: SceneTopBarProps) {
  return (
    <header className="relative z-20 flex h-[72px] items-center justify-between border-b border-[color:var(--sum-border)] bg-white/82 px-4 shadow-[0_8px_30px_rgba(40,102,133,0.08)] backdrop-blur-xl sm:px-7">
      <Link href="/enter" className="group flex min-w-0 items-center gap-2.5" aria-label="Summoner.world home">
        <PicoFamiliar className="h-11 w-11 shrink-0 transition-transform group-hover:-translate-y-0.5" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold leading-tight text-[color:var(--sum-ink)] sm:text-base">
            Summoner<span className="text-[#e98648]">.world</span>
          </span>
          <span className="mt-0.5 block truncate text-[9px] font-extrabold uppercase tracking-[0.24em] text-[color:var(--sum-muted)]">
            {title}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2 text-xs font-bold text-[color:var(--sum-muted)]">
        {rightSlot ?? (
          <>
            <span className="hidden items-center gap-1.5 rounded-full border border-[color:var(--sum-border)] bg-white/80 px-3 py-2 sm:inline-flex">
              <span className="h-2 w-2 rounded-full bg-[color:var(--sum-mint)] shadow-[0_0_0_4px_rgba(143,230,193,0.18)]" />
              Pico is ready
            </span>
            <Link className="sum-world-button px-4 py-2 font-extrabold" href="/summons">
              + New quest
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
