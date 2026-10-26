"use client";

import {useEffect,useRef} from "react";
import * as THREE from "three";
import {createPicoCharacter,createPicoMeshResources,
  disposePicoMeshResources} from "@/lib/summons/pico-3d-geometry";
import {CAST_MS,SUMMON_MS,samplePicoStory,type StoryPhase}
  from "@/lib/summons/pico-story-timeline";

type Props={
  phase:StoryPhase;
  onReady:()=>void;
  onUnavailable:()=>void;
};

/** Original, opt-in Three.js cinematic. One reusable Pico actor, no server
 * game state, no reward accounting, no remote models or background work.
 */
export default function PicoStoryWorld({phase,onReady,onUnavailable}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const phaseRef=useRef(phase);
  const startedAt=useRef(0);

  useEffect(()=>{
    phaseRef.current=phase;
    startedAt.current=performance.now();
    canvasRef.current?.dispatchEvent(new Event("pico-story-phase-change"));
  },[phase]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    let renderer:THREE.WebGLRenderer;
    try{
      renderer=new THREE.WebGLRenderer({
        canvas,alpha:true,antialias:true,powerPreference:"low-power",
        preserveDrawingBuffer:false,
      });
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.12;
    }catch{
      onUnavailable();return;
    }

    let disposed=false,contextHealthy=true,visible=true,raf=0;
    let canvasWidth=0,canvasHeight=0,lastDraw=0;
    const coarse=matchMedia("(pointer:coarse)").matches;
    const motionMedia=matchMedia("(prefers-reduced-motion:reduce)");
    const conn=navigator as Navigator&{connection?:{saveData?:boolean}};
    const saveData=conn.connection?.saveData===true;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(35,1,.1,40);
    camera.position.set(0,.5,4.4);
    camera.lookAt(0,-.03,0);

    const skyLight=new THREE.HemisphereLight(0xfbfaff,0x40366b,1.35);
    const keyLight=new THREE.DirectionalLight(0xffecd7,2.7);
    keyLight.position.set(-2.7,4,4);
    const edgeLight=new THREE.DirectionalLight(0x89ddff,1.7);
    edgeLight.position.set(3.5,1.5,-3);
    const accent=new THREE.PointLight(0xe6b8ff,1.1,6);
    accent.position.set(1.5,2,1.3);
    scene.add(skyLight,keyLight,edgeLight,accent);

    const resources=createPicoMeshResources();
    const pico=createPicoCharacter(resources);
    scene.add(pico.root);
    pico.animate(0,false);
    canvas.dataset.actor="real-pico-mesh";

    const portalMaterial=new THREE.MeshBasicMaterial({
      color:0xbfdcff,transparent:true,opacity:.6,
      blending:THREE.AdditiveBlending,depthWrite:false,
    });
    const portal=new THREE.Group();
    portal.position.set(0,.12,-.92);
    const gateRing=new THREE.Mesh(
      new THREE.TorusGeometry(1.33,.027,6,104),portalMaterial);
    gateRing.name="original_moon_gate";
    const innerRing=new THREE.Mesh(
      new THREE.TorusGeometry(1.06,.008,4,90),portalMaterial);
    innerRing.rotation.z=.32;
    const glyphs=new THREE.Group();
    const glyphGeometry=new THREE.TetrahedronGeometry(.04,0);
    for(let i=0;i<12;i++){
      const angle=i*Math.PI/6;
      const glyph=new THREE.Mesh(glyphGeometry,portalMaterial);
      glyph.position.set(Math.cos(angle)*1.18,Math.sin(angle)*1.18,.03);
      glyph.rotation.z=angle;
      glyphs.add(glyph);
    }
    portal.add(gateRing,innerRing,glyphs);scene.add(portal);

    const targetMaterial=new THREE.MeshStandardMaterial({
      color:0xe7b9ff,roughness:.24,metalness:.14,
      emissive:0x563e8b,emissiveIntensity:.35,
    });
    const target=new THREE.Mesh(new THREE.IcosahedronGeometry(.27,1),targetMaterial);
    target.name="pico_training_resonance_seal";
    target.position.set(1.35,-.16,.08);
    const targetHalo=new THREE.Mesh(
      new THREE.TorusGeometry(.46,.015,6,54),
      new THREE.MeshBasicMaterial({
        color:0xd4a8ff,transparent:true,opacity:.58,depthWrite:false,
        blending:THREE.AdditiveBlending,
      }),
    );
    targetHalo.position.copy(target.position);
    scene.add(target,targetHalo);

    const shotMaterial=new THREE.MeshBasicMaterial({
      color:0xafefff,transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,
    });
    const shot=new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(.24,-.08,.56),
        new THREE.Vector3(.7,.48,.76),
        new THREE.Vector3(1.35,-.16,.4),
      ),32,.035,7,false),shotMaterial);
    shot.name="pico_training_spell_arc";
    scene.add(shot);

    const impactMaterial=new THREE.MeshBasicMaterial({
      color:0xffead1,transparent:true,opacity:0,depthWrite:false,
      blending:THREE.AdditiveBlending,
    });
    const impact=new THREE.Mesh(
      new THREE.TorusGeometry(.23,.028,6,54),impactMaterial);
    impact.position.set(1.35,-.16,.34);
    scene.add(impact);

    const petals=new Float32Array(40*3);
    for(let i=0;i<40;i++){
      const angle=i*2.39996,r=.6+(i%9)*.23;
      petals[i*3]=Math.cos(angle)*r;
      petals[i*3+1]=((i*17)%41)/19-1.0;
      petals[i*3+2]=-.4+((i*11)%9)*.09;
    }
    const petalGeometry=new THREE.BufferGeometry();
    petalGeometry.setAttribute("position",new THREE.BufferAttribute(petals,3));
    const petalMaterial=new THREE.PointsMaterial({
      color:0xffe4ff,size:.045,transparent:true,opacity:.68,
      depthWrite:false,sizeAttenuation:true,
    });
    const petalCloud=new THREE.Points(petalGeometry,petalMaterial);
    scene.add(petalCloud);

    // Tiny reusable contact shadow, no expensive shadow maps.
    const shadowCanvas=document.createElement("canvas");
    shadowCanvas.width=64;shadowCanvas.height=64;
    const context=shadowCanvas.getContext("2d");
    if(context){
      const gradient=context.createRadialGradient(32,32,3,32,32,31);
      gradient.addColorStop(0,"rgba(5,9,42,.43)");
      gradient.addColorStop(1,"rgba(5,9,42,0)");
      context.fillStyle=gradient;context.fillRect(0,0,64,64);
    }
    const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
    const shadowMaterial=new THREE.MeshBasicMaterial({
      map:shadowTexture,transparent:true,opacity:.75,depthWrite:false,
      side:THREE.DoubleSide,
    });
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(2.4,1.4),shadowMaterial);
    shadow.rotation.x=-Math.PI/2;shadow.position.set(0,-.83,-.1);
    scene.add(shadow);

    function reduced(){
      try{
        return motionMedia.matches||
          localStorage.getItem("sum-ios-reduced-motion")==="true";
      }catch{return motionMedia.matches;}
    }
    function eligible(){
      return !disposed&&contextHealthy&&visible&&!document.hidden&&!saveData&&!reduced();
    }
    function render(){
      if(!disposed&&contextHealthy)renderer.render(scene,camera);
    }
    function applyFrame(time:number,animate:boolean){
      const current=phaseRef.current;
      const actual=Math.max(0,time-startedAt.current);
      const snapshot=current==="summoning"?SUMMON_MS:
        current==="casting"?CAST_MS:0;
      const sample=samplePicoStory(current,animate?actual:snapshot,!animate);
      const seconds=time/1000;
      pico.animate(animate?seconds:0,false);
      pico.root.scale.setScalar(sample.characterScale);
      pico.root.position.set(sample.characterX,sample.characterY,0);
      pico.head.rotation.z+=sample.characterRoll;
      if(current==="casting"){
        const gather=sample.cue==="gather",released=sample.cue==="release"||
          sample.cue==="impact";
        pico.arms[0].rotation.z+=(gather ? -.25 : released ? .4 : 0);
        pico.arms[1].rotation.z+=(gather ? .25 : released ? -.4 : 0);
        pico.ears[0].rotation.z+=(released ? .08 : 0);
        pico.ears[1].rotation.z+=(released ? -.08 : 0);
      }
      camera.position.z=sample.cameraZ;
      camera.position.x=animate&&sample.cue==="impact"?
        Math.sin(seconds*64)*.022:0;
      camera.lookAt(0,-.03,0);
      portalMaterial.opacity=sample.gateGlow*.74;
      portal.rotation.z=animate?sample.petalRotation*.34:0;
      petalCloud.rotation.z=sample.petalRotation*.38;
      target.rotation.y=animate?seconds*.24:.22;
      targetHalo.rotation.z=animate?seconds*.38:0;
      shot.visible=sample.cue==="release"||sample.cue==="impact";
      shotMaterial.opacity=shot.visible?sample.spellGlow*.82:0;
      impact.visible=sample.impactGlow>0;
      impactMaterial.opacity=sample.impactGlow*.95;
      impact.scale.setScalar(1+sample.impactGlow*1.9);
      accent.intensity=1.1+sample.spellGlow*1.9;
      canvas!.dataset.storyCue=sample.cue;
      canvas!.dataset.storyPhase=current;
      canvas!.dataset.animating=animate?"true":"false";
      render();
    }
    function resize(){
      const box=canvas!.getBoundingClientRect();
      const w=Math.floor(box.width),h=Math.floor(box.height);
      if(w<=0||h<=0)return;
      const limit=Math.sqrt(650000/(w*h));
      const dpr=Math.max(.7,Math.min(devicePixelRatio||1,coarse?1.5:2,limit));
      if(canvasWidth===w&&canvasHeight===h&&
         Math.abs(renderer.getPixelRatio()-dpr)<.01)return;
      canvasWidth=w;canvasHeight=h;
      renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);
      camera.aspect=w/h;camera.updateProjectionMatrix();
    }
    function stop(){
      if(raf)cancelAnimationFrame(raf);
      raf=0;
    }
    function animate(time:number){
      raf=0;
      if(!eligible()){
        applyFrame(time,false);
        return;
      }
      if(time-lastDraw>=1000/(coarse?30:45)){
        applyFrame(time,true);
        lastDraw=time;
      }
      raf=requestAnimationFrame(animate);
    }
    function sync(){
      if(disposed||!contextHealthy)return;
      stop();resize();
      applyFrame(performance.now(),false);
      if(eligible())raf=requestAnimationFrame(animate);
    }
    function lost(event:Event){
      event.preventDefault();
      contextHealthy=false;stop();onUnavailable();
    }
    canvas.addEventListener("webglcontextlost",lost);
    const viewObserver=typeof IntersectionObserver==="function"?
      new IntersectionObserver(entries=>{
        visible=Boolean(entries[0]?.isIntersecting);sync();
      },{threshold:.05}):null;
    viewObserver?.observe(canvas);
    const resizeObserver=typeof ResizeObserver==="function"?
      new ResizeObserver(sync):null;
    resizeObserver?.observe(canvas);
    window.addEventListener("resize",sync);
    canvas.addEventListener("pico-story-phase-change",sync);
    window.addEventListener("sum-ios-preferences-changed",sync);
    document.addEventListener("visibilitychange",sync);
    motionMedia.addEventListener?.("change",sync);
    const policyTimer=window.setInterval(()=>{
      if(disposed||!contextHealthy)return;
      if(eligible()!==(canvas.dataset.animating==="true"))sync();
      else if(!eligible()&&canvas.dataset.storyPhase!==phaseRef.current)sync();
    },600);
    try{
      resize();sync();onReady();
    }catch{
      stop();onUnavailable();
    }
    return ()=>{
      disposed=true;stop();
      window.clearInterval(policyTimer);
      viewObserver?.disconnect();resizeObserver?.disconnect();
      window.removeEventListener("resize",sync);
      canvas.removeEventListener("pico-story-phase-change",sync);
      window.removeEventListener("sum-ios-preferences-changed",sync);
      document.removeEventListener("visibilitychange",sync);
      motionMedia.removeEventListener?.("change",sync);
      canvas.removeEventListener("webglcontextlost",lost);
      scene.remove(pico.root,portal,target,targetHalo,shot,impact,petalCloud,shadow);
      disposePicoMeshResources(resources);
      gateRing.geometry.dispose();innerRing.geometry.dispose();
      glyphGeometry.dispose();portalMaterial.dispose();
      target.geometry.dispose();targetMaterial.dispose();
      targetHalo.geometry.dispose();(targetHalo.material as THREE.Material).dispose();
      shot.geometry.dispose();shotMaterial.dispose();
      impact.geometry.dispose();impactMaterial.dispose();
      petalGeometry.dispose();petalMaterial.dispose();
      shadow.geometry.dispose();shadowMaterial.dispose();shadowTexture.dispose();
      renderer.dispose();
    };
  },[onReady,onUnavailable]);

  return <canvas className="pico-story__canvas" data-testid="pico-story-canvas"
    ref={canvasRef} role="img"
    aria-label="Original interactive 3D Pico performing the first starlight trial"/>;
}
