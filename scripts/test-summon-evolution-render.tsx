import assert from "node:assert/strict";
import {renderToStaticMarkup} from "react-dom/server";
import OwnedFamiliarCollection from "../src/components/ios/OwnedFamiliarCollection";
import {assertOwnedInventorySnapshot}
  from "../src/lib/summons/owned-inventory-contract";

const original={
  id:"evolved-item-123456",speciesId:"software-robotics-rare-base",
  rarity:"rare",form:"base",professionId:"software",occupationId:"robotics",
  createdAt:"2026-10-25T08:00:00.000Z",
};
let checks=0;
const check=(v:boolean,m:string)=>{assert.ok(v,m);checks++};
function render(form:string,xp:number|null,enabled:boolean,signedIn=true){
  const item={...original,form};
  const inventory=assertOwnedInventorySnapshot({
    available:true,source:"server-owned-free-ticket-instances",
    items:[item],totalKnown:true,reason:"Confirmed server receipt",
  });
  return renderToStaticMarkup(
    <OwnedFamiliarCollection inventory={inventory}
      signedIn={signedIn} loading={false} error=""
      evolutionAvailable={enabled}
      verifiedProfessionXp={xp===null?[]:[{professionId:"software",recordedXp:xp}]}/>
  );
}
const ready=render("base",400,true);
check(ready.includes("Review free evolved evolution"),
  "Verified 400 XP allows explicit review of first evolution");
check(ready.includes("Requires 350 current verified"),
  "Threshold is disclosed to the player");
check(ready.includes("OWNED DATABASE INSTANCE"),
  "Server item keeps owned identity alongside evolution");
const below=render("base",349,true);
check(below.includes("Locked until the required Quest XP"),
  "349 real XP cannot enable a 350-XP action");
check(!below.includes("Review free evolved evolution"),
  "Locked stage does not render a spend/transition button");
const unknown=render("base",null,true);
check(unknown.includes("recorded unknown"),
  "Unknown XP is not interpolated or fabricated to zero");
check(!unknown.includes("Review free evolved evolution"),
  "Unknown source never offers a form transition");
const off=render("base",400,false);
check(!off.includes("Review free evolved evolution"),
  "Feature gate closes evolution controls on live preview");
const second=render("evolved",1600,true);
check(second.includes("Review free ascended evolution"),
  "Server-owned evolved item offers the next sequential stage");
check(second.includes("Requires 1600 current verified"),
  "Ascended threshold is accurate and disclosed");
check(!second.includes("Review free evolved evolution"),
  "An evolved item cannot request base evolution again");
const blocked=render("evolved",1599,true);
check(blocked.includes("Locked until the required Quest XP"),
  "1599 cannot trigger ascension");
check(!blocked.includes("Review free ascended evolution"),
  "Second stage remains gated below threshold");
const done=render("ascended",2000,true);
check(done.includes("Ascended: final cosmetic evolution"),
  "Ascended state explicitly terminates progression");
check(!done.includes("Review free"),
  "No phantom fourth evolution stage");
const guest=render("base",400,true,false);
check(guest.includes("Sign in to see"),"Guest sees identity prompt");
check(!guest.includes(original.id),"Guest cannot see item ID or evolution");
console.log("SUMMON_EVOLUTION_RENDER_PASS",checks,"checks");
