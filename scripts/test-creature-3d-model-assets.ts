import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {PROFESSIONS} from "../src/lib/summons/profession-system";
import {getCreatureBlockout,BLOCKOUT_COVERAGE,THREE_D_BLOCKOUTS}
  from "../src/lib/summons/creature-model-manifest";
import type {CreatureStage} from "../src/lib/summons/creature-visual-bible";

type GLTF={
  asset:{version:string};
  nodes:Array<{name?:string;mesh?:number}>;
  meshes:Array<{primitives:Array<{indices?:number;attributes:Record<string,number>}>}>;
  accessors:Array<{count:number}>;
  buffers:Array<{byteLength:number}>;
};
let checks=0;
function eq(actual:unknown,expected:unknown,msg:string){
  assert.deepEqual(actual,expected,msg);checks++;
}
function truth(value:boolean,msg:string){assert.ok(value,msg);checks++;}

/** Verify actual binary GLB, not a textual filename or mock mesh. */
function decodeGlb(file:Buffer):GLTF{
  if(file.length<32||file.toString("ascii",0,4)!=="glTF"||
     file.readUInt32LE(4)!==2||file.readUInt32LE(8)!==file.length)
    throw new Error("Invalid GLB header");
  const jsonBytes=file.readUInt32LE(12);
  if(jsonBytes<2||20+jsonBytes+8>file.length||file.readUInt32LE(16)!==0x4e4f534a)
    throw new Error("Invalid GLB JSON chunk");
  const root=JSON.parse(file.toString("utf8",20,20+jsonBytes)) as GLTF;
  if(root.asset.version!=="2.0"||!Array.isArray(root.meshes))
    throw new Error("Invalid GLTF mesh metadata");
  return root;
}
const families=["athletics","software","nature"] as const;
const stages=["base","evolved","ascended"] as const satisfies readonly CreatureStage[];
const shaSet=new Set<string>();
eq(BLOCKOUT_COVERAGE.stages,9,"Nine prototype meshes");
eq(BLOCKOUT_COVERAGE.families,3,"Only three geometry families");
eq(BLOCKOUT_COVERAGE.animated,false,"No false animation");
eq(BLOCKOUT_COVERAGE.rigged,false,"No false skeletal rig");
eq(BLOCKOUT_COVERAGE.productionReady,false,"Never claim production mesh");
eq(Object.keys(THREE_D_BLOCKOUTS).length,3,"Explicit reviewed manifest");
for(const id of families){
  for(const stage of stages){
    const item=getCreatureBlockout(id,stage);
    truth(!!item,id+" "+stage+" must have model");
    const src=item!.src;
    truth(/^\/storybook-premium\/summons\/models\/[a-z]+-(base|evolved|ascended)\.glb$/.test(src),
      "Model source must be a reviewed same-origin static path");
    const bytes=readFileSync(join(process.cwd(),"public",src.slice(1)));
    truth(bytes.length>50_000&&bytes.length<250_000,"Actual optimized GLB bytes");
    const hash=createHash("sha256").update(bytes).digest("hex");
    truth(!shaSet.has(hash),"Every form requires a distinct binary");
    shaSet.add(hash);
    const model=decodeGlb(bytes);
    const meshCount=model.meshes.length;
    eq(meshCount,item!.meshNodes,"Mesh count matches inventory "+id+" "+stage);
    truth(model.nodes.length>=meshCount,"Actual GLTF scene nodes exist");
    const names=new Set(model.nodes.map(n=>n.name));
    const expectedLimbs=id==="software"?
      ["front_left_paw","front_right_paw","rear_left_paw","rear_right_paw"]:
      id==="nature"?
        ["front_left_hoof","front_right_hoof","hind_left_hoof","hind_right_hoof"]:
        ["front_left_paw","front_right_paw","hind_left_paw","hind_right_paw"];
    for(const limb of expectedLimbs)truth(names.has(limb),"Named anatomical limb "+limb);
    const triangles=model.meshes.reduce((total,m)=>total+m.primitives.reduce((sum,p)=>{
      if(p.indices===undefined)throw new Error("GLB has no indexed triangles");
      return sum+model.accessors[p.indices].count/3;
    },0),0);
    eq(triangles,item!.triangles,"Actual triangle geometry "+id+" "+stage);
    truth(model.meshes.every(m=>m.primitives.every(p=>p.attributes.COLOR_0!==undefined)),
      "Prototype geometry must include vertex colors");
    eq(item!.status,"procedural-3d-blockout","Model remains a declared draft");
  }
}
for(const p of PROFESSIONS){
  for(const stage of stages){
    eq(getCreatureBlockout(p.id,stage)!==null,families.some(x=>x===p.id),
      "Only three explicitly modeled professions can enable the viewer");
  }
}
assert.throws(()=>decodeGlb(Buffer.alloc(48)),"Random bytes must not pass GLB validation");checks++;
const invalid=Buffer.from(readFileSync(join(process.cwd(),"public",getCreatureBlockout("software","base")!.src.slice(1))));
invalid.writeUInt32LE(123,8);
assert.throws(()=>decodeGlb(invalid),"Forged total byte count must reject");checks++;
console.log("SUMMON_3D_MODEL_ASSETS_PASS",checks,"checks",shaSet.size,"real GLB scenes");
