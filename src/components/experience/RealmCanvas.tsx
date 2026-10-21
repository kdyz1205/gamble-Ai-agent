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
          renderer.toneMappingExposure=1.65;
          renderer.setClearColor(0,0);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
          const scene=new T.Scene();
          const camera=new T.PerspectiveCamera(35,1,.1,100);
          camera.position.set(0,2.25,11.7);
          camera.lookAt(0,.3,0);
          const world=new T.Group();scene.add(world);
          scene.add(new T.HemisphereLight("#ffffff","#7eaaa0",3.1));
          const key=new T.DirectionalLight("#fff7dc",3.0);key.position.set(-3,8,7);scene.add(key);
          const edge=new T.DirectionalLight("#c0d0fa",2.5);edge.position.set(4,3,-3);scene.add(edge);
          const standard=(color:string,metalness=.09,roughness=.4)=>new T.MeshStandardMaterial({color,metalness,roughness});
          const materials={
            porcelain:standard("#eff6ef",.16,.3),
            stone:standard("#a9c6b7",.18,.52),
            earth:standard("#769a8c",.05,.72),
            forest:standard("#487d6b",.08,.44),
            mint:standard("#d4efe4",.15,.34),
            gold:standard("#dcc994",.43,.24),
            silver:new T.MeshPhysicalMaterial({color:"#e1eaf2",metalness:.64,roughness:.18,clearcoat:1,clearcoatRoughness:.14}),
            opal:new T.MeshPhysicalMaterial({color:"#c9d0ee",metalness:.25,roughness:.16,clearcoat:1,clearcoatRoughness:.1}),
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
          ring(1.91,.205,materials.silver,.045);
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
              "vec3 shade=mix(vec3(0.98,0.99,0.95),uTint,0.36+ribbon*0.25);",
              "gl_FragColor=vec4(shade,0.07+s*(0.26+0.15*ribbon+0.2*uEnergy));",
              "}",
            ].join("\n"),
            transparent:true,depthWrite:false,side:T.DoubleSide,
          });
          const lens=new T.Mesh(new T.CircleGeometry(1.76,96),lensMaterial);
          lens.scale.set(.85,1.19,1);lens.position.z=.06;gate.add(lens);
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
            camera.position.y+=((reduce.matches?2.25:2.25-mouseY*.13)-camera.position.y)*.03;
            if(!reduce.matches){runes.rotation.y=t*.028;sparkRoot.rotation.z=Math.sin(t*.26)*.035;orbit.rotation.z=Math.sin(t*.2)*.03;}
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
