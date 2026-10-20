import Link from "next/link";
import { Arrow, SummonSigil } from "@/components/universe/WorldUI";

const destinations = [["/enter", "World"], ["/summons", "Summon"], ["/contracts/bind", "Pacts"], ["/duel/demo", "Proof"], ["/rituals", "Familiars"], ["/judgment/demo", "Chronicle"]] as const;
interface SceneTopBarProps { title?: string; rightSlot?: React.ReactNode; activePath?: string; }
export default function SceneTopBar({ rightSlot, activePath = "/enter" }: SceneTopBarProps) {
  return <header className="sw-header"><div className="sw-header__inner">
    <Link href="/enter" className="sw-brand" aria-label="Summoner.world home"><SummonSigil /><span><b>SUM</b><small>SUMMONER.WORLD</small></span></Link>
    <nav className="sw-desktop-nav" aria-label="Quest world navigation">{destinations.map(([href,label]) => <Link key={href} href={href} aria-current={activePath===href?"page":undefined}>{label}</Link>)}</nav>
    <div className="sw-header__actions">{rightSlot ?? <><Link className="sw-account-link" href="/me">My world</Link><Link className="sw-button sw-button--small" href="/summons">Summon <Arrow /></Link></>}</div>
  </div></header>;
}
