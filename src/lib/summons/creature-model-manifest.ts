/**
 * Real, editable GLB meshes generated from documented geometry source.
 * Stage is preview-only and is NOT earned by an account, rigged, skinned or
 * production-quality. These assets never imply ownership or settlement.
 */
import type {ProfessionId} from "./profession-system";
import type {CreatureStage} from "./creature-visual-bible";

type PrototypeAsset={
  src:string;
  stage:CreatureStage;
  meshNodes:number;
  triangles:number;
  coordinateSystem:"z-up";
  status:"procedural-3d-blockout";
};
const asset=(src:string,stage:CreatureStage,meshNodes:number,triangles:number):
PrototypeAsset=>({
  src,stage,meshNodes,triangles,coordinateSystem:"z-up",
  status:"procedural-3d-blockout",
});
const ROOT="/storybook-premium/summons/models/";

export const THREE_D_BLOCKOUTS={
  software:{
    base:asset(ROOT+"circuitling-base.glb","base",45,10708),
    evolved:asset(ROOT+"circuitling-evolved.glb","evolved",53,11444),
    ascended:asset(ROOT+"circuitling-ascended.glb","ascended",59,12164),
  },
  athletics:{
    base:asset(ROOT+"stridekin-base.glb","base",47,10680),
    evolved:asset(ROOT+"stridekin-evolved.glb","evolved",55,11032),
    ascended:asset(ROOT+"stridekin-ascended.glb","ascended",63,11960),
  },
  nature:{
    base:asset(ROOT+"mossprite-base.glb","base",44,10848),
    evolved:asset(ROOT+"mossprite-evolved.glb","evolved",50,11712),
    ascended:asset(ROOT+"mossprite-ascended.glb","ascended",57,12176),
  },
} as const satisfies Partial<Record<ProfessionId,Record<CreatureStage,PrototypeAsset>>>;

export function getCreatureBlockout(id:ProfessionId,stage:CreatureStage):
PrototypeAsset|null{
  const family:Record<CreatureStage,PrototypeAsset>|undefined=
    THREE_D_BLOCKOUTS[id as keyof typeof THREE_D_BLOCKOUTS];
  return family?.[stage]??null;
}

export const BLOCKOUT_COVERAGE={
  stages:9,
  families:3,
  animated:false,
  textured:false,
  rigged:false,
  productionReady:false,
  enabledAsPreviewOnly:true,
  version:"career-blockout-geometry-v1",
} as const;
