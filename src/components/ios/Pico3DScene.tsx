"use client";

import {useEffect,useRef} from "react";
import * as THREE from "three";
import {
  createPicoMeshResources,createPicoCharacter,disposePicoMeshResources,
  picoMeshDiagnostics,
} from "@/lib/summons/pico-3d-geometry";

type Phase="preview"|"open"|"live"|"completed"|"cancelled";

type Props={
  phase:Phase;winnerSide:"creator"|"opponent"|null;
  onReady:()=>void;
  onUnavailable:()=>void;
};

/** Actual two-character Three.js mesh scene (not billboard artwork).
 * Optional only: 2D illustration remains the stable/fallback default.
 * The scene has no access to Quiz, XP, inventory or settlement APIs.
 */
export default function Pico3DScene({phase,winnerSide,onReady,onUnavailable}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const callbacksRef=useRef({onReady,onUnavailable});
  callbacksRef.current={onReady,onUnavailable};

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    let renderer:THREE.WebGLRenderer|undefined;
    let disposed=false,contextHealthy=true,visible=true;
    let raf=0,width=0,height=0,lastDraw=0;
    let cleanup:(()=>void)|undefined;
    try{
      renderer=new THREE.WebGLRenderer({
        canvas,alpha:true,antialias:true,powerPreference:"low-power",
        preserveDrawingBuffer:false,
      });
      renderer.setClearColor(0x000000,0);
      renderer.outputColorSpace=THREE.SRGBColorSpace;
      renderer.toneMapping=THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure=1.25;
    }catch{
      callbacksRef.current.onUnavailable();
      return;
    }
    const engine=renderer;
    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(35,1,.1,50);
    camera.position.set(0,.75,5.55);
    camera.lookAt(0,-.08,0);
    const light=new THREE.HemisphereLight(0xffffff,0x8174b3,1.45);
    const key=new THREE.DirectionalLight(0xffefd8,2.65);
    key.position.set(-3.5,5,5);
    const fill=new THREE.DirectionalLight(0x9cc9ff,1.55);
    fill.position.set(3.2,2.5,4.5);
    const rim=new THREE.DirectionalLight(0xd8a9ff,2.0);
    rim.position.set(2.3,3,-4);
    scene.add(light,key,fill,rim);

    const resources=createPicoMeshResources();
    const left=createPicoCharacter(resources);
    const right=createPicoCharacter(resources);
    left.root.position.x=-1.34;right.root.position.x=1.34;
    left.root.rotation.y=.24;right.root.rotation.y=-.24;
    left.root.scale.setScalar(1.04);right.root.scale.setScalar(1.04);
    scene.add(left.root,right.root);
    left.animate(0,false);right.animate(0,false,.8);
    const leftDiagnostic=picoMeshDiagnostics(left);
    const rightDiagnostic=picoMeshDiagnostics(right);
    canvas.dataset.meshes=String(leftDiagnostic.meshCount+rightDiagnostic.meshCount);
    canvas.dataset.triangles=String(leftDiagnostic.triangles+rightDiagnostic.triangles);

    // Stable static sprite-free 3D starfield; movement is a cheap single-group rotation.
    const starPosition=new Float32Array(80*3);
    for(let i=0;i<80;i++){
      const angle=i*2.39996323;
      const distance=.75+(i%17)*.105;
      starPosition[i*3]=Math.cos(angle)*distance;
      starPosition[i*3+1]=((i*23)%67)/30-1.05;
      starPosition[i*3+2]=-1.2+((i*19)%11)*.045;
    }
    const starGeometry=new THREE.BufferGeometry();
    starGeometry.setAttribute("position",new THREE.BufferAttribute(starPosition,3));
    const starMaterial=new THREE.PointsMaterial({
      color:0xc9eaff,size:.035,transparent:true,opacity:.75,
      sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending,
    });
    const stars=new THREE.Points(starGeometry,starMaterial);
    scene.add(stars);

    // Shadow sprites are real horizontal 3D meshes, not a painted PNG avatar.
    const shadowCanvas=document.createElement("canvas");
    shadowCanvas.width=96;shadowCanvas.height=96;
    const g=shadowCanvas.getContext("2d");
    if(g){
      const grad=g.createRadialGradient(48,48,5,48,48,46);
      grad.addColorStop(0,"rgba(10,17,48,.55)");
      grad.addColorStop(.48,"rgba(25,57,112,.24)");
      grad.addColorStop(1,"rgba(25,57,112,0)");
      g.fillStyle=grad;g.fillRect(0,0,96,96);
    }
    const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
    const shadowGeometry=new THREE.PlaneGeometry(1.9,1.25);
    const shadowMaterial=new THREE.MeshBasicMaterial({
      map:shadowTexture,depthWrite:false,transparent:true,opacity:.85,
      side:THREE.DoubleSide,
    });
    const shadows=[-1.34,1.34].map((x,index)=>{
      const mesh=new THREE.Mesh(shadowGeometry,shadowMaterial);
      mesh.name=index?"opponent_grounding":"creator_grounding";
      mesh.rotation.x=-Math.PI/2;
      mesh.position.set(x,-.85,-.08);
      scene.add(mesh);
      return mesh;
    });

    const reduceMedia=window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse=window.matchMedia("(pointer: coarse)").matches;
    const conn=navigator as Navigator&{connection?:{saveData?:boolean}};
    const saveData=conn.connection?.saveData===true;
    let rotationDelta=0,pointerX:number|null=null,pointerId:number|null=null;
    function motionReduced(){
      try{
        return reduceMedia.matches||localStorage.getItem("sum-ios-reduced-motion")==="true";
      }catch{return reduceMedia.matches;}
    }
    function eligible(){
      return !disposed&&contextHealthy&&visible&&!document.hidden&&!motionReduced()&&!saveData;
    }
    function render(){
      if(!disposed&&contextHealthy)engine.render(scene,camera);
    }
    function resize(){
      if(disposed||!contextHealthy)return;
      const rect=canvas!.getBoundingClientRect();
      const w=Math.floor(rect.width),h=Math.floor(rect.height);
      if(w<=0||h<=0)return;
      const maxDpr=Math.sqrt(600000/(w*h));
      const dpr=Math.max(.8,Math.min(window.devicePixelRatio||1,coarse?1.4:1.9,maxDpr));
      if(w===width&&h===height&&Math.abs(engine.getPixelRatio()-dpr)<.01)return;
      width=w;height=h;
      engine.setPixelRatio(dpr);
      engine.setSize(w,h,false);
      camera.aspect=w/h;camera.updateProjectionMatrix();
      render();
    }
    function stop(){
      if(raf){cancelAnimationFrame(raf);raf=0;}
    }
    function animate(time:number){
      raf=0;
      if(!eligible())return;
      // 30 FPS maximum on touch devices; 45 on desktop.
      if(time-lastDraw>=1000/(coarse?30:45)){
        const t=time*.001;
        left.animate(t,phase==="live");
        right.animate(t,phase==="live",1.3);
        left.root.position.x=-1.34;right.root.position.x=1.34;
        left.root.rotation.y=.24+rotationDelta;
        right.root.rotation.y=-.24+rotationDelta;
        stars.rotation.y=t*.02;
        if(phase==="completed"&&winnerSide){
          const award=winnerSide==="creator"?left:right;
          const other=winnerSide==="creator"?right:left;
          award.root.scale.setScalar(1.04+Math.sin(t*2.1)*.035);
          other.root.scale.setScalar(1);
        }else{
          left.root.scale.setScalar(1.04);right.root.scale.setScalar(1.04);
        }
        render();
        lastDraw=time;
      }
      raf=requestAnimationFrame(animate);
    }
    function sync(){
      stop();resize();
      left.animate(0,false);right.animate(0,false,.8);
      canvas!.dataset.animating=eligible()?"true":"false";
      render();
      if(eligible())raf=requestAnimationFrame(animate);
    }
    function onLost(event:Event){
      event.preventDefault();
      contextHealthy=false;stop();
      callbacksRef.current.onUnavailable();
    }
    function onPointerDown(event:PointerEvent){
      if(event.pointerType!=="mouse"&&event.pointerType!=="touch")return;
      pointerId=event.pointerId;pointerX=event.clientX;
      canvas!.setPointerCapture?.(event.pointerId);
    }
    function onPointerMove(event:PointerEvent){
      if(pointerId!==event.pointerId||pointerX===null)return;
      const change=event.clientX-pointerX;
      rotationDelta=THREE.MathUtils.clamp(rotationDelta+change*.006,-.72,.72);
      pointerX=event.clientX;
      left.root.rotation.y=.24+rotationDelta;
      right.root.rotation.y=-.24+rotationDelta;
      render();
    }
    function onPointerEnd(event:PointerEvent){
      if(pointerId!==event.pointerId)return;
      pointerX=null;pointerId=null;
    }
    canvas.addEventListener("webglcontextlost",onLost);
    canvas.addEventListener("pointerdown",onPointerDown);
    canvas.addEventListener("pointermove",onPointerMove);
    canvas.addEventListener("pointerup",onPointerEnd);
    canvas.addEventListener("pointercancel",onPointerEnd);
    const onView=typeof IntersectionObserver==="function"?
      new IntersectionObserver(entries=>{
        visible=Boolean(entries[0]?.isIntersecting);sync();
      },{threshold:.03}):null;
    onView?.observe(canvas);
    const resizeObserver=typeof ResizeObserver==="function"?
      new ResizeObserver(sync):null;
    resizeObserver?.observe(canvas);
    window.addEventListener("resize",sync);
    document.addEventListener("visibilitychange",sync);
    window.addEventListener("sum-ios-preferences-changed",sync);
    reduceMedia.addEventListener?.("change",sync);

    cleanup=()=>{
      disposed=true;stop();
      onView?.disconnect();resizeObserver?.disconnect();
      window.removeEventListener("resize",sync);
      document.removeEventListener("visibilitychange",sync);
      window.removeEventListener("sum-ios-preferences-changed",sync);
      reduceMedia.removeEventListener?.("change",sync);
      canvas.removeEventListener("webglcontextlost",onLost);
      canvas.removeEventListener("pointerdown",onPointerDown);
      canvas.removeEventListener("pointermove",onPointerMove);
      canvas.removeEventListener("pointerup",onPointerEnd);
      canvas.removeEventListener("pointercancel",onPointerEnd);
      scene.remove(left.root,right.root,stars,...shadows);
      disposePicoMeshResources(resources);
      starGeometry.dispose();starMaterial.dispose();
      shadowGeometry.dispose();shadowMaterial.dispose();shadowTexture.dispose();
      engine.dispose();
      canvas.removeAttribute("data-meshes");
      canvas.removeAttribute("data-triangles");
    };
    try{
      resize();
      sync();
      callbacksRef.current.onReady();
    }catch{
      cleanup();
      callbacksRef.current.onUnavailable();
    }
    return ()=>cleanup?.();
  },[phase,winnerSide]);

  return <canvas ref={canvasRef} className="ios-quiz-arena__3d-canvas"
    data-testid="pico-3d-canvas"
    role="img" aria-label="Original mesh-based 3D Pico prototype; drag left and right to turn"/>;
}
