"use client";
import { useEffect, useRef, useState } from "react";
import type { Material } from "three";

export type PortalState = "dormant" | "listening" | "working" | "clarifying" | "formed" | "error";
export type PortalRealm = "move" | "craft" | "grow";
type Props = { state?: PortalState; realm?: PortalRealm; className?: string };

export default function RealmCanvas({state="dormant",realm="move",className=""}:Props) {
  const rootRef=useRef<HTMLDivElement>(null);
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const values=useRef({state,realm});
  const redraw=useRef<(()=>void)|null>(null);
  const [mode,setMode]=useState<"fallback"|"webgl">("fallback");
  useEffect(()=>{values.current={state,realm};redraw.current?.();},[state,realm]);
  useEffect(()=>{
    const root=rootRef.current;
    const canvas=canvasRef.current;
    if(!root||!canvas||!window.WebGL2RenderingContext)return;
    const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
    // Reduced-motion users receive the equivalent static opal gate, with no GPU loop.
    // State changes still update the accessible DOM and CSS treatment.
    if(reduce.matches)return;
    let disposed=false;
    let initialized=false;
    let destroy:(()=>void)|undefined;
    const activation=new IntersectionObserver((events)=>{
      if(!events.some(event=>event.isIntersecting)||disposed||initialized)return;
      initialized=true;
      void(async()=>{
        try {
          const T=await import("three");
          if(disposed)return;
          const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:window.devicePixelRatio<2,powerPreference:"low-power"});
          renderer.outputColorSpace=T.SRGBColorSpace;
          renderer.toneMapping=T.ACESFilmicToneMapping;
          renderer.toneMappingExposure=1.22;
          renderer.setClearColor(0,0);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
          const scene=new T.Scene();
          const camera=new T.PerspectiveCamera(35,1,.1,100);
          camera.position.set(0,3.35,10.6);
          camera.lookAt(0,.3,0);
          const world=new T.Group();scene.add(world);
          scene.add(new T.HemisphereLight("#ffffff","#608f83",1.7));
          const key=new T.DirectionalLight("#fff7e0",2.3);key.position.set(-3,8,7);scene.add(key);
          const edge=new T.DirectionalLight("#b5c9ef",1.7);edge.position.set(4,3,-3);scene.add(edge);
          const standard=(color:string,metalness=.09,roughness=.4)=>new T.MeshStandardMaterial({color,metalness,roughness});
          const materials={
            porcelain:standard("#dfeee7",.08,.34),
            stone:standard("#87ad9e",.12,.46),
            earth:standard("#5c877b",.08,.54),
            forest:standard("#316c5a",.08,.40),
            mint:standard("#b9ddc9",.15,.30),
            gold:standard("#e5c381",.36,.25),
            silver:new T.MeshPhysicalMaterial({color:"#cadce5",metalness:.44,roughness:.20,clearcoat:1,clearcoatRoughness:.14}),
            opal:new T.MeshPhysicalMaterial({color:"#b3b1df",metalness:.28,roughness:.18,clearcoat:1,clearcoatRoughness:.1}),
          };
          function cylinder(top:number,bottom:number,h:number,y:number,mat:Material) {
            const mesh=new T.Mesh(new T.CylinderGeometry(top,bottom,h,92),mat);
            mesh.position.y=y;world.add(mesh);return mesh;
          }
          cylinder(3.42,3.66,.42,-1.78,materials.earth);
          cylinder(3.32,3.46,.22,-1.49,materials.stone);
          cylinder(3.16,3.28,.085,-1.33,materials.porcelain);
          const floorTrace=new T.Mesh(new T.TorusGeometry(2.74,.012,6,128),materials.mint);
          floorTrace.rotation.x=Math.PI/2;floorTrace.position.y=-1.278;world.add(floorTrace);
          const gate=new T.Group();gate.position.y=.52;gate.rotation.y=-.16;world.add(gate);
          function ring(radius:number,tube:number,mat:Material,z:number){
            const mesh=new T.Mesh(new T.TorusGeometry(radius,tube,22,128),mat);
            mesh.scale.set(.83,1.2,1);mesh.position.z=z;gate.add(mesh);return mesh;
          }
          ring(1.91,.245,materials.silver,.045);
          ring(1.86,.09,materials.opal,.16);
          ring(1.77,.019,materials.porcelain,.244);
          ring(2.04,.008,materials.mint,-.15);
          const orbit=ring(2.23,.008,materials.opal,-.26);
          const lensMaterial=new T.ShaderMaterial({
            uniforms:{uTime:{value:0},uEnergy:{value:0},uTint:{value:new T.Color("#bde9d8")}},
            vertexShader:["varying vec2 vUv;","void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}"].join("\n"),
            fragmentShader:[
              "precision mediump float;",
              "varying vec2 vUv;",
              "uniform float uTime;",
              "uniform float uEnergy;",
              "uniform vec3 uTint;",
              "void main(){",
              "vec2 p=vUv-0.5;",
              "float r=length(p*vec2(1.3,1.0));",
              "float s=1.0-smoothstep(0.0,0.57,r);",
              "float ribbon=0.5+0.5*sin(p.y*15.0+sin(p.x*8.0+uTime*0.5)+uTime*0.35);",
              "vec3 shade=mix(vec3(0.74,0.80,0.91),uTint,0.37+ribbon*0.27);",
              "gl_FragColor=vec4(shade,0.13+s*(0.40+0.15*ribbon+0.17*uEnergy));",
              "}",
            ].join("\n"),
            transparent:true,depthWrite:false,side:T.DoubleSide,
          });
          const lens=new T.Mesh(new T.CircleGeometry(1.76,96),lensMaterial);
          lens.scale.set(.85,1.19,1);lens.position.z=.06;gate.add(lens);
          // Pico is a small porcelain object inside the same spatial world.
          // The fallback uses the exact canonical SVG character for consistency.
          const pico = new T.Group();
          pico.position.set(0,-.03,.76);
          gate.add(pico);
          const picoCream=standard("#fff9ea",.03,.26);
          const picoEar=standard("#91dac0",.02,.44);
          const picoLeaf=standard("#d1e9bd",.02,.4);
          const picoInk=standard("#254a43",.06,.32);
          const picoBlush=standard("#f2b9a9",.02,.6);
          const picoWhite=standard("#ffffff",.02,.2);
          const shell=new T.Mesh(new T.SphereGeometry(.73,44,32),picoCream);
          shell.scale.set(1,.97,.44);shell.position.set(0,.10,0);
          pico.add(shell);
          const earGeometry=new T.SphereGeometry(.31,24,20);
          for(const side of [-1,1]){
            const ear=new T.Mesh(earGeometry,picoEar);
            ear.position.set(side*.57,.74,-.07);
            ear.scale.set(.77,1.32,.48);
            ear.rotation.z=side*.42;
            pico.add(ear);
            const earInterior=new T.Mesh(new T.SphereGeometry(.20,20,14),picoLeaf);
            earInterior.position.set(side*.57,.78,.105);
            earInterior.scale.set(.56,1.18,.34);
            earInterior.rotation.z=side*.42;
            pico.add(earInterior);
          }
          const bud=new T.Mesh(new T.SphereGeometry(.22,22,18),picoLeaf);
          bud.scale.set(.75,1.5,.50);bud.rotation.z=-.36;bud.position.set(.03,.88,-.04);
          pico.add(bud);
          const cheeks=new T.Group();pico.add(cheeks);
          [-1,1].forEach(side=>{
            const cheek=new T.Mesh(new T.SphereGeometry(.16,22,14),picoBlush);
            cheek.scale.set(1.15,.61,.18);
            cheek.position.set(side*.43,.045,.324);
            cheeks.add(cheek);
          });
          const closedEyes=new T.Group(),openEyes=new T.Group();
          pico.add(closedEyes,openEyes);
          const stroke=(coords:Array<[number,number,number]>,radius:number,mat:Material)=>{
            const curve=new T.CatmullRomCurve3(coords.map(([x,y,z])=>new T.Vector3(x,y,z)));
            return new T.Mesh(new T.TubeGeometry(curve,18,radius,6,false),mat);
          };
          [-1,1].forEach(side=>{
            const x=side*.254;
            closedEyes.add(stroke([[x-.095,.23,.326],[x,.27,.351],[x+.096,.23,.326]],.026,picoInk));
            const eye=new T.Mesh(new T.SphereGeometry(.057,16,12),picoInk);
            eye.scale.set(.95,1.23,.55);
            eye.position.set(x,.23,.355);
            openEyes.add(eye);
            const highlight=new T.Mesh(new T.SphereGeometry(.016,12,8),picoWhite);
            highlight.position.set(x+.016,.252,.389);
            openEyes.add(highlight);
          });
          const smile=stroke([[-.135,-.14,.358],[0,-.196,.385],[.135,-.14,.358]],.027,picoInk);
          pico.add(smile);
          const celebration=stroke([[-.19,-.14,.355],[0,-.25,.388],[.19,-.14,.355]],.029,picoInk);
          pico.add(celebration);
          const starShape=new T.Shape();
          for(let i=0;i<8;i++){
            const a=i*Math.PI/4-Math.PI/2;
            const r=i%2===0?.23:.095;
            const x=Math.cos(a)*r,y=Math.sin(a)*r;
            if(i===0)starShape.moveTo(x,y);else starShape.lineTo(x,y);
          }
          starShape.closePath();
          const star=new T.Mesh(new T.ExtrudeGeometry(starShape,{
            depth:.06,bevelEnabled:true,bevelSize:.022,bevelThickness:.026,bevelSegments:2,steps:1,
          }),materials.gold);
          star.rotation.z=.17;
          star.position.set(.73,.72,.16);
          pico.add(star);
          const runes=new T.Group();
          const runePositions=[[-2.35,1.85,-.7,.15],[2.17,2.30,.35,.2],[-1.76,-.28,.1,.1],[2.55,-.10,-.7,.11],[.35,3,-.7,.13]];
          runePositions.forEach(([x,y,z,s])=>{
            const mesh=new T.Mesh(new T.OctahedronGeometry(s,0),Math.abs(x)>2.3?materials.gold:materials.opal);
            mesh.position.set(x,y,z);mesh.rotation.z=Math.PI/8;runes.add(mesh);
          });world.add(runes);
          const towerGeo=new T.CylinderGeometry(.29,.42,.66,6);
          const crownGeo=new T.ConeGeometry(.26,.72,5);
          ([
            [-2.50,-.40,.83,materials.mint],
            [2.35,-.90,1.10,materials.porcelain],
            [-2.10,1.15,.55,materials.gold],
            [2.20,1.25,.62,materials.mint],
          ] as Array<[number,number,number,Material]>).forEach(([x,z,s,mat])=>{
            const tower=new T.Mesh(towerGeo,mat);tower.position.set(x,-.98+s*.23,z);tower.scale.setScalar(s);world.add(tower);
            const top=new T.Mesh(crownGeo,mat);top.position.set(x,-.50+s*.44,z);top.rotation.y=x*.35;top.scale.setScalar(s);world.add(top);
          });
          [[-2.85,.3,.65],[-2.15,-1.4,.75],[2.86,.6,.82],[1.9,-1.5,.6]].forEach(([x,z,s])=>{
            const branch=new T.Mesh(new T.ConeGeometry(.22,.72,6),materials.forest);
            branch.position.set(x,-.9,z);branch.scale.setScalar(s);world.add(branch);
          });
          const sparkRoot=new T.Group();
          for(let i=0;i<16;i++){
            const a=i/16*Math.PI*2;
            const spark=new T.Mesh(new T.OctahedronGeometry(i%5===0?.085:.045,0),i%4===0?materials.gold:materials.mint);
            spark.position.set(Math.cos(a)*(2.6+i%3*.16),.55+Math.sin(a)*2.68,Math.sin(i*1.65)*.46-.3);
            spark.rotation.set(i*.2,i*.4,Math.PI/4);sparkRoot.add(spark);
          }world.add(sparkRoot);
          let width=0,height=0;
          const resize=()=>{
            const rect=root.getBoundingClientRect();
            const w=Math.max(1,Math.floor(rect.width)),h=Math.max(1,Math.floor(rect.height));
            if(w===width&&h===height)return;
            width=w;height=h;camera.aspect=w/h;camera.fov=w<420?41:35;camera.updateProjectionMatrix();
            renderer.setSize(w,h,false);renderer.render(scene,camera);
          };
          const sizeObserver=new ResizeObserver(resize);
          sizeObserver.observe(root);resize();
          let mouseX=0,mouseY=0;
          const onPointer=(e:PointerEvent)=>{
            const rect=root.getBoundingClientRect();
            mouseX=((e.clientX-rect.left)/Math.max(1,rect.width)-.5)*2;
            mouseY=((e.clientY-rect.top)/Math.max(1,rect.height)-.5)*2;
          };
          root.addEventListener("pointermove",onPointer,{passive:true});
          const palette:Record<PortalRealm,string>={move:"#a4dfcb",craft:"#cfc9ef",grow:"#d6e4b5"};
          const levels:Record<PortalState,number>={dormant:.08,listening:.3,working:.88,clarifying:.52,formed:1,error:.18};
          const startedAt=performance.now();
          let visible=true,raf=0,last=0;
          const inView=new IntersectionObserver(events=>{visible=events.some(e=>e.isIntersecting);},{threshold:.01});
          inView.observe(root);
          const animate=(now:number)=>{
            if(!reduce.matches)raf=requestAnimationFrame(animate);
            if(!visible||(!reduce.matches&&now-last<33))return;last=now;
            const t=reduce.matches?0:(now-startedAt)/1000;
            const snapshot=values.current;
            lensMaterial.uniforms.uTint.value.lerp(new T.Color(palette[snapshot.realm]),reduce.matches?1:.055);
            lensMaterial.uniforms.uEnergy.value+=(levels[snapshot.state]-lensMaterial.uniforms.uEnergy.value)*(reduce.matches?1:.075);
            lensMaterial.uniforms.uTime.value=t;
            gate.rotation.y+=(-.16+(reduce.matches?0:mouseX*.075)-gate.rotation.y)*.035;
            world.rotation.y+=((reduce.matches?0:mouseX*.025)-world.rotation.y)*.03;
            camera.position.y+=((reduce.matches?3.35:3.35-mouseY*.13)-camera.position.y)*.03;
            const isAttentive=snapshot.state==='listening'||snapshot.state==='clarifying'||snapshot.state==='working';
            openEyes.visible=isAttentive;
            closedEyes.visible=!isAttentive;
            celebration.visible=snapshot.state==='formed';
            smile.visible=snapshot.state!=='formed';
            if(!reduce.matches){
              runes.rotation.y=t*.028;sparkRoot.rotation.z=Math.sin(t*.26)*.035;orbit.rotation.z=Math.sin(t*.2)*.03;
              pico.position.y=-.03+Math.sin(t*.86)*.023;
            }
            camera.lookAt(0,.28,0);renderer.render(scene,camera);
          };
          redraw.current=()=>{if(reduce.matches)animate(performance.now());};
          raf=requestAnimationFrame(animate);
          setMode("webgl");
          const onLost=(event:Event)=>{event.preventDefault();visible=false;setMode("fallback");};
          canvas.addEventListener("webglcontextlost",onLost);
          destroy=()=>{
            cancelAnimationFrame(raf);redraw.current=null;sizeObserver.disconnect();inView.disconnect();
            root.removeEventListener("pointermove",onPointer);canvas.removeEventListener("webglcontextlost",onLost);
            scene.traverse(object=>{
              if(object instanceof T.Mesh){
                object.geometry.dispose();
                const mats=Array.isArray(object.material)?object.material:[object.material];
                mats.forEach(m=>m.dispose());
              }
            });
            Object.values(materials).forEach(m=>m.dispose());
            towerGeo.dispose();crownGeo.dispose();lensMaterial.dispose();
            renderer.dispose();renderer.forceContextLoss();
          };
        }catch{if(!disposed)setMode("fallback");}
      })();
    },{rootMargin:"180px 0px",threshold:0});
    activation.observe(root);
    return ()=>{disposed=true;activation.disconnect();destroy?.();};
  },[]);
  return (
    <div ref={rootRef} className={"sum-realm-canvas "+className} data-renderer={mode} data-portal-state={state} data-realm={realm}>
      <div className="sum-realm-canvas__fallback" aria-hidden="true">
        <span className="sum-realm-canvas__fallback-ring"/>
        <span className="sum-realm-canvas__fallback-core"/>
        <span className="sum-realm-canvas__fallback-plinth"/>
      </div>
      <canvas ref={canvasRef} className="sum-realm-canvas__webgl" aria-hidden="true"/>
    </div>
  );
}
