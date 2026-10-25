import assert from "node:assert/strict";
import * as THREE from "three";
import {
  createPicoMeshResources,createPicoCharacter,
  disposePicoMeshResources,picoMeshDiagnostics,
} from "../src/lib/summons/pico-3d-geometry";

const resources=createPicoMeshResources();
const actor=createPicoCharacter(resources);
const other=createPicoCharacter(resources);
let checks=0;
function pass(condition:boolean,reason:string){
  assert.ok(condition,reason);checks++;
}

const diagnostic=picoMeshDiagnostics(actor);
const otherDiagnostic=picoMeshDiagnostics(other);
pass(actor.root instanceof THREE.Group,"Pico has a 3D group");
pass(diagnostic.meshCount>=35&&diagnostic.meshCount<=85,
  "Substantial 3D sculpt, bounded mobile draw calls");
pass(diagnostic.triangles>25000&&diagnostic.triangles<120000,
  "Actual indexed triangles, within a mobile mesh budget");
pass(diagnostic.meshCount===otherDiagnostic.meshCount,
  "Both players are actual 3D models");
pass(resources.sphere instanceof THREE.SphereGeometry,
  "Shared physical sphere geometry");
pass(resources.materials.iris instanceof THREE.MeshPhysicalMaterial,
  "Physically-based glass eyes");
pass(actor.root.userData.artState==="original-procedural-3d-prototype",
  "Explicit prototype identity");
pass(actor.root.userData.isRigged===false,
  "Do not misrepresent procedural animation as skeletal rigging");

for(const name of [
  "head","left_ear","right_ear","left_eye","right_eye",
  "left_paw","right_paw","left_foot","right_foot",
  "mouth","tongue","pendant","tail","cream_body","eye_liner",
]){
  pass(!!actor.root.getObjectByName(name),"Anatomy mesh/node "+name);
}
const bbox=new THREE.Box3().setFromObject(actor.root);
const extent=new THREE.Vector3();
bbox.getSize(extent);
pass(extent.x>1.1&&extent.x<3.5,"Real three-dimensional body width");
pass(extent.y>1.2&&extent.y<4.0,"Real three-dimensional body height");
pass(extent.z>.7&&extent.z<2.5,"Nonzero 3D depth, not a billboard");
pass(actor.root.getObjectByName("left_eye")!==actor.root.getObjectByName("right_eye"),
  "Independent eyes can blink");
actor.animate(2.4,true,.4);
pass(Number.isFinite(actor.root.position.y),"Idle hover movement is finite");
pass(actor.head.rotation.z!==0,"Actual 3D head articulation");
pass(actor.ears[0].rotation.z!==0&&actor.ears[1].rotation.z!==0,
  "Actual articulated ears");
actor.animate(5.395,false);
pass(actor.eyes[0].scale.y<.3&&actor.eyes[1].scale.y<.3,
  "Actual 3D blink rather than CSS image scaling");
actor.animate(0,false);
pass(actor.eyes[0].scale.y===1&&actor.eyes[1].scale.y===1,
  "Eye shapes reset outside blink");
for(const entry of actor.root.children){
  pass(!entry.userData.ownedCreature,"Preview does not imply ownership");
}
const mesh=actor.root.getObjectByName("cream_body") as THREE.Mesh;
pass(mesh.geometry===resources.sphere,"Meshes reuse the same sphere geometry");
pass((other.root.getObjectByName("cream_body") as THREE.Mesh).geometry===mesh.geometry,
  "Both character instances share GPU resources");
disposePicoMeshResources(resources);
console.log("PICO_3D_REAL_MESH_PASS",checks,"checks",diagnostic.meshCount,
  "meshes",diagnostic.triangles,"indexed triangles per character");
