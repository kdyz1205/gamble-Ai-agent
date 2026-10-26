"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import RealmCanvas from "@/components/experience/RealmCanvas";
import { Arrow, WorldGlyph, SummonSigil } from "./WorldUI";
import { questSeeds } from "./quest-seeds";
import { StorybookPortalArt } from "./StorybookWorldArt";
import {SumText,useSumLanguage,translated} from "@/components/locale/SumLanguage";

const realmChinese:Record<string,{label:string;name:string;realm:string}>={
  move:{label:"行动",name:"行动挑战",realm:"行动"},
  craft:{label:"创造",name:"创造挑战",realm:"创造"},
  grow:{label:"成长",name:"成长挑战",realm:"成长"},
};

export default function SummoningPortal() {
  const language=useSumLanguage();
  const [selected,setSelected] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const quest = questSeeds[selected];
  return (
    <section className="sum-gate" data-testid="sum-spatial-gate" data-realm={quest.id} aria-label="Explore the SUM summoning world">
      <div className="sum-gate__meta">
        <span>SUM / ORIGIN 001</span>
        <span className="sum-gate__meta-right"><i aria-hidden="true" /> <SumText en="THE GATE IS OPEN" zh="召唤之门已经开启"/></span>
      </div>
      <div className="sum-gate__scene">
        <div className="sum-gate__halo" aria-hidden="true"/>
        <Image src="/storybook-premium/hero1.webp" alt="Pico in a flower-filled golden portal above a magical floating island" className="sum-gate__premium-image" fill priority sizes="(max-width: 959px) 100vw, 760px" data-testid="sum-premium-hero-art"/>
        <StorybookPortalArt/>
        <RealmCanvas realm={quest.id} className="sum-gate__canvas"/>
        <div className="sum-gate__character">
          <PicoFamiliar mood="guide"/>
          <span>PICO <small><SumText en="YOUR LITTLE CO-CREATOR" zh="与你同行的小伙伴"/></small></span>
        </div>
        <span className="sum-gate__coordinate sum-gate__coordinate--left">41° / POSSIBILITY</span>
        <span className="sum-gate__coordinate sum-gate__coordinate--right">WORLD / 001</span>
        <div className="sum-gate__relic" aria-hidden="true"><SummonSigil/></div>
      </div>
      <div className="sum-gate__bottom">
        <div className="sum-gate__intro">
          <span className="sum-gate__chapter"><SumText en="01 / EVERY JOURNEY STARTS SOMEWHERE" zh="01 / 每一段旅程都有起点"/></span>
          <h2><SumText en={<>A world of possibilities.<br/><em>One real moment at a time.</em></>}
            zh={<>无数种可能。<br/><em>从真实的每一步开始。</em></>}/></h2>
        </div>
        <div className="sum-gate__controls">
          <div className="sum-gate__tabs" role="group" aria-label="Choose a quest realm" aria-busy={!ready}>
            {questSeeds.map((item,index)=> (
              <button
                key={item.id}
                type="button"
                aria-pressed={selected===index}
                disabled={!ready}
                onClick={()=>setSelected(index)}
              >
                <WorldGlyph kind={item.kind}/><span>{translated(language,item.label,realmChinese[item.id]?.label||item.label)}</span>
              </button>
            ))}
          </div>
          <Link className="sum-gate__choice" href={"/app/create?seed="+encodeURIComponent(quest.id)}
            aria-label={translated(language,"Start a "+quest.label.toLowerCase()+" Quest in SUM","在 SUM 创建"+(realmChinese[quest.id]?.name||quest.name))}>
            <span className="sum-gate__choice-symbol"><WorldGlyph kind={quest.kind}/></span>
            <span className="sum-gate__choice-copy"><small>{translated(language,quest.realm,realmChinese[quest.id]?.realm||quest.realm)} / <SumText en="STARTING POINT" zh="起点"/></small><strong aria-live="polite">{translated(language,quest.name,realmChinese[quest.id]?.name||quest.name)}</strong></span>
            <Arrow/>
          </Link>
        </div>
      </div>
      <p className="sum-gate__foot"><SumText
        en="Explore the world here. Start and manage real Quests in SUM Web App."
        zh="在官网探索世界，在 SUM 客户端创建并管理真实的 Quest。"/></p>
    </section>
  );
}
