import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import OwnedFamiliarCollection from "../src/components/ios/OwnedFamiliarCollection";
import {assertOwnedInventorySnapshot}
  from "../src/lib/summons/owned-inventory-contract";

let checks=0;
const includes=(html:string,value:string,label:string)=>{
  assert.ok(html.includes(value),label);checks++;
};
const excludes=(html:string,value:string,label:string)=>{
  assert.ok(!html.includes(value),label);checks++;
};
const item={
  id:"cuidowned123456789",speciesId:"software-robotics-rare-base",
  rarity:"rare",form:"base",professionId:"software",occupationId:"robotics",
  createdAt:"2026-10-24T12:00:00.000Z",
};
const verified=assertOwnedInventorySnapshot({
  available:true,source:"server-owned-free-ticket-instances",
  items:[item],totalKnown:true,reason:"Verified database receipts",
});
const ui=(opts:{inventory:typeof verified;signedIn:boolean;loading:boolean;error:string})=>
  renderToStaticMarkup(<OwnedFamiliarCollection {...opts}/>);
const owned=ui({inventory:verified,signedIn:true,loading:false,error:""});
includes(owned,"OWNED DATABASE INSTANCE","Actual owned list marked explicitly");
includes(owned,"owned-summon-"+item.id,"Exact real instance ID exposed on owned card");
includes(owned,"Circuitling","Profession species is derived from signed catalog");
includes(owned,"Robotics","Exact earned specialization is displayed");
includes(owned,"Recorded 2026-10-24 UTC","SSR date stays stable across device time zones");
includes(owned,"RARE","Rarity comes from verified server row");
includes(owned,"Concept artwork only","Image never impersonates authentic instance photograph");
excludes(owned,"No owned free-ticket Summons have been recorded","Existing ownership cannot show as empty");

const anon=ui({inventory:verified,signedIn:false,loading:false,error:""});
includes(anon,"Sign in to see your own","Anonymous viewer is prompted to authenticate");
excludes(anon,item.id,"Anonymous must not see private owned instance IDs");

const error=ui({inventory:verified,signedIn:true,loading:false,error:"service offline"});
includes(error,"Owned items could not be verified","Errors display a clear unknown state");
excludes(error,item.id,"Error path hides stale ownership rows");

const pending=ui({inventory:verified,signedIn:true,loading:true,error:""});
includes(pending,"Checking your actual","Loading never fabricates owned inventory");
excludes(pending,item.id,"Loading hides stale items");

const off=assertOwnedInventorySnapshot({
  available:false,extraSummons:null,reason:"Disabled",
});
const disabled=ui({inventory:off,signedIn:true,loading:false,error:""});
includes(disabled,"ownership is unknown, not zero","Feature disabled is not a fabricated empty bag");
excludes(disabled,"confirmed items","Disabled state contains no minted count");

const blank=assertOwnedInventorySnapshot({
  available:true,source:"server-owned-free-ticket-instances",
  items:[],totalKnown:true,reason:"No records",
});
const empty=ui({inventory:blank,signedIn:true,loading:false,error:""});
includes(empty,"No owned free-ticket Summons","Real empty bag is reported distinctly from disabled");
console.log("OWNED_FAMILIAR_RENDER_PASS",checks,"checks");
