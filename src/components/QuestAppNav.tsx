"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {appDestinations,activeAppDestination,hasInformationalNavigation,legacySceneOwnsNavigation} from "@/lib/app-navigation";
import {useSumLanguage,translated} from "@/components/locale/SumLanguage";

const destinations=appDestinations.map(item=>({...item,icon:item.icon==="home"?"world":item.icon==="discover"?"explore":item.icon==="user"?"me":item.icon} as const));

type IconKind = (typeof destinations)[number]["icon"];

function NavIcon({ kind }: { kind: IconKind }) {
  if (kind === "pico") {
    return <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M8 9 5 4Q11 3 13 8M20 9l3-5q-6-1-8 4" fill="#bceac6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M3.5 17Q4 8.5 14 8.5T24.5 17q0 8-10.5 8T3.5 17Z" fill="#fffdf5" stroke="currentColor" strokeWidth="1.5"/>
      <ellipse cx="10" cy="16.5" rx="1.8" ry="2.5" fill="#313b48"/><ellipse cx="18" cy="16.5" rx="1.8" ry="2.5" fill="#313b48"/>
      <path d="M12 20q2 2 4 0" stroke="#9c6e72" strokeLinecap="round" strokeWidth="1.5"/>
      <circle cx="6.5" cy="20" r="2" fill="#ffc2c8" opacity=".9"/><circle cx="21.5" cy="20" r="2" fill="#ffc2c8" opacity=".9"/>
    </svg>;
  }
  const paths = {
    world: <><path d="M4 12 14 3l10 9v12H4V12Z"/><path d="M10 24V14q4-5 8 0v10"/><path d="M19 7l1-3 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="currentColor" stroke="none"/></>,
    explore: <><circle cx="14" cy="14" r="10"/><path d="m18 9-3 7-6 3 3-7 6-3Z"/><path d="M14 4v3M14 21v3M4 14h3m14 0h3"/></>,
    create: <><path d="m14 3 2.5 7.5L24 13l-7.5 2.5L14 23l-2.5-7.5L4 13l7.5-2.5L14 3Z"/><path d="M7 3v5M4.5 5.5h5M22 20v5m-2.5-2.5h5"/></>,
    me: <><circle cx="14" cy="10" r="5"/><path d="M5 24c0-6 3.8-9 9-9s9 3 9 9"/><path d="m21 3 1 2 2 1-2 1-1 2"/></>,
  } as const;
  return <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

export default function QuestAppNav({ scene = false, activePath }: { scene?: boolean; activePath?:string }) {
  const language=useSumLanguage();
  const pathname=usePathname()??activePath??"";
  if(hasInformationalNavigation(pathname)||pathname==="/app"||pathname.startsWith("/app/"))return null;
  // The scene and root layout must never both own a dock on /me or /quests.
  if(scene!==legacySceneOwnsNavigation(pathname))return null;
  const active=activeAppDestination(pathname);
  return <nav className={"sum-app-dock" + (scene ? " quest-mobile-dock" : "")} data-testid="sum-app-dock" aria-label={scene ? "Quest world navigation" : "App navigation"}>
    {destinations.map(({ href, label, zh, icon }) => <Link
      key={href}
      href={href}
      className={"sum-app-dock__item" + (active === href ? " is-selected" : "")}
      aria-current={active === href ? "page" : undefined}
      aria-label={translated(language,label,zh)}
    >
      <span className="sum-app-dock__icon"><NavIcon kind={icon}/></span>
      <span className="sum-app-dock__label">{translated(language,label,zh)}</span>
    </Link>)}
  </nav>;
}
