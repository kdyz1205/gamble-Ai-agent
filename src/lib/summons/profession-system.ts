/**
 * Pure, versioned game design policy — not a server entitlement or economy.
 * No DB, credit, stake, inventory, or AI-judgment side effects.
 * Randomness is injectable for testing; a future server must use an audited
 * CSPRNG / idempotent grant transaction rather than client Math.random().
 */

export const STARTER = {
  speciesId: "pico", name: "Pico", universal: true, rarity: "starter",
  grantRule: "one free starter for every verified account; server grant not yet implemented",
} as const;

export const PROFESSIONS = [
  {id:"athletics",name:"Sports & Performance",example:"Badminton · coaching · fitness",species:"Stridekin",specialties:[{id:"badminton",name:"Badminton"},{id:"coaching",name:"Athletic coaching"},{id:"endurance",name:"Endurance"}],trait:"Momentum",seed:"move",art:"adventure"},
  {id:"software",name:"Software & AI",example:"Coding · robotics · cybersecurity",species:"Circuitling",specialties:[{id:"coding",name:"Programming"},{id:"robotics",name:"Robotics"},{id:"cybersecurity",name:"Cybersecurity"}],trait:"Logic",seed:"craft",art:"grow"},
  {id:"engineering",name:"Engineering & Design",example:"Mechanical · electrical · product",species:"Forgecub",specialties:[{id:"mechanical",name:"Mechanical engineering"},{id:"electrical",name:"Electrical design"},{id:"industrial",name:"Industrial design"}],trait:"Precision",seed:"craft",art:"mascot"},
  {id:"healthcare",name:"Health & Care",example:"Nursing · clinical · therapy",species:"Pulsepet",specialties:[{id:"nursing",name:"Nursing"},{id:"physical-therapy",name:"Physical therapy"},{id:"medicine",name:"Medicine"}],trait:"Care",seed:"grow",art:"portal"},
  {id:"research",name:"Research & Science",example:"Biology · math · astronomy",species:"Starglim",specialties:[{id:"astronomy",name:"Astronomy"},{id:"biology",name:"Biology"},{id:"mathematics",name:"Mathematics"}],trait:"Discovery",seed:"grow",art:"sky"},
  {id:"art",name:"Arts & Visual Design",example:"Illustration · fashion · film",species:"Prismite",specialties:[{id:"illustration",name:"Illustration"},{id:"ux",name:"UX design"},{id:"photography",name:"Photography"}],trait:"Imagination",seed:"craft",art:"mascotHappy"},
  {id:"music",name:"Music & Performance",example:"Singing · producing · dancing",species:"Echobun",specialties:[{id:"production",name:"Music production"},{id:"vocals",name:"Vocals"},{id:"dance",name:"Dance"}],trait:"Rhythm",seed:"craft",art:"sky"},
  {id:"education",name:"Education & Teaching",example:"Teachers · trainers · tutoring",species:"Sagelet",specialties:[{id:"teaching",name:"Teaching"},{id:"curriculum",name:"Curriculum design"},{id:"mentoring",name:"Mentorship"}],trait:"Wisdom",seed:"grow",art:"portal"},
  {id:"culinary",name:"Culinary & Hospitality",example:"Chef · baking · service",species:"Saffrikin",specialties:[{id:"chef",name:"Cooking"},{id:"baking",name:"Baking"},{id:"coffee",name:"Coffee craft"}],trait:"Flavor",seed:"craft",art:"mascot"},
  {id:"nature",name:"Nature & Agriculture",example:"Gardening · forestry · farming",species:"Mossprite",specialties:[{id:"botany",name:"Botany"},{id:"agriculture",name:"Agriculture"},{id:"forestry",name:"Forestry"}],trait:"Growth",seed:"grow",art:"adventure"},
  {id:"business",name:"Business & Trade",example:"Entrepreneurship · finance · sales",species:"Mercub",specialties:[{id:"finance",name:"Finance"},{id:"entrepreneurship",name:"Entrepreneurship"},{id:"sales",name:"Sales"}],trait:"Strategy",seed:"grow",art:"mascotHappy"},
  {id:"trades",name:"Skilled Trades & Makers",example:"Carpentry · repair · fabrication",species:"Gearsprout",specialties:[{id:"carpentry",name:"Carpentry"},{id:"fabrication",name:"Fabrication"},{id:"repair",name:"Repair"}],trait:"Craft",seed:"craft",art:"grow"},
] as const;

export type ProfessionId = (typeof PROFESSIONS)[number]["id"];
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export const RARITY_ODDS = [
  {id:"common",label:"Common",weight:6000},
  {id:"uncommon",label:"Uncommon",weight:2700},
  {id:"rare",label:"Rare",weight:1000},
  {id:"epic",label:"Epic",weight:260},
  {id:"legendary",label:"Legendary",weight:40},
] as const;

export const RARITY_VERSION = "summon-rarity-v1";
export const FREE_TICKET_POLICY = "free-verified-quest-activities-only-proposal";

export type PityState = {sinceRare:number;sinceEpic:number};
export const INITIAL_PITY_STATE:Readonly<PityState> = {sinceRare:0,sinceEpic:0};
export type DrawResult = {
  rarity: Rarity; pity: "none"|"rare-20"|"epic-80";
  effectiveWeights: ReadonlyArray<{id:Rarity; weight:number}>;
};
export type SummonConcept = DrawResult & {
  speciesId:string; speciesName:string; professionId:ProfessionId;
  specialization:string; occupationId:string; occupationLabel:string;
  masteryLevel:number; traits:readonly string[];
  visualStage:"base"|"evolved"|"ascended"; entitlement:"preview-only";
};

const ruleError=(label:string)=>new RangeError("Invalid "+label);
const isNonnegativeInteger=(n:number)=>Number.isSafeInteger(n)&&n>=0;
const validatePity=(state:PityState)=>{
  if(!isNonnegativeInteger(state.sinceRare)||!isNonnegativeInteger(state.sinceEpic))throw ruleError("pity counter");
};
/** Preview-only counter transitions; no real entitlement is recorded.
 * Every non-Rare increases the Rare miss count; every non-Epic increases
 * the Epic miss count. Rare draws reset Rare pity but not Epic pity.
 */
export function advancePityState(state:PityState,rarity:Rarity):PityState{
  validatePity(state);
  if(!RARITY_ODDS.some(entry=>entry.id===rarity))throw ruleError("rarity");
  const rarePlus=rarity==="rare"||rarity==="epic"||rarity==="legendary";
  const epicPlus=rarity==="epic"||rarity==="legendary";
  return {
    sinceRare:rarePlus?0:Math.min(19,state.sinceRare+1),
    sinceEpic:epicPlus?0:Math.min(79,state.sinceEpic+1),
  };
}

export function previewEffectiveOdds(state:PityState) {
  validatePity(state);
  const guarantee=state.sinceEpic>=79?"epic-80":state.sinceRare>=19?"rare-20":"none";
  const allowed=RARITY_ODDS.filter(entry=>guarantee==="none"||
    (guarantee==="rare-20"?["rare","epic","legendary"].includes(entry.id):
      ["epic","legendary"].includes(entry.id)));
  const total=allowed.reduce((sum,entry)=>sum+entry.weight,0);
  return {guarantee,odds:RARITY_ODDS.map(entry=>({
    id:entry.id,label:entry.label,
    percent:allowed.some(item=>item.id===entry.id)
      ?Math.round(entry.weight*10000/total)/100:0,
  })),rareIn:Math.max(1,20-state.sinceRare),epicIn:Math.max(1,80-state.sinceEpic)};
}

export function professionById(id:ProfessionId){
  const entry=PROFESSIONS.find(p=>p.id===id);
  if(!entry)throw ruleError("profession family");
  return entry;
}

/**
 * Base probabilities sum to 10,000 basis points, independent of paid stakes.
 * On every 20th miss of Rare+, guarantee Rare+; on 80th miss of Epic+,
 * guarantee Epic+ (higher guarantee has priority). Counters MUST be stored
 * by a future authoritative server grant transaction, not by browser state.
 */
export function drawRarity(unitRoll:number,pity:PityState={sinceRare:0,sinceEpic:0}):DrawResult{
  if(!Number.isFinite(unitRoll)||unitRoll<0||unitRoll>=1)throw ruleError("random unit");
  validatePity(pity);
  const guarantee=pity.sinceEpic>=79?"epic-80":pity.sinceRare>=19?"rare-20":"none";
  const allowed=RARITY_ODDS.filter(x=>
    guarantee==="none"|| (guarantee==="rare-20"
      ? ["rare","epic","legendary"].includes(x.id)
      : ["epic","legendary"].includes(x.id)));
  const total=allowed.reduce((a,x)=>a+x.weight,0);
  let position=unitRoll*total;
  for(const row of allowed) {
    if(position<row.weight) {
      return {rarity:row.id,pity:guarantee,
        effectiveWeights:allowed.map(item=>({id:item.id,weight:item.weight}))};
    }
    position-=row.weight;
  }
  // Defensive: floating rounding at the exclusive upper limit.
  const last=allowed[allowed.length-1];
  return {rarity:last.id,pity:guarantee,
    effectiveWeights:allowed.map(item=>({id:item.id,weight:item.weight}))};
}

export function previewSummon(options:{
  professionId:ProfessionId;
  occupationId?:string;
  masteryLevel:number;
  randomUnit:number;
  pity?:PityState;
}):SummonConcept {
  const profession=professionById(options.professionId);
  if(!Number.isSafeInteger(options.masteryLevel)||
      options.masteryLevel<1||options.masteryLevel>5)throw ruleError("mastery level");
  const occupation=profession.specialties.find(s=>s.id===options.occupationId) ??
    (options.occupationId===undefined?profession.specialties[0]:undefined);
  if(!occupation)throw ruleError("occupation/specialty");
  const result=drawRarity(options.randomUnit,options.pity);
  const stage=options.masteryLevel>=5?"ascended":
    options.masteryLevel>=3?"evolved":"base";
  const title=stage==="ascended"?"Astral ":
    stage==="evolved"?"Radiant ":"";
  return {
    ...result,speciesId:profession.id+"-"+occupation.id+"-"+result.rarity+"-"+stage,
    speciesName:title+profession.species,professionId:profession.id,
    specialization:profession.name,occupationId:occupation.id,
    occupationLabel:occupation.name,masteryLevel:options.masteryLevel,
    traits:[profession.trait,occupation.name,result.rarity],visualStage:stage,
    entitlement:"preview-only",
  };
}
const rank=(rarity:Rarity)=>RARITY_ODDS.findIndex(x=>x.id===rarity);

/**
 * A fusion is order-independent and CANNOT generate a better rarity than
 * its rarer input simply by recombining the same two components. Real
 * fusion will require authenticated ownership + atomic, consented exchange.
 */
export function previewFusion(a:SummonConcept,b:SummonConcept) {
  if(a.professionId===b.professionId)throw ruleError("fusion: two distinct professions");
  const [left,right]=[a,b].sort((x,y)=>x.professionId.localeCompare(y.professionId));
  const maxTier=Math.min(rank(left.rarity),rank(right.rarity));
  const capped=RARITY_ODDS[Math.max(0,maxTier)].id;
  const fixed:Record<string,string>={
    "athletics+engineering":"Velocity Golem",
    "healthcare+software":"Carebyte",
    "art+music":"Prism Echo",
    "culinary+nature":"Basil Bun",
  };
  const code=left.professionId+"+"+right.professionId;
  return {
    blueprintId:"fusion-v1:"+code+":"+left.occupationId+"+"+right.occupationId+":"+capped,
    name:fixed[code]||left.speciesName+" × "+right.speciesName,
    professions:[left.professionId,right.professionId] as const,
    traits:[...new Set([...left.traits.filter(t=>t!==left.rarity),
      ...right.traits.filter(t=>t!==right.rarity)])],
    rarityCap:capped,entitlement:"preview-only" as const,
    note:"Fusion has no real ownership or consumable action yet. Rarity upgrade is not guaranteed.",
  };
}

export const MASTERY_XP_THRESHOLDS = [0,100,350,800,1600] as const;

export function previewMasteryFromXp(verifiedProfessionXp:number) {
  if(!isNonnegativeInteger(verifiedProfessionXp))throw ruleError("profession XP");
  return Math.max(1,MASTERY_XP_THRESHOLDS.filter(t=>verifiedProfessionXp>=t).length);
}
const thresholdForTicket=(ticketNumber:number)=>
  100*ticketNumber+25*ticketNumber*(ticketNumber-1);

/** Free-only hypothetical summon-ticket milestones, NOT a live credit or item grant. */
export function previewTicketMilestones(verifiedXp:number) {
  if(!isNonnegativeInteger(verifiedXp)||verifiedXp>10_000_000)
    throw ruleError("verified XP");
  let tickets=Math.max(0,Math.floor((Math.sqrt(5625+100*verifiedXp)-75)/50));
  while(tickets>0&&thresholdForTicket(tickets)>verifiedXp) tickets--;
  while(thresholdForTicket(tickets+1)<=verifiedXp) tickets++;
  return {tickets,nextAtXp:thresholdForTicket(tickets+1),
    source:"proposal-not-awarded" as const};
}

export type BattleProof={status:"settled"|"other";proofAccepted:boolean;
  participantEligible:boolean;outcome:"win"|"loss"|"draw";professionId:ProfessionId};
/**
 * Proposal only: participation + accepted proof + settlement yield skill XP;
 * wins add a fixed bonus, losses still progress. No money/stake multiplier.
 * A future server must issue these only once per unique settlement event.
 */
export function previewVerifiedBattleXp(b:BattleProof) {
  professionById(b.professionId);
  if(b.status!=="settled"||!b.proofAccepted||!b.participantEligible)return null;
  const proofXp=40,settlementXp=40,winBonus=b.outcome==="win"?20:
    b.outcome==="draw"?10:0;
  return {professionId:b.professionId,proofXp,settlementXp,winBonus,
    totalXp:proofXp+settlementXp+winBonus,source:"proposal-not-awarded" as const};
}
