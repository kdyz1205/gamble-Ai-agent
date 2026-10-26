import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestGlyph from "@/components/world/QuestGlyph";
import {SumLanguageSwitch,SumText} from "@/components/locale/SumLanguage";
import { sceneBrand } from "@/lib/scene/scene-brand";

interface SceneTopBarProps {
  /** Compatibility with the routed SUM scene shell. */
  activePath?: string;
  title?: string;
  rightSlot?: React.ReactNode;
}

export default function SceneTopBar({ title = sceneBrand.world, rightSlot, activePath }: SceneTopBarProps) {
  const site=activePath==="/"||activePath==="/enter";
  return (
    <header className="quest-hud" data-product-navigation={site?"marketing":"legacy"}>
      <Link href="/" className="group quest-hud__cluster min-w-0" aria-label="Summoner.world home">
        <PicoFamiliar className="h-11 w-11 shrink-0 transition-transform group-hover:-translate-y-0.5" />
        <span className="min-w-0 pr-1">
          <span className="block truncate text-sm font-black leading-tight text-[color:var(--sum-ink)] sm:text-base">
            Summoner<span className="text-[#e85f4e]">.world</span>
          </span>
          <span className="mt-0.5 block truncate text-[8px] font-black uppercase tracking-[0.22em] text-[color:var(--sum-muted)]">{title}</span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-2 text-xs font-extrabold text-[color:var(--sum-muted)]">
        {rightSlot ?? (
          <>
            {site&&<SumLanguageSwitch surface="site"/>}
            <span className="hidden items-center gap-2 rounded-full border-2 border-white/80 bg-white/60 px-3 py-2 shadow-[0_5px_0_rgba(23,53,75,0.06)] sm:inline-flex">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-[rgba(112,214,165,0.2)] text-[#157b58]"><QuestGlyph className="h-3.5 w-3.5" kind="spark" /></span>
              <SumText en="Meet Pico" zh="认识 Pico"/>
            </span>
            <Link aria-label={site ? "Open SUM Web App / 进入 SUM" : "New Quest / 创建 Quest"} className="sum-world-button inline-flex min-h-11 items-center gap-2 px-4 py-2 font-black" href={site ? "/app" : "/app/create"}>
              <QuestGlyph className="h-4 w-4" kind="spark" />
              <span className="inline"><SumText en={site?"Open SUM":"New Quest"} zh={site?"进入 SUM":"创建 Quest"}/></span>
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
