"use client";

import {useState} from "react";
import Link from "next/link";
import Image from "next/image";
import PicoFamiliar, {type PicoMood} from "@/components/familiar/PicoFamiliar";
import {Arrow,Eyebrow} from "./WorldUI";

const roles = [
  {label:"Guide", mood:"listening" as PicoMood, title:"A thought doesn't need to arrive finished.", detail:"Say the challenge as you would to a friend. Pico helps find the intention and asks for the information still missing."},
  {label:"Clarify", mood:"clarify" as PicoMood, title:"Good Quests begin with good questions.", detail:"Who is taking part? What counts as completion? What proof can both people agree on? Pico clarifies, the participants decide."},
  {label:"Review", mood:"referee" as PicoMood, title:"A thoughtful explanation, not an instant verdict.", detail:"Pico can help review the actual evidence against accepted rules. Unclear moments remain open for review."},
];

const expressions:{title:string;mood:PicoMood;description:string}[] = [
  {title:"Attentive",mood:"listening",description:"When you begin"},
  {title:"Thoughtful",mood:"thinking",description:"While processing"},
  {title:"Curious",mood:"clarify",description:"When terms are missing"},
  {title:"Careful",mood:"uncertain",description:"When proof is unclear"},
  {title:"Celebrating",mood:"celebrate",description:"After confirmation"},
  {title:"Recovering",mood:"error",description:"When something fails"},
];

export default function FamiliarSanctuary() {
  const [active,setActive]=useState(0);
  const role=roles[active];
  return (
    <section className="sw-page sum-v4-page sum-v4-familiar" data-testid="familiar-sanctuary">
      <div className="sw-sanctuary">
        <div className="sw-familiar-display sum-v4-familiar__display" data-familiar-role={role.label}>
          <Image src="/storybook-premium/hero2.webp" alt="Pico joyfully leaping out of a luminous fantasy portal" fill sizes="(max-width:699px) 100vw, 46vw" className="sum-sanctuary-premium-image" priority={false}/>
          <span className="sw-familiar-display__star" aria-hidden="true">✧</span>
          <span className="sum-v4-familiar__orbital" aria-hidden="true"/>
          <PicoFamiliar mood={role.mood}/>
          <div className="sw-familiar-display__base"><b>PICO</b><span>FAMILIAR / 001<br/>YOUR QUEST COMPANION</span></div>
        </div>
        <div className="sw-sanctuary-copy">
          <Eyebrow>THE FAMILIAR SANCTUARY / 001</Eyebrow>
          <h1>Your intention.<br/>Your adventure.<br/><span>Your Familiar.</span></h1>
          <p>Pico isn&apos;t just the character on the welcome screen. It accompanies the experience from first idea to a transparent result, helping without taking away your agency.</p>
          <div className="sw-familiar-tabs" role="group" aria-label="Explore Pico’s role">
            {roles.map((item,index)=><button key={item.label} type="button" aria-pressed={active===index} onClick={()=>setActive(index)}>{item.label}</button>)}
          </div>
          <section className="sw-familiar-role" aria-live="polite">
            <h2>{role.title}</h2><p>{role.detail}</p>
          </section>
          <Link className="sw-button" href="/summons">Summon with Pico <Arrow/></Link>
          <p className="sw-example-footnote">This is an introduction to Pico, not a personalized skill or progress dashboard.</p>
        </div>
      </div>

      <section className="sum-v4-pico-vocabulary" aria-labelledby="pico-vocabulary-heading">
        <div className="sum-v4-pico-vocabulary__heading">
          <div><Eyebrow>THE LANGUAGE OF A FAMILIAR</Eyebrow><h2 id="pico-vocabulary-heading">One friend. Many moments.</h2></div>
          <p>Pico&apos;s expressions respond to actual product states. They never make an uncertain outcome look final.</p>
        </div>
        <div className="sum-v4-pico-vocabulary__grid">
          {expressions.map(item=>(
            <article className="sum-v4-pico-vocabulary__item" key={item.title}>
              <PicoFamiliar mood={item.mood}/>
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="sw-sanctuary-promises" aria-label="A Familiar's boundaries">
        {[
          ["01 / YOUR AGENCY","You are the Summoner.","Pico cannot accept a pact or change an agreed rule for you."],
          ["02 / SHARED TRUTH","Real evidence matters.","A character or ability cannot turn uncertain evidence into proof."],
          ["03 / OPEN REASONING","Clarity makes it fair.","A real result must communicate the evidence, reasoning and remaining uncertainty."],
        ].map(([tag,title,detail])=><div key={title}><span className="sw-small-label">{tag}</span><h2>{title}</h2><p>{detail}</p></div>)}
      </section>
    </section>
  );
}
