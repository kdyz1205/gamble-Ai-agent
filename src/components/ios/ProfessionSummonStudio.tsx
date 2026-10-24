"use client";

import {useState} from "react";
import {IosArt,IosAction,visuals} from "./IOSAppUI";
import {
  PROFESSIONS,RARITY_ODDS,professionById,previewFusion,previewSummon,
  previewVerifiedBattleXp,previewTicketMilestones,previewMasteryFromXp,
  type ProfessionId,type SummonConcept,
} from "@/lib/summons/profession-system";

/**
 * Playable rules preview only: real species ownership, profession XP and
 * RNG grants require an authenticated, audited server ledger in a later PR.
 * No credit, stake, DB, inventory, or settlement mutations occur here.
 */
export default function ProfessionSummonStudio(){
  const [primary,setPrimary]=useState<ProfessionId>("athletics");
  const [occupation,setOccupation]=useState("badminton");
  const [secondary,setSecondary]=useState<ProfessionId>("software");
  const [mastery,setMastery]=useState(1);
  const [draw,setDraw]=useState<SummonConcept|null>(null);
  const [draws,setDraws]=useState(0);
  const first=professionById(primary);
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
    setDraw(null);setDraws(0);
  };
  const changeSecondary=(next:ProfessionId)=>{
    professionById(next);
    if(next===primary)return;
    setSecondary(next);
  };
  const tryDraw=()=>{
    // A visual *example*, never a real item, grant, or guaranteed probability
    // source. A real service must use server-side CSPRNG and disclose odds.
    setDraw(previewSummon({professionId:primary,occupationId:occupation,
      masteryLevel:mastery,randomUnit:Math.random()}));
    setDraws(n=>n+1);
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

    <div className="ios-summon-lab">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">01 · CHOOSE A PROFESSION</span>
        <h3>Career affinity</h3>
      </div>
      <label className="ios-summon-input">Profession family
        <select aria-label="Profession family" value={primary}
          onChange={event=>changePrimary(event.target.value as ProfessionId)}>
          {PROFESSIONS.map(prof=><option key={prof.id} value={prof.id}>{prof.name}</option>)}
        </select>
      </label>
      <label className="ios-summon-input">Specific profession or skill
        <select aria-label="Specific profession or skill" value={occupation} onChange={e=>{
          setOccupation(e.target.value);setDraw(null);setDraws(0);
        }}>
          {first.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <div className="ios-summon-species">
        <div className="ios-summon-species__art">
          <IosArt src={visuals[first.art]} alt={"Existing illustration used as concept mood art for "+first.species}/>
        </div>
        <div><span className="ios-overline">POSSIBLE SPECIES · CONCEPT</span>
          <h3>{first.species}</h3>
          <p>{first.example}</p>
          <small>Affinity: {first.trait} · Specialization: {occupationName}</small>
        </div>
      </div>
      <label className="ios-summon-input ios-summon-slider">
        <span>Hypothetical profession mastery · Lv {mastery}</span>
        <input aria-label="Preview profession mastery level" type="range" min={1}
          max={5} step={1} value={mastery} onChange={e=>{
            setMastery(Number(e.target.value));setDraw(null);setDraws(0);
          }}/>
        <small>{mastery===1?"New explorer":mastery<3?"Learning your craft":
          mastery<5?"Evolved forms possible":"Ascended forms possible"} · sample only, not earned</small>
      </label>
    </div>

    <div className="ios-summon-lab">
      <div className="ios-summon-lab__title">
        <span className="ios-overline">02 · A CHANCE TO SUMMON</span>
        <h3>Random rarity, visible odds</h3>
      </div>
      <div className="ios-summon-odds" aria-label="Example base summon odds">
        {RARITY_ODDS.map(row=><div key={row.id}>
          <span>{row.label}</span><strong>{row.weight/100}%</strong>
        </div>)}
      </div>
      <p className="ios-summon-hint">Draft rule: every 20th consecutive attempt without Rare+ guarantees Rare+;
        every 80th without Epic+ guarantees Epic+. Higher mastery reveals new forms.
        Odds never improve because of the amount staked.</p>
      <button className="ios-primary" type="button" onClick={tryDraw}>
        Preview a random summon <span aria-hidden="true">✦</span>
      </button>
      <div className="ios-summon-result" role="status" aria-live="polite">
        {draw?<><span className="ios-overline">SIMULATION {draws} · NO ITEM AWARDED</span>
          <h3>{draw.speciesName}</h3>
          <p>{draw.rarity.toUpperCase()} · {draw.occupationLabel} · {draw.visualStage} form</p>
        </>:<><span className="ios-overline">SANDBOX · FREE PREVIEW</span>
          <h3>What could you summon?</h3>
          <p>Tap once to see one sample outcome. This does not use or award a real ticket.</p></>}
      </div>
    </div>

    <div className="ios-summon-lab">
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
        <div><IosArt src={visuals[first.art]} alt="First occupation concept illustration"/>
          <small>{first.species}</small></div>
        <span aria-hidden="true">+</span>
        <div><IosArt src={visuals[other.art]} alt="Second occupation concept illustration"/>
          <small>{other.species}</small></div>
      </div>
      <div className="ios-fusion-recipe" aria-live="polite">
        <span className="ios-overline">CROSS-CAREER BLUEPRINT · NOT OWNED</span>
        <h3>{fusion.name}</h3>
        <p>{fusion.traits.join(" + ")} · {fusion.rarityCap} rarity cap in this sample</p>
      </div>
      <p className="ios-summon-hint">Fusion can inherit traits from both professions.
        It cannot be executed until ownership, consent and a server-side atomic
        recipe system exist. The artwork here is a mood reference, not a finished unique species.</p>
    </div>

    <div className="ios-summon-lab">
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
        There is no XP or summon-ticket ledger connected yet.</p>
      <IosAction href={"/app/create?seed="+first.seed}>Start a real {first.name} Quest</IosAction>
    </div>
  </section>;
}
