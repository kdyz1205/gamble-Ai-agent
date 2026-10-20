"use client";

import { useId, useState } from "react";
import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { Arrow, WorldGlyph } from "./WorldUI";
import { questSeeds } from "./quest-seeds";

export default function SummoningPortal() {
  const [selected, setSelected] = useState(0);
  const prefix = useId().replaceAll(":", "");
  const quest = questSeeds[selected];
  const fill = (name: string) => `url(#${prefix}-${name})`;
  return (
    <section className="sw-portal" data-realm={quest.id} aria-label="Explore your quest world">
      <div className="sw-portal__label"><span className="sw-small-label">THE SUMMONING GATE</span><span>REAL LIFE, REIMAGINED</span></div>
      <div className="sw-portal__scene">
        <svg className="sw-portal__art" viewBox="0 0 660 500" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${prefix}-land`} x1="100" y1="200" x2="540" y2="470" gradientUnits="userSpaceOnUse"><stop stopColor="#e4f4e9" /><stop offset="1" stopColor="#b7dccd" /></linearGradient>
            <linearGradient id={`${prefix}-edge`} x1="330" y1="320" x2="330" y2="470" gradientUnits="userSpaceOnUse"><stop stopColor="#b6d6ca" /><stop offset="1" stopColor="#e9f5f1" /></linearGradient>
            <linearGradient id={`${prefix}-ring`} x1="175" y1="65" x2="450" y2="360" gradientUnits="userSpaceOnUse"><stop stopColor="#fefeff" /><stop offset=".32" stopColor="#d7ccff" /><stop offset=".65" stopColor="#a9b8d8" /><stop offset="1" stopColor="#f7fffb" /></linearGradient>
            <linearGradient id={`${prefix}-glass`} x1="330" y1="90" x2="330" y2="355" gradientUnits="userSpaceOnUse"><stop stopColor="#dce2ff" stopOpacity=".7" /><stop offset=".57" stopColor="#eafff3" stopOpacity=".1" /><stop offset="1" stopColor="#b5e9cf" stopOpacity=".6" /></linearGradient>
            <radialGradient id={`${prefix}-light`}><stop stopColor="#ffffff" /><stop offset=".48" stopColor="#effff5" stopOpacity=".75" /><stop offset="1" stopColor="#e8fff2" stopOpacity="0" /></radialGradient>
            <filter id={`${prefix}-shadow`} x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="15" stdDeviation="12" floodColor="#184d45" floodOpacity=".12" /></filter>
          </defs>
          <ellipse cx="330" cy="445" rx="243" ry="31" fill="#78978c" opacity=".09" />
          <path d="M84 328C84 262 194 218 331 218s245 44 245 110v42c0 62-108 107-245 107S84 431 84 370v-42Z" fill={fill("edge")} />
          <ellipse cx="331" cy="327" rx="247" ry="107" fill={fill("land")} stroke="#a7c7ba" strokeWidth="1" />
          <path d="M85 328c0 58 111 107 246 107s245-49 245-107" stroke="#effcf4" strokeWidth="3" />
          <path d="M115 361c82-56 134-17 180-4s113 25 237-49M134 281c83 68 158 10 204 34s54 69 155 54" stroke="#f3fcf7" strokeWidth="8" strokeLinecap="round" />
          <path d="M115 361c82-56 134-17 180-4s113 25 237-49M134 281c83 68 158 10 204 34s54 69 155 54" stroke="#8fb9a6" strokeWidth="1" strokeDasharray="4 7" />
          <path d="M117 308c30-24 46-5 60-15s20-36 45-25M430 386c34-14 55 5 73-9" stroke="#7fb9a2" strokeWidth="3" opacity=".45" />
          <g stroke="#bfd6ca" strokeWidth="1"><path d="M152 394 469 259M195 412 509 278M113 344l369 58M123 310l396 58" /></g>
          <g className="sw-portal__monoliths">
            <path d="m128 294 23-13 24 13v31l-24 13-23-13v-31Z" fill="#e9f1e9" stroke="#7ea796" /><path d="m128 294 23 13 24-13m-24 13v31" stroke="#7ea796" /><path d="M145 289v-29h12v29" fill="#d4e4da" stroke="#7ea796" />
            <path d="m482 284 27-16 28 16v35l-28 16-27-16v-35Z" fill="#dde7ed" stroke="#91a9b5" /><path d="m482 284 27 16 28-16m-28 16v35" stroke="#91a9b5" /><path d="m496 279 13-35 13 35-13 8-13-8Z" fill="#e1dbf3" stroke="#9d9ab5" />
            <g fill="#5b927e"><path d="m205 387 11-35 12 35-12 5-11-5Z" /><path d="m444 334 11-34 12 34-12 5-11-5Z" /></g><g fill="#96bfa9"><path d="m188 377 10-27 9 27-9 5-10-5Z" /><path d="m461 344 9-26 10 26-10 4-9-4Z" /></g>
          </g>
          <ellipse cx="329" cy="344" rx="113" ry="33" fill="#789f91" opacity=".17" />
          <ellipse cx="329" cy="335" rx="107" ry="31" fill="#eff8f2" stroke="#adcdbb" strokeWidth="2" />
          <ellipse cx="329" cy="333" rx="88" ry="22" stroke="#7da891" strokeWidth="1" strokeDasharray="4 9" />
          <ellipse cx="329" cy="224" rx="156" ry="167" fill={fill("light")} />
          <ellipse cx="329" cy="210" rx="116" ry="147" fill={fill("glass")} stroke={fill("ring")} strokeWidth="18" filter={fill("shadow")} />
          <ellipse cx="329" cy="210" rx="106" ry="138" stroke="#fbfffc" strokeWidth="2" />
          <ellipse cx="329" cy="210" rx="132" ry="161" stroke="#c9d5dc" strokeWidth="1" strokeDasharray="2 10" />
          <path d="M224 127c15-37 41-61 73-69M434 285c-13 34-36 58-65 71" stroke="#75b9a9" strokeWidth="4" strokeLinecap="round" />
          <g fill="#fbfffc" stroke="#a8bdc4"><path d="m329 42 7 12-7 12-7-12 7-12Z" /><path d="m196 209 7 12-7 12-7-12 7-12Z" /><path d="m461 209 7 12-7 12-7-12 7-12Z" /></g>
          <g fill="#ece8ff" stroke="#aeb7cd"><path d="m532 130 8 17-8 17-8-17 8-17Z" /><path d="m120 190 5 11-5 11-5-11 5-11Z" /><path d="m415 54 5 10-5 10-5-10 5-10Z" /></g>
          <g stroke="#87ae9e" strokeLinecap="round"><path d="M162 130v12m-6-6h12M480 208v10m-5-5h10M391 402v10m-5-5h10" /></g>
        </svg>
        <div className="sw-portal__pico"><PicoFamiliar mood="guide" /><span>Your Familiar<br /><b>Pico</b></span></div>
        <div className="sw-portal__orbit-label"><span aria-hidden="true">✧</span><div><strong>A world of possibilities.</strong><small>One real-life quest at a time.</small></div></div>
        <span className="sw-portal__coordinate">SUM / ORIGIN GATE</span>
      </div>
      <div className="sw-portal__console">
        <div className="sw-portal__choices" role="group" aria-label="Choose a quest realm">{questSeeds.map((item, index) => <button type="button" key={item.id} aria-pressed={selected === index} onClick={() => setSelected(index)}><WorldGlyph kind={item.kind} />{item.label}</button>)}</div>
        <Link className="sw-portal__selected" href={`/summons?seed=${quest.id}`} aria-label={`Summon ${quest.label.toLowerCase()} quest`}><span className="sw-portal__seed-icon"><WorldGlyph kind={quest.kind} /></span><span><small>{quest.realm} · Example idea</small><strong aria-live="polite">{quest.name}</strong></span><Arrow /></Link>
      </div>
      <p className="sw-portal__caption">An illustrated world. The adventures happen in yours.</p>
    </section>
  );
}
