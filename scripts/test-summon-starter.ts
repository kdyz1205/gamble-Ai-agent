import assert from "node:assert/strict";
import {readStarterEntitlement,readSummonCatalog}
  from "../src/lib/summons/starter-entitlement";
import {GET as getCatalog} from "../src/app/api/summons/catalog/route";

let checks=0;
function equal(a:unknown,b:unknown,label:string){assert.deepEqual(a,b,label);checks++;}
function truth(condition:boolean,label:string){assert.ok(condition,label);checks++;}

for(const absent of [undefined,null,"","  ",0,{},[],"x".repeat(257)]){
  equal(readStarterEntitlement(absent),null,"Unverified account cannot get starter");
}
const alpha=readStarterEntitlement("user-alpha");
const beta=readStarterEntitlement("user-beta");
truth(!!alpha&&!!beta,"Authenticated accounts receive universal starter");
equal(alpha?.speciesId,"pico","Pico species is fixed");
equal(beta?.speciesId,"pico","Every account starts with Pico");
equal(alpha?.initialForEveryAccount,true,"Universal, not based on winnings");
equal(alpha?.persistedInventory,false,"Not falsely claiming minted inventory");
equal(alpha?.tradable,false,"No trade without real inventory");
equal(alpha?.supportsFusion,false,"Pico entitlement is not a recipe input yet");
equal(alpha?.awardedXp,null,"Unknown XP never displayed as zero");
equal(alpha?.awardedTickets,null,"Unknown tickets never displayed as zero");
equal(readStarterEntitlement("user-alpha"),alpha,"Same rule for same user");
truth(!("userId" in (alpha||{})),"No user identifier leaked in catalog");
const cat=readSummonCatalog();
equal(cat.version,"summon-professions-v1","Catalog versioned");
equal(cat.availability,"concept-preview-only","Not real inventory");
equal(cat.categories.length,12,"12 game families");
equal(cat.categories.reduce((sum,x)=>sum+x.specialties.length,0),36,
  "36 sample occupations");
equal(cat.rarityOdds.reduce((sum,x)=>sum+x.percent,0),100,
  "Percentages add to 100");
equal(cat.starter.free,true,"Free Pico starter");
equal(cat.restrictions.cashPaidRandomDraws,false,"No cash gacha");
equal(cat.restrictions.verifiedXpLedgerAvailable,false,"No fake ledger");
equal(cat.restrictions.actualFusionAvailable,false,"No fake Fusion");
truth(cat.categories.every(c=>c.grantStatus==="not-collectible"),
  "All non-Pico concepts are not yet collectible");
getCatalog().then(async response=>{
  equal(response.status,200,"Actual public catalog handler works");
  equal(response.headers.get("Cache-Control"),"public, max-age=300",
    "Versioned catalog cache explicit");
  const payload=await response.json();
  equal(payload.categories.length,12,"Actual response includes all families");
  equal(payload.starter.speciesId,"pico","Actual response specifies Pico");
  truth(!JSON.stringify(payload).includes("user-alpha"),"Catalog is not user-specific");
  console.log("SUMMON_STARTER_CATALOG_TESTS_PASS",checks,"checks");
}).catch(error=>{console.error(error);process.exitCode=1});
