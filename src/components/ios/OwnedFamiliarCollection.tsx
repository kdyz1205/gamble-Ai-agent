"use client";

import Image from "next/image";
import {PROFESSIONS,type ProfessionId} from "@/lib/summons/profession-system";
import {creatureRenderFor} from "@/lib/summons/creature-render-manifest";
import type {CreatureStage} from "@/lib/summons/creature-visual-bible";
import type {OwnedInventorySnapshot,OwnedFamiliar}
  from "@/lib/summons/owned-inventory-contract";

function OwnedFamiliarCard({item}:{item:OwnedFamiliar}){
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
    </div>
  </article>;
}

export default function OwnedFamiliarCollection({inventory,signedIn,loading,error}:{
  inventory:OwnedInventorySnapshot|null;
  signedIn:boolean;loading:boolean;error:string;
}){
  return <section className="ios-section" aria-label="Your Owned Familiars">
    <div className="ios-section__heading">
      <div><small>ACCOUNT-BOUND COLLECTION</small><h2>My owned Familiars</h2></div>
    </div>
    {!signedIn?<p>Sign in to see your own persistent Summon collection.</p>:
      loading?<p role="status">Checking your actual Summon inventory...</p>:
      error?<p role="alert">Owned items could not be verified. No inventory is being guessed.</p>:
      !inventory||!inventory.available?
        <p>Persistent free Summon inventory is not active here. Collection ownership is unknown, not zero.</p>:
      inventory.items.length===0?
        <p>No owned free-ticket Summons have been recorded for your account under this system yet. Pico is shown separately.</p>:
      <div style={{display:"grid",gap:12}}>
        <p><strong>{inventory.items.length} confirmed items in the loaded record.</strong>
          {inventory.totalKnown?" All recorded items fit in this view.":" Showing only the latest 50; older owned items may exist."}
        </p>
        <div role="list" style={{display:"grid",gap:12}}>
          {inventory.items.map(item=><div key={item.id} role="listitem">
            <OwnedFamiliarCard item={item}/>
          </div>)}
        </div>
      </div>}
    <small>Only existing owner-scoped database records from verified free-ticket draws appear here.
      Career Atlas demonstrations, local random previews and unearned 3D prototypes do not enter your collection.
      This view does not spend tickets or change item ownership.</small>
  </section>;
}
