import Link from "next/link";
import type { ReactNode } from "react";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import {SumText} from "@/components/locale/SumLanguage";

export function Arrow({ className = "" }: { className?: string }) {
  return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SummonSigil({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 3 43 14v20L24 45 5 34V14L24 3Z" stroke="currentColor" strokeWidth="1.5" /><path d="M24 10v28M12 17l24 14M12 31l24-14" stroke="currentColor" strokeWidth="1.2" opacity=".55" /><path d="m24 13 4 7 8 4-8 4-4 7-4-7-8-4 8-4 4-7Z" fill="currentColor" /><circle cx="24" cy="24" r="3" fill="var(--sw-paper,#f6faf8)" /></svg>;
}

export function WorldGlyph({ kind = "spark" }: { kind?: "spark" | "move" | "craft" | "grow" | "proof" | "pact" | "chronicle" }) {
  const paths = {
    spark: <path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3Z" />,
    move: <><path d="M5 18h14M8 15l4-7 3 4 4 1M4 12l4-1 3-5" /><circle cx="15" cy="4" r="1.7" /><path d="m12 12 3 5" /></>,
    craft: <><path d="m4 17 11-11 4 4L8 21H4v-4ZM13 8l4 4M17 3l4 4" /><path d="M3 5h5M5.5 2.5v5" /></>,
    grow: <><path d="M12 21v-9M12 14C4 15 3 8 3 8c8-1 10 3 9 6ZM12 11c-1-8 8-9 8-9s1 9-8 9Z" /></>,
    proof: <><rect x="4" y="5" width="16" height="15" rx="3" /><circle cx="12" cy="12" r="3.5" /><path d="M8 5 9 3h6l1 2" /></>,
    pact: <><path d="m3 8 5-4 4 2 4-2 5 4-2 7-6 5-4-1-6-5V8Z" /><path d="m8 10 4-4 5 5-3 3-3-2M7 14l5 4" /></>,
    chronicle: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></>,
  };
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="sw-eyebrow"><span className="sw-mini-sigil" aria-hidden="true">✧</span>{children}</p>;
}

export function PageIntro({ number, location, title, accent, children, example = false }: { number: string; location: string; title: string; accent: string; children: ReactNode; example?: boolean }) {
  return <header className="sw-page-intro"><div><Eyebrow>{number} / {location}</Eyebrow><h1>{title}<br /><span>{accent}</span></h1></div><div className="sw-page-intro__description"><p>{children}</p>{example && <span className="sw-example-label">Illustrative walkthrough · not a live quest</span>}</div></header>;
}

export function QuestJourney({ current = 0 }: { current?: number }) {
  const steps = [["/summons", "Summon", "Give your idea a form"], ["/contracts/bind", "Make a pact", "Agree before you begin"], ["/duel/demo", "Offer proof", "Bring the moment back"], ["/judgment/demo", "Keep the story", "A result with a reason"]];
  return <nav className="sw-journey" aria-label="Explore the quest journey">{steps.map(([href, title, detail], index) => <Link key={href} href={href} className={index === current ? "is-current" : ""} aria-current={index === current ? "page" : undefined}><span className="sw-journey__number">0{index + 1}</span><span><strong>{title}</strong><small>{detail}</small></span>{index < steps.length - 1 && <span className="sw-journey__connector" aria-hidden="true" />}</Link>)}</nav>;
}

export function FamiliarNote({ title, children, mood = "guide" }: { title: string; children: ReactNode; mood?: "guide" | "referee" | "celebrate" }) {
  return <aside className="sw-familiar-note"><PicoFamiliar mood={mood} /><div><span className="sw-small-label">Pico · Your AI Familiar</span><h3>{title}</h3><p>{children}</p></div></aside>;
}

export function WorldFooter() {
  return <footer className="sw-footer"><Link href="/" className="sw-footer__brand"><SummonSigil /><span>SUM<span>SUMMONER.WORLD</span></span></Link><p><SumText en="Real life. Your quests. A Familiar by your side." zh="真实生活，专属 Quest，还有 Pico 陪伴左右。"/></p><nav aria-label="Policies and support"><Link href="/privacy"><SumText en="Privacy" zh="隐私政策"/></Link><Link href="/terms"><SumText en="Terms" zh="使用条款"/></Link><Link href="/support"><SumText en="Support" zh="帮助与支持"/></Link></nav></footer>;
}
