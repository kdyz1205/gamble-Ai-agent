/**
 * Original commissioned-looking 3D-style image renders for the first three
 * Summoner.world career species. These are *2D pictures*, not turntable meshes,
 * not owned inventory and never account XP/rarity receipts.
 *
 * Never infer an asset from a species name; paths are explicit and reviewed.
 */
import type {ProfessionId} from "./profession-system";
import type {CreatureStage} from "./creature-visual-bible";

export type CareerCreatureArt={
  src:string;
  alt:string;
  stage:CreatureStage;
  width:768;
  height:768;
  rendition:"generated-2d-concept";
};
const art=(src:string,alt:string,stage:CreatureStage):CareerCreatureArt=>({
  src,alt,stage,width:768,height:768,rendition:"generated-2d-concept",
});

export const FIRST_THREE_CAREER_RENDERS={
  software:{
    base:art("/storybook-premium/summons/circuitling-base.webp",
      "Circuitling, a small blue otter-like Software familiar with glass fins and polygon tail", "base"),
    evolved:art("/storybook-premium/summons/circuitling-evolved.webp",
      "Logicwhirl, an evolved blue otter-like Software familiar with more floating logic tiles", "evolved"),
    ascended:art("/storybook-premium/summons/circuitling-ascended.webp",
      "Neuralcrest, ascended otter-like Software familiar with luminous glass fin crest", "ascended"),
  },
  athletics:{
    base:art("/storybook-premium/summons/stridekin-base.webp",
      "Stridekin, a cream athletic hare familiar with long ears and a coral ribbon tail", "base"),
    evolved:art("/storybook-premium/summons/stridekin-evolved.webp",
      "Dashstride, evolved athletic hare with luminous speed ribbons and springing legs", "evolved"),
    ascended:art("/storybook-premium/summons/stridekin-ascended.webp",
      "Cometstride, ascended athletic hare with three bright speed ribbons", "ascended"),
  },
  nature:{
    base:art("/storybook-premium/summons/mossprite-base.webp",
      "Mossprite, a tiny mint forest deer familiar with living leaf antlers", "base"),
    evolved:art("/storybook-premium/summons/mossprite-evolved.webp",
      "Branchtide, an evolved forest deer with fuller leafy antlers and dew droplets", "evolved"),
    ascended:art("/storybook-premium/summons/mossprite-ascended.webp",
      "Grovewarden, an ascended woodland deer with blossoming antlers and moss mantle", "ascended"),
  },
} as const satisfies Partial<Record<ProfessionId,Record<CreatureStage,CareerCreatureArt>>>;

export function creatureRenderFor(id:ProfessionId,stage:CreatureStage){
  const family:FIRST_THREE_ILLUSTRATION|undefined=
    FIRST_THREE_CAREER_RENDERS[id as keyof typeof FIRST_THREE_CAREER_RENDERS];
  return family?.[stage]??null;
}
type FIRST_THREE_ILLUSTRATION=Record<CreatureStage,CareerCreatureArt>;
export const CREATURE_RENDER_COVERAGE={
  fullyIllustratedFamilies:3,
  totalStages:9,
  production3dMeshes:false,
  ownership:"concept-not-owned" as const,
  version:"first-three-family-illustrations-v1",
};
