"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {SumLanguageSwitch,useSumLanguage,translated} from "@/components/locale/SumLanguage";
import {questStatusText} from "@/lib/interface-language";
import {appDestinations,activeAppDestination} from "@/lib/app-navigation";
import {questReturnTo,questRoute} from "@/lib/quest-navigation-context";

type IconName = "home" | "discover" | "create" | "pico" | "user" | "back" | "arrow"
  | "star" | "camera" | "check" | "spark" | "calendar" | "shield" | "chart"
  | "trophy" | "settings" | "gallery" | "heart" | "people" | "bell" | "moon" | "link";

export function IosIcon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = { stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const icons: Record<IconName, ReactNode> = {
    home: <><path d="M3 11 12 3l9 8v10H3V11Z"/><path d="M9 21v-8h6v8"/></>,
    discover: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.6 5.5L8 16l2.6-5.4L16 8Z"/></>,
    create: <><path d="M12 4v16M4 12h16"/></>,
    pico: <><path d="M4 13Q4 5 12 5t8 8q0 7-8 7t-8-7Z"/><path d="M6 7 3 3q6-1 7 3M18 7l3-4q-6-1-7 3"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><path d="M10 16q2 2 4 0"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 3-8 8-8s8 3 8 8"/></>,
    back: <path d="m14.5 4-8 8 8 8"/>,
    arrow: <><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></>,
    star: <path d="m12 2 3.2 6.7 7.3 1.1-5.3 5.2 1.3 7.2-6.5-3.5-6.5 3.5 1.3-7.2-5.3-5.2 7.3-1.1Z"/>,
    camera: <><rect x="2" y="6" width="20" height="15" rx="3"/><circle cx="12" cy="13.5" r="4"/><path d="m7 6 2-3h6l2 3"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    spark: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5M17 3v5M3 10h18"/></>,
    shield: <><path d="M12 2 21 6v5c0 5-3 8.5-9 11-6-2.5-9-6-9-11V6Z"/><path d="m8 12 3 3 5-6"/></>,
    chart: <><path d="M3 21V3M3 21h18"/><rect x="6" y="12" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="12" rx="1"/><rect x="18" y="4" width="3" height="15" rx="1"/></>,
    trophy: <><path d="M7 3h10v6c0 5-2 7-5 7s-5-2-5-7V3ZM7 6H4v3c0 3 2 4 4 4M17 6h3v3c0 3-2 4-4 4M12 16v4M7 21h10"/></>,
    settings: <><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
    gallery: <><rect x="2" y="3" width="20" height="18" rx="3"/><circle cx="8" cy="9" r="2"/><path d="m3 18 6-6 3 3 4-4 5 6"/></>,
    heart: <path d="M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z"/>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M2 20c0-5 2-8 7-8s7 3 7 8M17 5c3 0 4 2 4 4s-1 4-4 4M20 14c2 1 3 3 3 6"/></>,
    bell: <><path d="M4 18h16l-3-4V9a5 5 0 0 0-10 0v5Z"/><path d="M10 21h4"/></>,
    moon: <path d="M19 18A9 9 0 0 1 7 5a9 9 0 1 0 12 13Z"/>,
    link: <><path d="M10 8h-2a5 5 0 0 0 0 10h3M14 16h2a5 5 0 0 0 0-10h-3M8 12h8"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" {...common}>{icons[name]}</svg>;
}

// Cropped from the project's original 3D storybook artwork. Source marketing
// plates contain editorial text outside these app-safe framings.
export const visuals = {
  mascot: "/storybook-premium/ios-clean/pico-companion.webp",
  mascotHappy: "/storybook-premium/ios-clean/pico-portal.webp",
  portal: "/storybook-premium/ios-clean/dream-portal.webp",
  move: "/storybook-premium/ios-clean/move-world.webp",
  create: "/storybook-premium/ios-clean/create-world.webp",
  grow: "/storybook-premium/ios-clean/grow-world.webp",
  sky: "/storybook-premium/ios-clean/sleeping-familiar.webp",
  adventure: "/storybook-premium/ios-clean/forest-familiar.webp",
  landscape: "/storybook-premium/ios-clean/community-world.webp",
} as const;

export function IosArt({ src, alt = "", className = "", priority = false }: {
  src: string; alt?: string; className?: string; priority?: boolean;
}) {
  return <Image src={src} alt={alt} width={680} height={580} className={"ios-art " + className}
    sizes="(max-width: 600px) 90vw, 470px" priority={priority}/>;
}

export function IosAction({ href, children, secondary = false, className = "" }: {
  href: string; children: ReactNode; secondary?: boolean; className?: string;
}) {
  return <Link href={href} className={"ios-action " + (secondary ? "ios-action--secondary " : "") + className}>
    {children}<IosIcon name="arrow" size={18}/>
  </Link>;
}

const tabs=appDestinations;

const appTitles:Record<string,string>={
  "Quest HQ":"Quest 大厅","Discover":"发现挑战",
  "Quest Forge":"创建 Quest","Familiars":"召唤兽",
  "Voice Quiz Duel":"双人 Quiz","Pico · Chapter One":"Pico · 第一章",
  "Quest Detail":"Quest 详情","Quest Invitation":"Quest 邀请",
  "Add Evidence":"提交证据","Quest Result":"Quest 结果",
  "New Quest":"新建 Quest","Profile":"个人主页",
  "Achievements":"成就","Stats":"统计","Evidence":"证据",
  "Settings":"设置","Community":"社区",
  "My Evidence":"我的证据","Your Journey":"我的历程",
  "Quest Created":"Quest 创建成功","Quest Complete":"Quest 已完成",
};
const appEyebrows:Record<string,string>={
  "YOUR LIVE GAME":"你的游戏世界",
  "SHARED POSSIBILITIES":"一起探索更多可能",
  "YOUR IDEA · PICO HELPS":"你的想法 · Pico 陪你",
  "COMPANIONS FOR REAL QUESTS":"真实 Quest 的冒险伙伴",
  "VERIFIED · FRIEND VS FRIEND":"双人对决 · 结果可核查",
  "ONE STORY · ONE MOVE":"一段剧情 · 一个技能",
  "YOUR REAL ADVENTURE":"你的真实冒险",
  "READ · AGREE · ENTER":"阅读 · 同意 · 加入",
  "THE PROOF CHAPTER":"证据提交",
  "THE STORY YOU MADE":"你的结果记录",
  "A NEW ADVENTURE":"新的冒险",
  "YOUR OWN LITTLE WORLD":"你的 Quest 世界",
  "MILESTONES":"成长里程碑",
  "YOUR PRIVATE PROOF GALLERY":"你的私人证据库",
  "REAL QUEST ACTIVITY":"真实 Quest 活动",
  "MAKE IT YOUR OWN":"个性化设置",
  "REAL PEOPLE · REAL PROGRESS":"真实玩家 · 真实进度",
};

export function IosBottomNav({contextPath}:{contextPath?:string}={}) {
  const language=useSumLanguage();
  const path = usePathname();
  const active=activeAppDestination((questReturnTo(contextPath)||path).split("#")[0]);
  return <nav className="ios-tabbar" aria-label="iOS app navigation" data-testid="ios-tabbar">
    {tabs.map(({ href,label,zh,icon }) => <Link key={href} href={href}
      aria-label={translated(language,label,zh)} aria-current={active === href ? "page" : undefined}
      className={"ios-tab" + (active === href ? " ios-tab--active" : "") + (label === "Create" ? " ios-tab--create" : "")}>
      <span className="ios-tab__icon"><IosIcon name={icon} size={21}/></span>
      <span>{translated(language,label,zh)}</span>
    </Link>)}
  </nav>;
}

export function IosFrame({ title, eyebrow, back, children, hero, withNav = true, tone = "",navigationContext }: {
  title?: string; eyebrow?: string; back?: string; children: ReactNode;
  hero?: ReactNode; withNav?: boolean; tone?: string; navigationContext?:string;
}) {
  const language=useSumLanguage();
  const path=usePathname();
  const [night,setNight]=useState(false);
  const [reduceMotion,setReduceMotion]=useState(false);
  const [hydrated,setHydrated]=useState(false);
  useEffect(()=>{
    setHydrated(true);
    const update=()=>{
      try {
        setNight(localStorage.getItem("sum-ios-appearance")==="night");
        setReduceMotion(localStorage.getItem("sum-ios-reduced-motion")==="true");
      } catch {}
    };
    update();
    window.addEventListener("sum-ios-preferences-changed",update);
    return ()=>window.removeEventListener("sum-ios-preferences-changed",update);
  },[]);
  return <div className={"ios-app " + tone + (night?" ios-app--night":"")} data-hydrated={hydrated} data-reduce-motion={reduceMotion} data-testid="ios-full-app" data-product-surface="web-app" data-view={path.split("/")[2]||"today"}>
    {title && <header className="ios-header">
      {back ? <Link className="ios-back" aria-label={translated(language,"Back","返回")} href={back}><IosIcon name="back" size={19}/></Link>
        : <span className="ios-header__brand">SUM <span>✦</span></span>}
      <div className="ios-header__title">
        {eyebrow && <small>{translated(language,eyebrow,appEyebrows[eyebrow]||eyebrow)}</small>}
        <strong>{translated(language,title,appTitles[title]||title)}</strong>
      </div>
      <div className="ios-header__controls">
        <SumLanguageSwitch surface="app"/>
        <Link aria-label={translated(language,"Your profile","个人主页")}
          href="/app/profile" className="ios-header__avatar">
          <IosIcon name="pico" size={22}/>
        </Link>
      </div>
    </header>}
    {!title&&<div className="ios-intro-language"><SumLanguageSwitch surface="app"/></div>}
    {hero}
    <main className="ios-main" id="ios-app-main">{children}</main>
    {withNav && <IosBottomNav contextPath={navigationContext}/>}
  </div>;
}

export function IosEmpty({ image = visuals.mascot, heading, description, action, href }: {
  image?: string; heading: string; description: string; action?: string; href?: string;
}) {
  return <section className="ios-empty">
    <IosArt src={image} alt="" className="ios-empty__art"/>
    <h2>{heading}</h2><p>{description}</p>
    {action && href && <IosAction href={href}>{action}</IosAction>}
  </section>;
}

export function IosQuestCard({ challenge, compact = false,returnTo }: {
  challenge: {id:string; title:string; status:string; type:string; stake:number; deadline:string|null; _count?:{evidence:number}};
  compact?: boolean; returnTo?:string;
}) {
  const language=useSumLanguage();
  const status = questStatusText(language,challenge.status);
  const image = /fit|sport|run|walk|badminton/i.test(challenge.title+" "+challenge.type) ? visuals.move
    : /draw|paint|art|creat|music/i.test(challenge.title+" "+challenge.type) ? visuals.create : visuals.grow;
  const origin=questReturnTo(returnTo)?.split("#")[0];
  return <Link id={"quest-"+challenge.id} href={questRoute("quest",challenge.id,origin?origin+"#quest-"+challenge.id:undefined)}
    className={"ios-quest-card" + (compact ? " ios-quest-card--small" : "")} data-testid="ios-quest-card">
    <span className="ios-quest-card__cover"><IosArt src={image}/></span>
    <span className="ios-quest-card__body"><strong>{challenge.title}</strong>
      <small>{challenge.type} · {status} · {challenge.stake > 0 ? challenge.stake+translated(language," credits"," 积分") : translated(language,"Free","免费")}</small>
      {challenge.deadline && <small>{translated(language,"Due ","截止 ")}{new Date(challenge.deadline).toLocaleDateString(language==="zh"?"zh-CN":"en-US")}</small>}
    </span><IosIcon name="arrow" size={18}/>
  </Link>;
}
