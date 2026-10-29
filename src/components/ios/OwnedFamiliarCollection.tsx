"use client";

import Image from "next/image";
import {SumText} from "@/components/locale/SumLanguage";
import {PROFESSIONS,type ProfessionId} from "@/lib/summons/profession-system";
import {creatureRenderFor} from "@/lib/summons/creature-render-manifest";
import type {CreatureStage} from "@/lib/summons/creature-visual-bible";
import type {OwnedInventorySnapshot,OwnedFamiliar}
  from "@/lib/summons/owned-inventory-contract";
import FamiliarEvolutionAction from "./FamiliarEvolutionAction";

function OwnedFamiliarCard({item,evolutionAvailable,verifiedXp,onEvolutionComplete}:{
  item:OwnedFamiliar;evolutionAvailable:boolean;verifiedXp:number|null;
  onEvolutionComplete?:()=>void;
}){
  const career=PROFESSIONS.find(p=>p.id===item.professionId);
  const professionId=item.professionId as ProfessionId;
  const stage=item.form as CreatureStage;
  const image=creatureRenderFor(professionId,stage);
  const occupation=career?.specialties.find(p=>p.id===item.occupationId);
  return <article className="ios-summon-species"
    data-testid={"owned-summon-"+item.id} aria-label={"Owned Familiar "+item.speciesId}>
    <div className="ios-summon-species__art" style={{
      display:"grid",placeItems:"center",overflow:"hidden",
      background:"linear-gradient(135deg,#e8eaff,#fff3fa)",
    }}>
      {image?<Image src={image.src} alt={image.alt+" (concept illustration)"}
        width={92} height={107} style={{objectFit:"cover",width:"100%",height:"100%"}}/>:
        <span aria-label="No portrait has been drawn for this species"
          style={{fontSize:30,fontWeight:800,color:"#7365ac"}}>
          {career?.species.slice(0,1)??"?"}
        </span>}
    </div>
    <div style={{minWidth:0,overflowWrap:"anywhere"}}>
      <span className="ios-overline">OWNED DATABASE INSTANCE</span>
      <h3>{career?.species??"Unknown Familiar"}</h3>
      <p>{career?.name??item.professionId} / {occupation?.name??item.occupationId}</p>
      <p><strong>{item.rarity.toUpperCase()}</strong> - {item.form} form</p>
      <small>Recorded {item.createdAt.slice(0,10)} UTC.</small>
      {image?<small>Concept artwork only; the item ID below is your actual inventory record.</small>:
        <small>Illustration not ready; ownership is independently recorded.</small>}
      <small style={{display:"block",overflowWrap:"anywhere"}}>
        Item ID: {item.id}
      </small>
      {evolutionAvailable?<FamiliarEvolutionAction item={item}
        verifiedXp={verifiedXp} onEvolutionComplete={onEvolutionComplete}/>:null}
    </div>
  </article>;
}

export default function OwnedFamiliarCollection({
  inventory,signedIn,loading,error,evolutionAvailable=false,
  verifiedProfessionXp=[],onEvolutionComplete,
}:{
  inventory:OwnedInventorySnapshot|null;
  signedIn:boolean;loading:boolean;error:string;
  evolutionAvailable?:boolean;
  verifiedProfessionXp?:readonly {professionId:string;recordedXp:number}[];
  onEvolutionComplete?:()=>void;
}){
  return <section className="ios-section" aria-label="Your Owned Familiars">
    <div className="ios-section__heading">
      <div><small><SumText en="ACCOUNT-BOUND COLLECTION" zh="账号的真实收藏"/></small><h2><SumText en="My owned Familiars" zh="我拥有的召唤兽"/></h2></div>
    </div>
    {!signedIn?<p><SumText en="Sign in to see your own persistent Summon collection." zh="登录后查看属于你的永久召唤兽收藏。"/></p>:
      loading?<p role="status"><SumText en="Checking your actual Summon inventory..." zh="正在读取真实的召唤兽收藏…"/></p>:
      error?<p role="alert"><SumText en="Owned items could not be verified. No inventory is being guessed." zh="暂时无法核实收藏，不会推测或伪造你拥有的物品。"/></p>:
      !inventory||!inventory.available?
        <p><SumText en="Persistent free Summon inventory is not active here. Collection ownership is unknown, not zero." zh="此服务器尚未启用永久召唤兽收藏。当前拥有数量未知，不是零。"/></p>:
      inventory.items.length===0?
        <p><SumText en="No owned free-ticket Summons have been recorded for your account under this system yet. Pico is shown separately." zh="当前系统尚未记录此账号通过免费票据获得的召唤兽，Pico 单独展示。"/></p>:
      <div style={{display:"grid",gap:12}}>
        <p><strong>{inventory.items.length} confirmed items in the loaded record.</strong>
          {inventory.totalKnown?" All recorded items fit in this view.":" Showing only the latest 50; older owned items may exist."}
        </p>
        <div role="list" style={{display:"grid",gap:12}}>
          {inventory.items.map(item=><div key={item.id} role="listitem">
            <OwnedFamiliarCard item={item}
              evolutionAvailable={evolutionAvailable}
              verifiedXp={verifiedProfessionXp.find(x=>x.professionId===item.professionId)?.recordedXp??null}
              onEvolutionComplete={onEvolutionComplete}/>
          </div>)}
        </div>
      </div>}
    <small><SumText en="Only existing owner-scoped database records from verified free-ticket draws appear here. Career Atlas demonstrations, local random previews and unearned 3D prototypes do not enter your collection. This view does not spend tickets or change item ownership."
      zh="这里只显示经核实、属于当前账号的免费票据抽取记录。图鉴演示、随机预览和未获得的 3D 原型不会加入收藏，查看页面也不会花费票据或改变归属。"/></small>
  </section>;
}
