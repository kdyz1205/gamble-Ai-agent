import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import sharp from "sharp";
import {PROFESSIONS} from "../src/lib/summons/profession-system";
import {CREATURE_VISUALS,type CreatureStage}
  from "../src/lib/summons/creature-visual-bible";
import {FIRST_THREE_CAREER_RENDERS,CREATURE_RENDER_COVERAGE,
  creatureRenderFor} from "../src/lib/summons/creature-render-manifest";

async function main(){
  const stageNames:readonly CreatureStage[]=["base","evolved","ascended"];
  const families=["software","athletics","nature"] as const;
  const seenUrls=new Set<string>(),seenContent=new Set<string>();
  let checks=0;
  const eq=(actual:unknown,expected:unknown,reason:string)=>{
    assert.deepEqual(actual,expected,reason);checks++;
  };
  const ok=(value:boolean,reason:string)=>{assert.ok(value,reason);checks++;};
  eq(CREATURE_RENDER_COVERAGE.fullyIllustratedFamilies,3,"Exactly 3 first-run families");
  eq(CREATURE_RENDER_COVERAGE.totalStages,9,"Three full stage lines");
  eq(CREATURE_RENDER_COVERAGE.production3dMeshes,false,"2D renders are not 3D mesh sources");
  eq(CREATURE_RENDER_COVERAGE.ownership,"concept-not-owned","Art grants no items");
  for(const id of families){
    const forms=CREATURE_VISUALS[id].stageNames;
    for(let i=0;i<3;i++){
      const stage=stageNames[i];
      const record=creatureRenderFor(id,stage);
      ok(!!record,"Dedicated image for "+id+" "+stage);
      eq(record?.stage,stage,"Correct stage index "+id+" "+stage);
      eq(record?.rendition,"generated-2d-concept","Not an actual rigged mesh");
      ok(!!record?.alt.includes(forms[i]),"Alt label matches named form");
      const src=record!.src;
      ok(src.startsWith("/storybook-premium/summons/")&&src.endsWith(".webp"),
        "Reviewed static asset path");
      ok(!seenUrls.has(src),"No asset file shared between species or stages");
      seenUrls.add(src);
      const file=join(process.cwd(),"public",src.slice(1));
      const stats=await stat(file);
      ok(stats.size>10_000&&stats.size<150_000,
        "Optimized but nonempty mobile image "+src+": "+stats.size);
      const img=sharp(await readFile(file));
      const meta=await img.metadata();
      eq([meta.format,meta.width,meta.height],["webp",768,768],
        "Real 768px WebP verified by decoder");
      const data=await readFile(file);
      const hash=createHash("sha256").update(data).digest("hex");
      ok(!seenContent.has(hash),"No recolor-cloned binary or duplicate stage asset");
      seenContent.add(hash);
      const statsRgb=await img.stats();
      ok(statsRgb.channels.slice(0,3).some(c=>c.stdev>18),
        "Rendered image contains actual visible visual detail");
    }
  }
  for(const family of PROFESSIONS){
    for(const stage of stageNames){
      const exists=families.some(x=>x===family.id);
      eq(!!creatureRenderFor(family.id,stage),exists,
        "Only independently illustrated families claim finished artwork "+family.id+" "+stage);
    }
  }
  ok(Object.keys(FIRST_THREE_CAREER_RENDERS).length===3,"No extra fake asset families");
  console.log("CREATURE_RENDER_ASSETS_PASS",checks,"checks for",seenUrls.size,"real WebP files");
}
main().catch(err=>{console.error(err);process.exitCode=1;});
