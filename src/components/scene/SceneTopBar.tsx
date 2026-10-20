import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { ArrowMark } from "@/components/world/EditorialMarks";

const destinations = [
  ["/enter", "World"], ["/summons", "Create"], ["/contracts/bind", "Rules"],
  ["/duel/demo", "Proof"], ["/rituals", "Pico"], ["/judgment/demo", "Results"],
] as const;

interface SceneTopBarProps { title?: string; rightSlot?: React.ReactNode; activePath?: string; }
export default function SceneTopBar({ rightSlot, activePath = "/enter" }: SceneTopBarProps) {
  return (
    <header className="ed-header">
      <div className="ed-header__inner">
        <Link href="/enter" className="ed-brand" aria-label="Summoner.world home">
          <PicoFamiliar className="ed-brand__pico" />
          <span>summoner<span className="ed-brand__suffix">.world</span></span>
        </Link>
        <nav className="ed-desktop-nav" aria-label="Quest world navigation">
          {destinations.map(([href, label]) => <Link key={href} href={href} aria-current={activePath === href ? "page" : undefined}>{label}</Link>)}
        </nav>
        <div className="ed-header__actions">
          {rightSlot ?? <Link href="/summons" className="ed-button ed-button--small ed-button--ink">New quest <ArrowMark /></Link>}
        </div>
      </div>
    </header>
  );
}
