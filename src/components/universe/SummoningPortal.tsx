"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import RealmCanvas from "@/components/experience/RealmCanvas";
import { Arrow, WorldGlyph, SummonSigil } from "./WorldUI";
import { questSeeds } from "./quest-seeds";
import { StorybookPortalArt } from "./StorybookWorldArt";

export default function SummoningPortal() {
  const [selected,setSelected] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const quest = questSeeds[selected];
  return (
    <section className="sum-gate" data-testid="sum-spatial-gate" data-realm={quest.id} aria-label="Explore the SUM summoning world">
      <div className="sum-gate__meta">
        <span>SUM / ORIGIN 001</span>
        <span className="sum-gate__meta-right"><i aria-hidden="true" /> THE GATE IS OPEN</span>
      </div>
      <div className="sum-gate__scene">
        <div className="sum-gate__halo" aria-hidden="true"/>
        <StorybookPortalArt/>
        <RealmCanvas realm={quest.id} className="sum-gate__canvas"/>
        <div className="sum-gate__character">
          <PicoFamiliar mood="guide"/>
          <span>PICO <small>YOUR LITTLE CO-CREATOR</small></span>
        </div>
        <span className="sum-gate__coordinate sum-gate__coordinate--left">41° / POSSIBILITY</span>
        <span className="sum-gate__coordinate sum-gate__coordinate--right">WORLD / 001</span>
        <div className="sum-gate__relic" aria-hidden="true"><SummonSigil/></div>
      </div>
      <div className="sum-gate__bottom">
        <div className="sum-gate__intro">
          <span className="sum-gate__chapter">01 / EVERY JOURNEY STARTS SOMEWHERE</span>
          <h2>A world of possibilities.<br/><em>One real moment at a time.</em></h2>
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
                <WorldGlyph kind={item.kind}/><span>{item.label}</span>
              </button>
            ))}
          </div>
          <Link className="sum-gate__choice" href={"/summons?seed="+quest.id} aria-label={"Summon "+quest.label.toLowerCase()+" quest"}>
            <span className="sum-gate__choice-symbol"><WorldGlyph kind={quest.kind}/></span>
            <span className="sum-gate__choice-copy"><small>{quest.realm} / STARTING POINT</small><strong aria-live="polite">{quest.name}</strong></span>
            <Arrow/>
          </Link>
        </div>
      </div>
      <p className="sum-gate__foot">Explore the visual world. The real quest happens outside your screen.</p>
    </section>
  );
}
