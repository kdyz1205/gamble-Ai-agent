/**
 * Summoner.world original creature art bible, v1.
 *
 * Visual concept metadata ONLY. This file never mints creatures, grants XP,
 * promises ownership, classifies real-life credentials, or changes Quest rules.
 * Each family must be a DISTINCT silhouette: recolors of Pico are not species.
 */
import {PROFESSIONS,type ProfessionId} from "./profession-system";

export type CreatureStage="base"|"evolved"|"ascended";
export type CreatureVisualBlueprint={
  silhouette:string;
  material:string;
  signature:string;
  movement:string;
  personality:string;
  colors:readonly [string,string,string];
  stageNames:readonly [string,string,string];
  occupationMotifs:readonly [string,string,string];
};

/** Source of truth for art production: 12 silhouettes and 36 skill accents. */
export const CREATURE_VISUALS={
  athletics:{
    silhouette:"Hare-like spring legs, ribbon tail and long asymmetrical ears",
    material:"Soft porcelain fur with satin motion ribbons",
    signature:"Two kinetic loops wrap the ankles, never a sports uniform",
    movement:"Fast anticipation, curved leap, soft landing",
    personality:"Competitive but encouraging",
    colors:["#F9F2E9","#FA806D","#80D6EE"],
    stageNames:["Stridekin","Dashstride","Cometstride"],
    occupationMotifs:["shuttle-feather arc","coaching whistle-shaped ribbon","endurance trail sparks"],
  },
  software:{
    silhouette:"Small six-sided otter with two floating antenna fins and a segmented tail",
    material:"Pearl ceramic, translucent blue glass and embedded light traces",
    signature:"Disconnected holographic logic tiles orbit the tail",
    movement:"Orbit, recombine, playful precise hops",
    personality:"Curious, analytical, easily distracted by patterns",
    colors:["#E1F8FF","#69BFF3","#9D8BFF"],
    stageNames:["Circuitling","Logicwhirl","Neuralcrest"],
    occupationMotifs:["code-glyph tail tiles","robotic joint sparks","shield-shaped signal ring"],
  },
  engineering:{
    silhouette:"Pangolin cub with interlocking triangular shell plates and heavy forefeet",
    material:"Warm enamel, brushed copper edges and cloudy quartz joints",
    signature:"A modular shoulder tool swivels without hiding its face",
    movement:"Builds tiny bridges, tightens, folds shell",
    personality:"Patient and stubbornly inventive",
    colors:["#FFE3AA","#DD9D4F","#93BDD0"],
    stageNames:["Forgecub","Gearmantle","Archforge"],
    occupationMotifs:["caliper-tail tip","circuit-channel plate","drafting compass crest"],
  },
  healthcare:{
    silhouette:"Round seal-axolotl with two layered gill fins and a heart-shaped back",
    material:"Opalescent jelly skin, soft velvet flippers and bioluminescent core",
    signature:"One soft pulse wave expands from its back on healing poses",
    movement:"Slow float, gentle brace, reassuring head tilt",
    personality:"Protective, attentive, gentle",
    colors:["#FFF0E8","#F5AFAE","#8BD5C7"],
    stageNames:["Pulsepet","Kindwave","Aurapulse"],
    occupationMotifs:["care droplet","rehab stretch bands","diagnostic pulse halo"],
  },
  research:{
    silhouette:"Tiny telescope-moth with round head, star-map wings and antenna lenses",
    material:"Powdered velvet wing dust and midnight opal tips",
    signature:"Constellation dots form different patterns when learning",
    movement:"Hovers, pauses to observe, maps light paths",
    personality:"Quiet, inquisitive, exacting",
    colors:["#DDE7FF","#8186DB","#EBC3FF"],
    stageNames:["Starglim","Nebularis","Orbitseer"],
    occupationMotifs:["orbit constellation","cellular spiral","geometric proof stars"],
  },
  art:{
    silhouette:"Chameleon-butterfly with folded stained-glass sails and paint-drop tail",
    material:"Semi-translucent stained glass, soft matte body and watercolor edges",
    signature:"Wing panes shift shape without changing the family silhouette",
    movement:"Slow gesture, graceful wing unfurl, surprised spin",
    personality:"Expressive, whimsical, observant",
    colors:["#FFDAE7","#D99BFF","#7DE3DE"],
    stageNames:["Prismite","Colorflare","Prismarch"],
    occupationMotifs:["illustration ribbon","interface grid facets","camera-aperture crest"],
  },
  music:{
    silhouette:"Long-eared jelly rabbit with two floating soundwave loops",
    material:"Soft felt body and clear resonant glass ears",
    signature:"Floating loops expand in rhythm; never a held microphone",
    movement:"Bounces on beats, pauses on silence",
    personality:"Sociable and improvisational",
    colors:["#EBDFFF","#AF9BE9","#F6C878"],
    stageNames:["Echobun","Resobun","Symphoria"],
    occupationMotifs:["audio-mixing nodes","vocal waveform halo","dance-step spiral"],
  },
  education:{
    silhouette:"Little hedgehog with curled parchment leaves instead of spikes",
    material:"Linen fluff, folded paper petals and tiny amber eyes",
    signature:"Its back opens into a floating book-like fan",
    movement:"Demonstrates, waits, and celebrates small attempts",
    personality:"Patient mentor and passionate storyteller",
    colors:["#FFF0C8","#8FC9AF","#88AADD"],
    stageNames:["Sagelet","Storysage","Wisdomgrove"],
    occupationMotifs:["teaching chalk stars","lesson compass","mentor lantern"],
  },
  culinary:{
    silhouette:"Tiny marmot with steam-swirled whiskers, rounded paws and puff tail",
    material:"Toasted marshmallow fur and amber sugar-glass accents",
    signature:"Three steam curls orbit it rather than a chef hat",
    movement:"Stirs invisible aromas, sniffs, shares",
    personality:"Generous, meticulous, playful",
    colors:["#FFE4BE","#F4A96B","#DDA5AE"],
    stageNames:["Saffrikin","Aromafin","Feastflare"],
    occupationMotifs:["herb-slice swirl","bread-crumb stars","coffee crema spiral"],
  },
  nature:{
    silhouette:"Tiny deer-sprout with branching leaf antlers and moss mane",
    material:"Brushed moss velvet, dew glass and flexible wood",
    signature:"The antlers grow a new leaf pattern each evolutionary stage",
    movement:"Quiet steps, plants seeds, responds to breeze",
    personality:"Reflective and resilient",
    colors:["#DBF5DD","#7FBF9A","#F1DB8A"],
    stageNames:["Mossprite","Branchtide","Grovewarden"],
    occupationMotifs:["botany leaf-veins","seed canopy","forestry tree rings"],
  },
  business:{
    silhouette:"Small compass-backed civet with triangular ears and a crescent tail",
    material:"Cream plush, amber glass scales and brushed brass accents",
    signature:"A rotating navigation dial on the back symbolizes decisions",
    movement:"Plots routes, gathers maps, offers a handshake",
    personality:"Resourceful, candid, strategic",
    colors:["#FFE9BF","#D9B36B","#9BC9D0"],
    stageNames:["Mercub","Tradeglide","Northstarrow"],
    occupationMotifs:["balanced-scale crest","venture map dots","connection ribbons"],
  },
  trades:{
    silhouette:"Burrowing mole with segmented origami claws and tool-like tail",
    material:"Warm stone, teal enamel, articulated bronze fingertip plates",
    signature:"Its tail folds into different non-weapon maker attachments",
    movement:"Tinkers, digs, polishes, proudly presents",
    personality:"Practical, attentive, resourceful",
    colors:["#E6F1E9","#7DAEA4","#D8A77A"],
    stageNames:["Gearsprout","Craftburrow","Masterroot"],
    occupationMotifs:["woodgrain knot","print-layer contour","repair-loop gear"],
  },
} as const satisfies Record<ProfessionId,CreatureVisualBlueprint>;

export function creatureVisualFor(id:ProfessionId):CreatureVisualBlueprint{
  const value:CreatureVisualBlueprint|undefined=CREATURE_VISUALS[id];
  if(!value)throw new RangeError("Unknown profession creature design");
  return value;
}

export const CREATURE_ATLAS=PROFESSIONS.map(family=>({
  ...family,
  visual:creatureVisualFor(family.id),
  artStatus:"production-art-pending" as const,
  ownership:"concept-not-owned" as const,
  occupationCount:family.specialties.length,
}));

export function creatureStageForMastery(level:number):CreatureStage{
  if(!Number.isSafeInteger(level)||level<1||level>5)
    throw new RangeError("Invalid mastery level");
  return level>=5?"ascended":level>=3?"evolved":"base";
}
export function stageNameFor(id:ProfessionId,level:number){
  const stage=creatureStageForMastery(level);
  return creatureVisualFor(id).stageNames[stage==="base"?0:stage==="evolved"?1:2];
}
