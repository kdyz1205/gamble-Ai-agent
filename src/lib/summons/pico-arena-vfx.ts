import * as THREE from "three";

/** Visual-only choreography; authoritative Quiz scoring remains on the server. */
export type PicoArenaPhase="preview"|"open"|"live"|"completed"|"cancelled";
export type PicoArenaWinner="creator"|"opponent"|null;

export type PicoArenaVfx={
  root:THREE.Group;
  leftBeam:THREE.Mesh;
  rightBeam:THREE.Mesh;
  leftCharge:THREE.Mesh;
  rightCharge:THREE.Mesh;
  convergence:THREE.Mesh;
  victoryRings:[THREE.Mesh,THREE.Mesh];
  update:(seconds:number,phase:PicoArenaPhase,winner:PicoArenaWinner,motion:boolean)=>void;
  diagnostics:()=>{meshes:number;triangles:number};
  dispose:()=>void;
};

function emissive(color:number,opacity:number){
  return new THREE.MeshBasicMaterial({
    color,transparent:true,opacity,
    depthWrite:false,depthTest:true,
    blending:THREE.AdditiveBlending,
  });
}
function link(from:THREE.Vector3,through:THREE.Vector3,to:THREE.Vector3,color:number){
  const curve=new THREE.QuadraticBezierCurve3(from,through,to);
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,28,.017,5,false),
    emissive(color,.65));
  mesh.name=color===0x79eeff?"creator_charge_arc":"opponent_charge_arc";
  return mesh;
}

/** GPU assets are allocated once per mounted scene and disposed on unmount.
 * No per-frame geometry regeneration, texture downloads, or gameplay writes.
 */
export function createPicoArenaVfx():PicoArenaVfx{
  const root=new THREE.Group();
  root.name="Pico_non_gameplay_visual_choreography";

  const leftBeam=link(
    new THREE.Vector3(-.57,-.38,.82),
    new THREE.Vector3(-.28,.18,1.0),
    new THREE.Vector3(-.045,-.04,1.13),
    0x79eeff,
  );
  const rightBeam=link(
    new THREE.Vector3(.57,-.38,.82),
    new THREE.Vector3(.28,.18,1.0),
    new THREE.Vector3(.045,-.04,1.13),
    0xf5b3ff,
  );
  const orbGeometry=new THREE.SphereGeometry(.095,12,9);
  const leftCharge=new THREE.Mesh(orbGeometry,emissive(0x93eaff,.75));
  leftCharge.name="creator_charge_light";
  leftCharge.position.set(-.57,-.38,.82);
  const rightCharge=new THREE.Mesh(orbGeometry,emissive(0xe4b5ff,.75));
  rightCharge.name="opponent_charge_light";
  rightCharge.position.set(.57,-.38,.82);

  const convergence=new THREE.Mesh(
    new THREE.TorusGeometry(.22,.020,6,48),
    emissive(0xe8ffff,.62),
  );
  convergence.name="mutual_charge_convergence";
  convergence.position.set(0,-.035,1.15);

  // A final victory halo is visible ONLY for a server-verified winner.
  // Its position is behind the character body and remains static in reduce-motion.
  const winGeometry=new THREE.TorusGeometry(.86,.028,6,48);
  const winnerMaterial=emissive(0xffdc7c,.72);
  const leftWinner=new THREE.Mesh(winGeometry,winnerMaterial);
  leftWinner.name="creator_server_verified_victory_halo";
  leftWinner.position.set(-1.18,-.01,-.31);
  const rightWinner=new THREE.Mesh(winGeometry,winnerMaterial);
  rightWinner.name="opponent_server_verified_victory_halo";
  rightWinner.position.set(1.18,-.01,-.31);
  root.add(leftBeam,rightBeam,leftCharge,rightCharge,convergence,leftWinner,rightWinner);

  let disposed=false;
  const victoryRings:[THREE.Mesh,THREE.Mesh]=[leftWinner,rightWinner];
  const update=(seconds:number,phase:PicoArenaPhase,winner:PicoArenaWinner,motion:boolean)=>{
    if(disposed)return;
    const live=phase==="live";
    const verified=phase==="completed"&&winner!==null;
    leftBeam.visible=rightBeam.visible=leftCharge.visible=rightCharge.visible=
      convergence.visible=live;
    leftWinner.visible=verified&&winner==="creator";
    rightWinner.visible=verified&&winner==="opponent";
    if(live){
      const pulse=motion?Math.sin(seconds*4.4):0;
      leftCharge.scale.setScalar(1+.16*pulse);
      rightCharge.scale.setScalar(1-.16*pulse);
      convergence.scale.setScalar(1+(motion ? .12*Math.sin(seconds*2.2) : 0));
      convergence.rotation.z=motion?seconds*.42:0;
      (leftBeam.material as THREE.MeshBasicMaterial).opacity=.48+(motion ? .13*pulse : 0);
      (rightBeam.material as THREE.MeshBasicMaterial).opacity=.48-(motion ? .13*pulse : 0);
    }else{
      leftCharge.scale.setScalar(1);rightCharge.scale.setScalar(1);
      convergence.rotation.z=0;convergence.scale.setScalar(1);
    }
    const haloScale=verified&&motion?1+.065*Math.sin(seconds*3):1;
    leftWinner.scale.setScalar(haloScale);
    rightWinner.scale.setScalar(haloScale);
    winnerMaterial.opacity=verified?(motion ? .72+.12*Math.sin(seconds*2.3) : .72):0;
  };

  const diagnostics=()=>{
    let meshes=0,triangles=0;
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      meshes++;
      const geometry=object.geometry;
      const position=geometry.getAttribute("position");
      triangles+=geometry.index?geometry.index.count/3:position.count/3;
    });
    return {meshes,triangles};
  };
  const dispose=()=>{
    if(disposed)return;
    disposed=true;
    const geometries=new Set<THREE.BufferGeometry>();
    const materials=new Set<THREE.Material>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      geometries.add(object.geometry);
      const items=Array.isArray(object.material)?object.material:[object.material];
      for(const material of items)materials.add(material);
    });
    geometries.forEach(item=>item.dispose());
    materials.forEach(item=>item.dispose());
    root.clear();
  };
  update(0,"preview",null,false);
  return {root,leftBeam,rightBeam,leftCharge,rightCharge,convergence,
    victoryRings,update,diagnostics,dispose};
}
