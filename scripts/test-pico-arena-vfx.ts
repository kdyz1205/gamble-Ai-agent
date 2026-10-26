import assert from "node:assert/strict";
import * as THREE from "three";
import {createPicoArenaVfx} from "../src/lib/summons/pico-arena-vfx";
import {createPicoCharacter,createPicoMeshResources,
  disposePicoMeshResources} from "../src/lib/summons/pico-3d-geometry";

let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const fx=createPicoArenaVfx();
const budget=fx.diagnostics();
check(fx.root instanceof THREE.Group,"Real Three.js group, not a CSS overlay");
check(budget.meshes>=7&&budget.meshes<=12,"Bounded decorative mesh count");
check(budget.triangles>200&&budget.triangles<3000,"Mobile effects polygon budget");
check(fx.leftCharge.geometry===fx.rightCharge.geometry,"Reuses orb geometry");
check(fx.victoryRings[0].geometry===fx.victoryRings[1].geometry,
  "Both winner halos share GPU geometry");

function noWinner(label:string){
  check(!fx.victoryRings[0].visible&&!fx.victoryRings[1].visible,label);
}
fx.update(1,"preview",null,true);
check(!fx.leftBeam.visible&&!fx.rightBeam.visible,"Preview cannot imply attack");
noWinner("Preview has no fabricated winner");
fx.update(2,"open",null,true);
check(!fx.convergence.visible,"Invitation pending has no clash");
noWinner("Open invitation has no reward");
fx.update(2.5,"live",null,true);
check(fx.leftBeam.visible&&fx.rightBeam.visible,"Live has mutual charge arcs");
check(fx.leftCharge.visible&&fx.rightCharge.visible,
  "Both live players have equal visual energy");
noWinner("Quiz live has no premature win announcement");
check(fx.convergence.visible,"Mutual charge converges");
fx.update(3,"live",null,false);
const staticRotation=fx.convergence.rotation.z;
const staticScale=fx.leftCharge.scale.x;
fx.update(100,"live",null,false);
check(fx.convergence.rotation.z===staticRotation&&
  fx.leftCharge.scale.x===staticScale,
"Reduced-motion charge is actually frozen");
fx.update(3,"completed",null,true);
noWinner("Completed with missing result cannot fabricate winner");
check(!fx.leftBeam.visible,"No replayed attack on a finalized game");
fx.update(3,"completed","creator",true);
check(fx.victoryRings[0].visible&&!fx.victoryRings[1].visible,
  "Only server-selected creator receives winner halo");
check(!fx.convergence.visible,"No more live charge on completed match");
fx.update(3,"completed","opponent",true);
check(!fx.victoryRings[0].visible&&fx.victoryRings[1].visible,
  "Only server-selected opponent receives winner halo");
fx.update(3,"cancelled","creator",true);
noWinner("Cancellation cannot produce a victory even if winner is supplied");
fx.update(3,"completed","creator",false);
const frozenHalo=fx.victoryRings[0].scale.x;
fx.update(19,"completed","creator",false);
check(frozenHalo===fx.victoryRings[0].scale.x,
  "Victory animation also obeys reduced motion");

const resources=createPicoMeshResources();
const actor=createPicoCharacter(resources);
actor.animate(1.4,false,0,false);
const idleHead=actor.head.rotation.z;
const idleArm=actor.arms[0].rotation.z;
actor.animate(1.4,false,0,true);
check(actor.head.rotation.z!==idleHead&&actor.arms[0].rotation.z!==idleArm,
  "Verified winner has articulated celebration pose");
actor.animate(1.4,false,0,false);
check(actor.head.rotation.z===idleHead,
  "Celebration returns to neutral for other matches");
disposePicoMeshResources(resources);
fx.dispose();
check(fx.root.children.length===0,"VFX release clears scene meshes");
fx.dispose();
check(fx.root.children.length===0,"VFX release is idempotent");
console.log("PICO_ARENA_VFX_PASS",checks,"checks",budget.meshes,
  "VFX meshes",budget.triangles,"indexed triangles");
