"use client";

import {useRef,useState,type CSSProperties} from "react";
import Image from "next/image";
import {useSumLanguage,translated} from "@/components/locale/SumLanguage";
import dynamic from "next/dynamic";
import {getCreatureBlockout} from "@/lib/summons/creature-model-manifest";
import {IosAction} from "./IOSAppUI";
import {creatureRenderFor} from "@/lib/summons/creature-render-manifest";
import type {CreatureStage} from "@/lib/summons/creature-visual-bible";
import {CREATURE_ATLAS,creatureVisualFor,creatureStageForMastery}
  from "@/lib/summons/creature-visual-bible";
import {
  PROFESSIONS,RARITY_ODDS,INITIAL_PITY_STATE,advancePityState,
  professionById,previewFusion,previewSummon,previewEffectiveOdds,
  previewVerifiedBattleXp,previewTicketMilestones,previewMasteryFromXp,
  type ProfessionId,type SummonConcept,type PityState,
} from "@/lib/summons/profession-system";

const Creature3DPrototypeViewer=dynamic(
  ()=>import("./Creature3DPrototypeViewer"),{ssr:false},
);

type Chapter="career"|"summon"|"fusion"|"progress";
const CHAPTERS=[
  {id:"career",label:"Career Atlas"},
  {id:"summon",label:"Summon Preview"},
  {id:"fusion",label:"Fusion Lab"},
  {id:"progress",label:"XP Guide"},
] as const;
function crestStyle(id:ProfessionId):CSSProperties{
  const colors=creatureVisualFor(id).colors;
  return {"--atlas-0":colors[0],"--atlas-1":colors[1],
    "--atlas-2":colors[2]} as CSSProperties;
}

function CreaturePortrait({id,stage,context}:{
  id:ProfessionId;stage:CreatureStage;context:"atlas"|"hero"|"evolution"|"fusion";
}) {
  const art=creatureRenderFor(id,stage);
  if(art) return <Image src={art.src}
    data-testid={"creature-art-"+id+"-"+stage}
    className={"ios-creature-art ios-creature-art--"+context}
    width={art.width} height={art.height}
    sizes={context==="hero"?"(max-width:430px) 28vw, 180px":"(max-width:430px) 25vw, 100px"}
    alt={context==="atlas"?"":art.alt+" (illustration concept, not owned)"}/>;
  return <span className={"ios-creature-crest ios-creature-crest--"+id}
    style={crestStyle(id)} aria-hidden="true"/>;
}

/**
 * Playable rules preview only: real species ownership, profession XP and
 * RNG grants require an authenticated, audited server ledger in a later PR.
 * No credit, stake, DB, inventory, or settlement mutations occur here.
 */
export default function ProfessionSummonStudio(){
  const language=useSumLanguage();
  const chapterZh={career:"职业图鉴",summon:"召唤预览",fusion:"融合演示",progress:"成长说明"} as const;
  const [primary,setPrimary]=useState<ProfessionId>("athletics");
  const [occupation,setOccupation]=useState("badminton");
  const [secondary,setSecondary]=useState<ProfessionId>("software");
  const [mastery,setMastery]=useState(1);
  const [showPrototype,setShowPrototype]=useState(false);
  const [activeChapter,setActiveChapter]=useState<Chapter>("career");
  const [draw,setDraw]=useState<SummonConcept|null>(null);
  const [draws,setDraws]=useState(0);
  const [pity,setPity]=useState<PityState>({...INITIAL_PITY_STATE});
  const pityRef=useRef<PityState>({...INITIAL_PITY_STATE});
  const nextOdds=previewEffectiveOdds(pity);
  const first=professionById(primary);
  const firstVisual=creatureVisualFor(primary);
  const otherVisual=creatureVisualFor(secondary);
  const stage=creatureStageForMastery(mastery);
  const blockout=getCreatureBlockout(primary,stage);
  const occupationName=first.specialties.find(s=>s.id===occupation)?.name ?? first.specialties[0].name;
  const other=professionById(secondary);
  const example=previewSummon({professionId:primary,occupationId:occupation,
    masteryLevel:mastery,randomUnit:.9});
  const otherExample=previewSummon({professionId:secondary,masteryLevel:1,
    randomUnit:.9});
  const fusion=previewFusion(example,otherExample);
  const victory=previewVerifiedBattleXp({status:"settled",proofAccepted:true,
    participantEligible:true,outcome:"win",professionId:primary});
  const loss=previewVerifiedBattleXp({status:"settled",proofAccepted:true,
    participantEligible:true,outcome:"loss",professionId:primary});
  const ticket=previewTicketMilestones(250);

  const changePrimary=(next:ProfessionId)=>{
    professionById(next);
    setPrimary(next);
    setOccupation(professionById(next).specialties[0].id);
    if(next===secondary)setSecondary(PROFESSIONS.find(entry=>entry.id!==next)!.id);
    setDraw(null);
    setShowPrototype(false);
  };
  const changeSecondary=(next:ProfessionId)=>{
    professionById(next);
    if(next===primary)return;
    setSecondary(next);
  };
  const tryDraw=()=>{
    // A visual *example*, never a real item, grant, or guaranteed probability
    // source. A real service must use server-side CSPRNG and disclose odds.
    const result=previewSummon({professionId:primary,occupationId:occupation,
      masteryLevel:mastery,randomUnit:Math.random(),pity:pityRef.current});
    const after=advancePityState(pityRef.current,result.rarity);
    pityRef.current=after;
    setPity(after);
    setDraw(result);
    setDraws(n=>n+1);
  };
  const resetPreview=()=>{
    const zero={...INITIAL_PITY_STATE};
    pityRef.current=zero;
    setPity(zero);
    setDraw(null);
    setDraws(0);
  };
  return <section className="ios-summon-studio ios-section" aria-label="Profession Summon Studio">
    <div className="ios-section__heading">
      <div><small>THE WORLD OF SUMMONS</small><h2>Build your own lineage</h2></div>
    </div>
    <p className="ios-summon-intro">
      Everyone begins with Pico. After that, your real career skills and verified
      challenges can shape which creatures you may summon. These are 12 starting
      branches, not a limit on the professions the game can support.
    </p>
    <div className="ios-summon-chapters" role="tablist" aria-label="Summon design chapters">
      {CHAPTERS.map(chapter=><button key={chapter.id} type="button"
        role="tab" id={"summon-tab-"+chapter.id}
        aria-controls={"summon-panel-"+chapter.id}
        aria-selected={activeChapter===chapter.id} tabIndex={activeChapter===chapter.id?0:-1}
        className={"ios-summon-chapter"+(activeChapter===chapter.id?" is-selected":"")}
        onKeyDown={event=>{
          const index=CHAPTERS.findIndex(item=>item.id===chapter.id);
          const next=event.key==="ArrowRight"?(index+1)%CHAPTERS.length:event.key==="ArrowLeft"?(index+CHAPTERS.length-1)%CHAPTERS.length:event.key==="Home"?0:event.key==="End"?CHAPTERS.length-1:null;
          if(next===null)return;event.preventDefault();const target=CHAPTERS[next].id;setActiveChapter(target);document.getElementById("summon-tab-"+target)?.focus();
        }}
        onClick={()=>setActiveChapter(chapter.id)}>{translated(language,chapter.label,chapterZh[chapter.id])}</button>)}
    </div>

    {activeChapter==="career"&&<div className="ios-summon-lab" role="tabpanel" tabIndex={0}
      id="summon-panel-career" aria-labelledby="summon-tab-career">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">01 · CHOOSE A PROFESSION</span>
        <h3>Career affinity</h3>
      </div>
      <p className="ios-summon-hint">Twelve distinct species silhouettes, not twelve recolored Picos.
        Select a family to explore its creature lineage and three career specialties.
        These are art blueprints, not creatures in your account.</p>
      <div className="ios-creature-atlas" role="group" aria-label="Twelve concept creature families">
        {CREATURE_ATLAS.map(entry=><button type="button" key={entry.id}
          data-testid={"creature-family-"+entry.id}
          aria-pressed={primary===entry.id}
          className={"ios-creature-atlas-card"+(primary===entry.id?" is-selected":"")}
          onClick={()=>changePrimary(entry.id)}>
          <CreaturePortrait id={entry.id} stage="base" context="atlas"/>
          <strong>{entry.species}</strong>
          <small>{entry.name}</small>
        </button>)}
      </div>
      <label className="ios-summon-input">Profession family
        <select aria-label="Profession family" value={primary}
          onChange={event=>changePrimary(event.target.value as ProfessionId)}>
          {PROFESSIONS.map(prof=><option key={prof.id} value={prof.id}>{prof.name}</option>)}
        </select>
      </label>
      <label className="ios-summon-input">Specific profession or skill
        <select aria-label="Specific profession or skill" value={occupation} onChange={e=>{
          setOccupation(e.target.value);setDraw(null);
        }}>
          {first.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="ios-summon-species">
        <div className="ios-summon-species__art ios-creature-portrait">
          <CreaturePortrait id={primary} stage={stage} context="hero"/>
        </div>
        <div><span className="ios-overline">{creatureRenderFor(primary,stage)
          ?"ORIGINAL 3D-STYLE ILLUSTRATION · CONCEPT ONLY"
          :"UNIQUE SPECIES BLUEPRINT · ART PENDING"}</span>
          <h3>{first.species}</h3>
          <p>{firstVisual.silhouette}</p>
          <small>Affinity: {first.trait} · Specialization: {occupationName}</small>
        </div>
      </div>
      <p className="ios-summon-hint"><strong>Art signature:</strong> {firstVisual.signature}
        {" · "}<strong>Material:</strong> {firstVisual.material}</p>
      <p className="ios-summon-hint"><strong>Occupation motif:</strong> {
        firstVisual.occupationMotifs[first.specialties.findIndex(s=>s.id===occupation)]}
        {" · "}<strong>Motion:</strong> {firstVisual.movement}</p>
      <label className="ios-summon-input ios-summon-slider">
        <span>Hypothetical profession mastery · Lv {mastery}</span>
        <input aria-label="Preview profession mastery level" type="range" min={1}
          max={5} step={1} value={mastery} onChange={e=>{
            setMastery(Number(e.target.value));setDraw(null);
          }}/>
        <small>{mastery===1?"New explorer":mastery<3?"Learning your craft":
          mastery<5?"Evolved forms possible":"Ascended forms possible"} · sample only, not earned</small>
      </label>
      <div className="ios-evolution-strip" aria-label="Three-stage species evolution preview">
        {([1,3,5] as const).map((level,index)=><div key={level}
          className={"ios-evolution-stage"+(stage===(index===0?"base":index===1?"evolved":"ascended")?" is-current":"")}>
          <span>LV {level}</span>
          <CreaturePortrait id={primary}
            stage={index===0?"base":index===1?"evolved":"ascended"}
            context="evolution"/>
          <strong>{firstVisual.stageNames[index]}</strong>
          <small>{index===0?"Hatchling form":index===1?"Evolved form":"Ascended form"}</small>
        </div>)}
      </div>
      <p className="ios-summon-hint">These are proposed cosmetic forms. No level, skill, ticket
        or creature is awarded by this preview.</p>

      <div className="ios-3d-entry" data-testid="career-3d-entry">
        <div>
          <span className="ios-overline">OPTIONAL MODELING PROTOTYPE</span>
          <h3>View the real 3D blockout</h3>
          <p className="ios-summon-hint">
            {blockout
              ?"A real editable GLB mesh exists for this sample form. The polished illustration remains the default."
              :"A 3D mesh has not been built for this family. The original career concept remains available."}
          </p>
        </div>
        {blockout&&<button type="button" className="ios-3d-entry__toggle"
          data-testid="toggle-creature-3d"
          aria-pressed={showPrototype}
          onClick={()=>setShowPrototype(open=>!open)}>
          {showPrototype?"Close 3D preview":"Inspect 3D prototype"}
        </button>}
        {blockout&&showPrototype&&<Creature3DPrototypeViewer
          key={blockout.src} src={blockout.src}
          label={firstVisual.stageNames[stage==="base"?0:stage==="evolved"?1:2]}/>}
      </div>
    </div>}

    {activeChapter==="summon"&&<div className="ios-summon-lab" role="tabpanel" tabIndex={0}
      id="summon-panel-summon" aria-labelledby="summon-tab-summon">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">02 · A CHANCE TO SUMMON</span>
        <h3>Random rarity, visible odds</h3>
      </div>
      <div className="ios-summon-odds" aria-label="Example base summon odds">
        {RARITY_ODDS.map(row=><div key={row.id}>
          <span>{row.label}</span><strong>{row.weight/100}%</strong>
        </div>)}
      </div>
      <div className="ios-pity-status" data-testid="ios-simulated-pity" aria-live="polite">
        <strong>{draws} sample draw{draws===1?"":"s"} · browser-only counters</strong>
        <span>Rare+ guarantee in at most {nextOdds.rareIn} more sample draw{nextOdds.rareIn===1?"":"s"}.</span>
        <span>Epic+ guarantee in at most {nextOdds.epicIn} more sample draw{nextOdds.epicIn===1?"":"s"}.</span>
        {nextOdds.guarantee!=="none"&&<span className="ios-pity-status__ready">
          {nextOdds.guarantee==="epic-80"?"Epic+":"Rare+"} guarantee active for next sample
        </span>}
      </div>
      {nextOdds.guarantee!=="none"&&<div className="ios-summon-odds" aria-label="Guaranteed next draw odds">
        {nextOdds.odds.map(row=><div key={row.id}>
          <span>{row.label}</span><strong>{row.percent}%</strong>
        </div>)}
      </div>}
      <p className="ios-summon-hint">Draft rule: every 20th consecutive attempt without Rare+ guarantees Rare+;
        every 80th without Epic+ guarantees Epic+. Higher mastery reveals new forms.
        Odds never improve because of the amount staked.</p>
      <button className="ios-primary" type="button" onClick={tryDraw}>
        Preview a random summon <span aria-hidden="true">✦</span>
      </button>
      <div className="ios-summon-result" role="status" aria-live="polite">
        {draw?<><span className="ios-overline">SIMULATION {draws} · NO ITEM AWARDED</span>
          <h3>{draw.speciesName}</h3>
          <p>{draw.rarity.toUpperCase()} · {draw.occupationLabel} · {draw.visualStage} form
            {draw.pity!=="none"?" · PITY GUARANTEE APPLIED":""}</p>
        </>:<><span className="ios-overline">SANDBOX · FREE PREVIEW</span>
          <h3>What could you summon?</h3>
          <p>Tap once to see one sample outcome. This does not use or award a real ticket.</p></>}
      </div>
      <button type="button" className="ios-summon-reset" onClick={resetPreview}
        disabled={draws===0}>Reset sample-only counters</button>
      <p className="ios-summon-hint">Counters reset on page reload or by this button.
        Nothing persists to your account and no Summon is granted.</p>
    </div>}

    {activeChapter==="fusion"&&<div className="ios-summon-lab" role="tabpanel" tabIndex={0}
      id="summon-panel-fusion" aria-labelledby="summon-tab-fusion">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">03 · COMBINE TWO LINEAGES</span>
        <h3>Fusion Lab</h3>
      </div>
      <label className="ios-summon-input">Second profession
        <select aria-label="Fusion second profession" value={secondary}
          onChange={e=>changeSecondary(e.target.value as ProfessionId)}>
          {PROFESSIONS.filter(entry=>entry.id!==primary).map(entry=>
            <option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </label>
      <div className="ios-fusion-parents">
        <div><CreaturePortrait id={primary} stage={stage} context="fusion"/>
          <small>{first.species} · {firstVisual.personality}</small></div>
        <span aria-hidden="true">+</span>
        <div><CreaturePortrait id={secondary} stage="base" context="fusion"/>
          <small>{other.species} · {otherVisual.personality}</small></div>
      </div>
      <div className="ios-fusion-recipe" aria-live="polite">
        <span className="ios-overline">CROSS-CAREER BLUEPRINT · NOT OWNED</span>
        <h3>{fusion.name}</h3>
        <p>{fusion.traits.join(" + ")} · {fusion.rarityCap} rarity cap in this sample</p>
      </div>
      <p className="ios-summon-hint">Fusion can inherit traits from both professions.
        It cannot be executed until ownership, consent and a server-side atomic
        recipe system exist. Only the first three career families have original
        3D-style concept illustrations; the remaining symbols are blueprint
        crests, not finished 3D models or owned inventory.</p>
    </div>}

    {activeChapter==="progress"&&<div className="ios-summon-lab" role="tabpanel" tabIndex={0}
      id="summon-panel-progress" aria-labelledby="summon-tab-progress">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">04 · REAL BATTLES → FUTURE GROWTH</span>
        <h3>Win, learn, repeat</h3>
      </div>
      <div className="ios-summon-example-rewards">
        <div><strong>+{victory?.totalXp} XP</strong><small>Verified win example</small></div>
        <div><strong>+{loss?.totalXp} XP</strong><small>Verified loss example</small></div>
      </div>
      <p className="ios-summon-hint">Proposed values only: accepted proof and an actual
        settled result are required. A fixed win bonus helps you advance; losses
        still teach your chosen skill. No money/stake multipliers.</p>
      <p className="ios-summon-hint">Example: 250 audited XP would correspond to
        {ticket.tickets} free summon milestones (next at {ticket.nextAtXp} XP)
        and profession mastery Lv {previewMasteryFromXp(250)}.
        This example never grants XP, tickets or creatures. Any server-recorded XP is displayed separately above and does not include unbackfilled history.</p>
      <IosAction href={"/app/create?seed="+first.seed}>Start a real {first.name} Quest</IosAction>
    </div>}
  </section>;
}
