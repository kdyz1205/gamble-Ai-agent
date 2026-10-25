import assert from "node:assert/strict";
import {assertOwnedInventorySnapshot}
  from "../src/lib/summons/owned-inventory-contract";

let checks=0;
function eq(actual:unknown,expected:unknown,label:string){
  assert.deepEqual(actual,expected,label);checks++;
}
function denied(input:unknown,label:string){
  assert.throws(()=>assertOwnedInventorySnapshot(input),label);checks++;
}
const item={
  id:"cuidownedsummon123",speciesId:"software-robotics-rare-base",
  rarity:"rare",form:"base",professionId:"software",
  occupationId:"robotics",createdAt:"2026-10-24T12:00:00.000Z",
};
const valid={
  available:true,source:"server-owned-free-ticket-instances",
  items:[item],totalKnown:true,
  reason:"Only authenticated persisted free-ticket Summons are shown",
};
const withChange=(fn:(row:typeof item)=>void)=>{
  const copy=structuredClone(valid);fn(copy.items[0]);return copy;
};
eq(assertOwnedInventorySnapshot(valid),valid,"One owned instance retains exact ID");
eq(assertOwnedInventorySnapshot({...valid,items:[]}),{...valid,items:[]},
  "No minted item means true zero when persistence is enabled");
const disabled={available:false,extraSummons:null,
  reason:"Persistent inventory is not enabled"};
eq(assertOwnedInventorySnapshot(disabled),disabled,
  "Disabled inventory remains unknown rather than empty");
denied(null,"null is not an inventory reply");
denied(undefined,"missing snapshot must fail closed");
denied({...disabled,extraSummons:0},"Disabled must never fake zero balance");
denied({...disabled,items:[]},"Disabled should never expose empty owned items");
denied({...valid,source:"local-preview"},"Local preview is not owned");
denied({...valid,totalKnown:false},"Total-known cannot lie on short page");
denied({...valid,items:Array.from({length:51},(_,i)=>({
  ...item,id:"summonrecord"+String(i).padStart(8,"0"),
}))},"Over-cap inventory is not complete");
denied({...valid,items:[item,item]},"Duplicate ownership IDs denied");
denied(withChange(x=>{x.id="bad";}),"Malformed IDs denied");
denied(withChange(x=>{x.rarity="mythical";}),"Invalid rarity denied");
denied(withChange(x=>{x.form="supercharged";}),"Unsupported form denied");
denied(withChange(x=>{x.occupationId="carpentry";}),"Cross-career occupation denied");
denied(withChange(x=>{x.professionId="unknown";}),"Unknown family denied");
denied(withChange(x=>{x.speciesId="software-robotics-legendary-base";}),
  "Fabricated rarity in species ID denied");
denied(withChange(x=>{x.speciesId="software-robotics-rare-ascended";}),
  "Species identity is stable while evolution form can change");
denied(withChange(x=>{x.createdAt="yesterday";}),"Invented date denied");
denied(withChange(x=>{x.createdAt="";}),"Empty date denied");
eq(assertOwnedInventorySnapshot(withChange(x=>{x.form="evolved";})).available,true,
  "Independent evolved form can retain immutable base species identity");
eq(assertOwnedInventorySnapshot({...valid,items:[item,{
  ...item,id:"cuidownedsecond9876",professionId:"athletics",
  occupationId:"badminton",speciesId:"athletics-badminton-rare-base",
}]}).available,true,"Two different careers can coexist in one owned collection");
const fullPage=assertOwnedInventorySnapshot({...valid,items:Array.from({length:50},(_,i)=>({
  ...item,id:"summonrecord"+String(i).padStart(8,"0"),
})),totalKnown:false});
if(!fullPage.available)throw Error("Full-page fixture must be enabled");
eq(fullPage.totalKnown,false,
  "Full 50 row page conservatively warns that older items may exist");
console.log("OWNED_SUMMON_INVENTORY_CONTRACT_PASS",checks,"checks");
