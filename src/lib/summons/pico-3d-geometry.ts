import * as THREE from "three";

/**
 * Original, editable mesh-based Pico visual prototype.
 * No GLB, skeletal rig, ownership, item drop, XP, or combat mechanic is implied.
 * Geometry and PBR materials are shared by both rendered Pico instances.
 */
const shades={
  fur:"#fff2dc",furLight:"#fffaf0",furShade:"#ecdcbf",
  ear:"#efabc7",earLight:"#ffd2e1",eyeRim:"#806d75",
  iris:"#251c3c",irisGlow:"#564477",shine:"#ffffff",
  blush:"#f7a9b6",mouth:"#4c2a3d",tongue:"#f2a0a8",
  aqua:"#8ccce6",aquaLight:"#d0f5ff",charm:"#fff5b3",
} as const;
type MaterialName=keyof typeof shades;

export type PicoMeshResources={
  sphere:THREE.SphereGeometry;
  ring:THREE.TorusGeometry;
  materials:Record<MaterialName,THREE.MeshStandardMaterial|THREE.MeshPhysicalMaterial|THREE.MeshBasicMaterial>;
};

export type PicoCharacter={
  root:THREE.Group;
  head:THREE.Group;
  ears:[THREE.Group,THREE.Group];
  arms:[THREE.Group,THREE.Group];
  eyes:[THREE.Group,THREE.Group];
  /* Time in seconds. Cosmetic animation only. */
  animate:(seconds:number,active:boolean,phaseOffset?:number,
    celebrating?:boolean)=>void;
};

export function createPicoMeshResources():PicoMeshResources{
  const materials={} as PicoMeshResources["materials"];
  for(const [name,color] of Object.entries(shades) as Array<[MaterialName,string]>){
    if(name==="iris"||name==="irisGlow"){
      materials[name]=new THREE.MeshPhysicalMaterial({
        color,metalness:.08,roughness:.11,clearcoat:1,clearcoatRoughness:.06,
      });
    }else if(name==="shine"){
      materials[name]=new THREE.MeshBasicMaterial({color});
    }else{
      materials[name]=new THREE.MeshStandardMaterial({
        color,metalness:0,roughness:name==="charm"?.29:.73,
        emissive:name==="charm"?new THREE.Color("#6f5305"):new THREE.Color("#000000"),
        emissiveIntensity:name==="charm"?.14:0,
      });
    }
  }
  return {
    sphere:new THREE.SphereGeometry(1,24,18),
    ring:new THREE.TorusGeometry(1,.08,10,38),
    materials,
  };
}

export function disposePicoMeshResources(resources:PicoMeshResources){
  resources.sphere.dispose();
  resources.ring.dispose();
  for(const material of Object.values(resources.materials))material.dispose();
}

function ellipsoid(
  parent:THREE.Object3D,res:PicoMeshResources,
  name:string,material:MaterialName,
  at:[number,number,number],size:[number,number,number],
  turn:[number,number,number]=[0,0,0],
){
  const mesh=new THREE.Mesh(res.sphere,res.materials[material]);
  mesh.name=name;
  mesh.position.set(...at);
  mesh.scale.set(...size);
  mesh.rotation.set(...turn);
  mesh.castShadow=false;
  mesh.receiveShadow=false;
  parent.add(mesh);
  return mesh;
}

function ornament(
  parent:THREE.Object3D,res:PicoMeshResources,
  name:string,material:MaterialName,
  at:[number,number,number],scale:[number,number,number],
){
  const mesh=new THREE.Mesh(res.ring,res.materials[material]);
  mesh.name=name;
  mesh.position.set(...at);
  mesh.scale.set(...scale);
  parent.add(mesh);
  return mesh;
}

export function createPicoCharacter(res:PicoMeshResources):PicoCharacter{
  const root=new THREE.Group();root.name="Pico_3D_prototype";
  const head=new THREE.Group();head.name="head";
  root.add(head);

  // Chubby 3D body has a full back, not a cardboard/image billboard.
  ellipsoid(head,res,"cream_body","fur",[0,0,0],[.69,.74,.55]);
  ellipsoid(head,res,"face_fur","furLight",[0,-.10,.33],[.58,.56,.30]);
  ellipsoid(head,res,"muzzle","furLight",[0,-.28,.565],[.39,.24,.105]);
  ellipsoid(head,res,"crown_fluff","furLight",[0,.67,.20],[.23,.18,.23]);
  ellipsoid(head,res,"forehead_fluff_L","furLight",[-.21,.63,.26],[.19,.19,.17],[0,0,-.4]);
  ellipsoid(head,res,"forehead_fluff_R","furLight",[.22,.61,.26],[.16,.18,.17],[0,0,.4]);
  ellipsoid(head,res,"belly","furShade",[0,-.45,.11],[.47,.25,.40]);

  const ears: [THREE.Group,THREE.Group]=[new THREE.Group(),new THREE.Group()];
  for(let side=0;side<2;side++){
    const sign=side===0?-1:1,ear=ears[side];
    ear.name=side===0?"left_ear":"right_ear";
    ear.position.set(sign*.51,.58,-.015);
    ear.rotation.z=-sign*.30;
    ellipsoid(ear,res,"ear_outer","furLight",[0,.27,0],[.21,.39,.16]);
    ellipsoid(ear,res,"ear_inner","ear",[0,.29,.136],[.123,.29,.06]);
    ellipsoid(ear,res,"ear_inner_gloss","earLight",[-sign*.018,.38,.187],[.051,.16,.027]);
    head.add(ear);
  }

  const eyes:[THREE.Group,THREE.Group]=[new THREE.Group(),new THREE.Group()];
  for(let side=0;side<2;side++){
    const sign=side===0?-1:1;
    const eye=eyes[side];
    eye.name=side===0?"left_eye":"right_eye";
    eye.position.set(sign*.272,.13,.571);
    ellipsoid(eye,res,"eye_liner","eyeRim",[0,0,-.007],[.206,.260,.095],[0,sign*.10,0]);
    ellipsoid(eye,res,"iris","iris",[0,-.005,.055],[.173,.223,.089],[0,sign*.10,0]);
    ellipsoid(eye,res,"iris_soft","irisGlow",[-sign*.047,-.074,.135],[.081,.092,.018]);
    ellipsoid(eye,res,"upper_glint","shine",[-sign*.071,.091,.144],[.057,.074,.018]);
    ellipsoid(eye,res,"lower_glint","shine",[sign*.064,-.048,.151],[.028,.031,.012]);
    head.add(eye);
  }
  ellipsoid(head,res,"nose","furShade",[0,-.122,.678],[.048,.034,.028]);
  ellipsoid(head,res,"mouth","mouth",[0,-.287,.671],[.119,.130,.044]);
  ellipsoid(head,res,"tongue","tongue",[0,-.350,.710],[.072,.046,.015]);
  for(let side=0;side<2;side++){
    const sign=side===0?-1:1;
    ellipsoid(head,res,side===0?"left_blush":"right_blush","blush",
      [sign*.472,-.247,.456],[.165,.121,.052]);
    ellipsoid(head,res,"blush_glow","earLight",
      [sign*.487,-.199,.496],[.071,.045,.018]);
  }

  const arms:[THREE.Group,THREE.Group]=[new THREE.Group(),new THREE.Group()];
  for(let side=0;side<2;side++){
    const sign=side===0?-1:1;
    const arm=arms[side];arm.name=side===0?"left_paw":"right_paw";
    arm.position.set(sign*.55,-.44,.14);
    arm.rotation.z=sign*.16;
    ellipsoid(arm,res,"front_paw","fur",[sign*.092,-.02,.21],[.195,.203,.204]);
    ellipsoid(arm,res,"toe_center","furLight",[sign*.076,-.145,.359],[.067,.067,.030]);
    ellipsoid(arm,res,"toe_outside","furLight",[sign*.178,-.124,.336],[.054,.058,.025]);
    root.add(arm);
    ellipsoid(root,res,side===0?"left_foot":"right_foot","furShade",
      [sign*.32,-.69,.23],[.22,.145,.26]);
  }

  // The necklace creates a complete front-and-side silhouette.
  ornament(root,res,"aqua_collar","aqua",[0,-.45,.02],[.44,.44,.32]);
  ellipsoid(root,res,"scarf_knot","aquaLight",[0,-.55,.52],[.115,.10,.085]);
  ellipsoid(root,res,"scarf_drop","aqua",[0,-.655,.538],[.076,.155,.05],[0,0,.19]);
  ellipsoid(root,res,"pendant","charm",[.035,-.593,.62],[.068,.066,.032]);

  const tail=new THREE.Group();tail.name="tail";
  tail.position.set(.45,-.30,-.40);
  ellipsoid(tail,res,"tail_base","furShade",[.17,.04,-.12],[.21,.22,.26],[0,0,.32]);
  ellipsoid(tail,res,"tail_tip","furLight",[.37,.19,-.18],[.24,.24,.24]);
  root.add(tail);
  root.userData.artState="original-procedural-3d-prototype";
  root.userData.isRigged=false;

  const animate=(seconds:number,active:boolean,phaseOffset=0,
    celebrating=false)=>{
    const t=seconds+phaseOffset;
    const pace=active?1.7:1;
    root.position.y=Math.sin(t*1.8*pace)*.055+
      (celebrating?Math.max(0,Math.sin(t*3.6))*.075:0);
    head.rotation.z=Math.sin(t*.94*pace)*.026+(celebrating ? .055 : 0);
    ears[0].rotation.z=.30+Math.sin(t*2.1)*.06;
    ears[1].rotation.z=-.30-Math.sin(t*2.1+1.2)*.06;
    arms[0].rotation.z=-.16+Math.sin(t*2.5*pace)*.16+
      (celebrating?-.24-.11*Math.sin(t*5.1):0);
    arms[1].rotation.z=.16-Math.sin(t*2.5*pace+1)*.16+
      (celebrating ? .24+.11*Math.sin(t*5.1+1.2) : 0);
    tail.rotation.y=Math.sin(t*2)*.12;
    const blink=(t%5.7+5.7)%5.7;
    const lid=(blink>5.30&&blink<5.49)?Math.max(.1,Math.abs(blink-5.395)/.095):1;
    eyes[0].scale.y=lid;eyes[1].scale.y=lid;
  };
  return {root,head,ears,arms,eyes,animate};
}

export function picoMeshDiagnostics(character:PicoCharacter){
  let meshCount=0,triangles=0;
  const names:string[]=[];
  character.root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    meshCount++;
    names.push(object.name);
    const geometry=object.geometry;
    if(!(geometry instanceof THREE.BufferGeometry))return;
    triangles+=geometry.index?geometry.index.count/3:
      geometry.getAttribute("position").count/3;
  });
  return {meshCount,triangles,parts:names};
}
