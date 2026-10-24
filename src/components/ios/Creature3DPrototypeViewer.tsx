"use client";

import {useEffect,useRef,useState} from "react";

type ViewerStatus="loading"|"ready"|"unavailable";
type ViewerControls={rotate:(radians:number)=>void;reset:()=>void};

export default function Creature3DPrototypeViewer({src,label}:{
  src:string;label:string;
}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const containerRef=useRef<HTMLDivElement>(null);
  const actionsRef=useRef<ViewerControls|null>(null);
  const [status,setStatus]=useState<ViewerStatus>("loading");

  useEffect(()=>{
    let stopped=false;
    let release:(()=>void)|undefined;
    actionsRef.current=null;
    setStatus("loading");
    async function start(){
      try{
        // Keep WebGL and the model loader out of the normal iOS page bundle.
        const [THREE,{GLTFLoader},{OrbitControls}]=await Promise.all([
          import("three"),
          import("three/examples/jsm/loaders/GLTFLoader.js"),
          import("three/examples/jsm/controls/OrbitControls.js"),
        ]);
        if(stopped)return;
        const canvas=canvasRef.current,container=containerRef.current;
        if(!canvas||!container)return;
        let renderer:import("three").WebGLRenderer;
        try{
          renderer=new THREE.WebGLRenderer({
            canvas,alpha:true,antialias:true,powerPreference:"low-power",
          });
        }catch{
          if(!stopped)setStatus("unavailable");
          return;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
        renderer.outputColorSpace=THREE.SRGBColorSpace;
        const scene=new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff,0xb0b3c9,2.2));
        const sun=new THREE.DirectionalLight(0xfffaf0,2.1);
        sun.position.set(-2,5,6);
        scene.add(sun);
        const camera=new THREE.PerspectiveCamera(43,1,0.1,50);
        camera.position.set(4,3.2,5);
        const controls=new OrbitControls(camera,canvas);
        controls.enablePan=false;
        controls.enableDamping=false;
        controls.minDistance=2.5;
        controls.maxDistance=10;
        controls.minPolarAngle=0.15;
        controls.maxPolarAngle=Math.PI-0.15;
        let model:import("three").Group|null=null;
        let originalHeight=2.5;
        const render=()=>{if(!stopped)renderer.render(scene,camera);};
        const size=()=>{
          if(stopped)return;
          const width=Math.max(1,container.clientWidth);
          const height=Math.max(1,container.clientHeight);
          camera.aspect=width/height;
          camera.updateProjectionMatrix();
          renderer.setSize(width,height,false);
          render();
        };
        const contextLost=(event:Event)=>{
          event.preventDefault();
          if(!stopped)setStatus("unavailable");
        };
        canvas.addEventListener("webglcontextlost",contextLost,false);
        controls.addEventListener("change",render);
        const observer=typeof ResizeObserver==="function"?
          new ResizeObserver(size):null;
        observer?.observe(container);
        window.addEventListener("resize",size);
        size();

        const discard=(root:import("three").Object3D)=>{
          root.traverse(item=>{
            const mesh=item as import("three").Mesh;
            if(mesh.isMesh){
              mesh.geometry?.dispose();
              const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
              for(const material of materials)material?.dispose();
            }
          });
        };
        release=()=>{
          observer?.disconnect();
          window.removeEventListener("resize",size);
          canvas.removeEventListener("webglcontextlost",contextLost);
          controls.removeEventListener("change",render);
          controls.dispose();
          actionsRef.current=null;
          if(model){scene.remove(model);discard(model);}
          renderer.dispose();
          renderer.forceContextLoss();
        };

        const loader=new GLTFLoader();
        loader.load(src,gltf=>{
          if(stopped){discard(gltf.scene);return;}
          // Original editable blockouts are explicitly Z-up.
          const axisRoot=new THREE.Group();
          gltf.scene.rotation.x=-Math.PI/2;
          axisRoot.add(gltf.scene);
          const box=new THREE.Box3().setFromObject(axisRoot);
          const extent=new THREE.Vector3();
          box.getSize(extent);
          const largest=Math.max(extent.x,extent.y,extent.z);
          if(!Number.isFinite(largest)||largest<0.001){
            discard(gltf.scene);
            setStatus("unavailable");
            return;
          }
          axisRoot.scale.setScalar(3.05/largest);
          box.setFromObject(axisRoot);
          const middle=new THREE.Vector3();
          box.getCenter(middle);
          axisRoot.position.set(-middle.x,-box.min.y,-middle.z);
          model=axisRoot;
          scene.add(axisRoot);
          originalHeight=(box.max.y-box.min.y);
          camera.position.set(4,Math.max(2.8,originalHeight*1.15),5);
          controls.target.set(0,originalHeight*0.49,0);
          controls.update();
          controls.saveState();
          actionsRef.current={
            rotate:(angle)=>{if(model){model.rotation.y+=angle;render();}},
            reset:()=>{
              if(model)model.rotation.y=0;
              controls.reset();
              render();
            },
          };
          size();
          setStatus("ready");
        },undefined,()=>{
          if(!stopped)setStatus("unavailable");
        });
      }catch{
        if(!stopped)setStatus("unavailable");
      }
    }
    void start();
    return ()=>{
      stopped=true;
      release?.();
      actionsRef.current=null;
    };
  },[src]);

  return <section className="ios-3d-prototype" data-testid="creature-3d-prototype"
    aria-label={label+" interactive 3D blockout"}>
    <div className="ios-3d-prototype__stage" ref={containerRef}>
      <canvas ref={canvasRef} data-testid="creature-3d-canvas"
        aria-label={label+" three-dimensional prototype; drag to rotate and pinch to zoom"}/>
      {status!=="ready"&&<p className="ios-3d-prototype__overlay"
        role="status" data-testid="creature-3d-status">
        {status==="loading"?"Loading actual GLB model…":
          "3D is not available on this device. The illustrated character above remains available."}
      </p>}
    </div>
    <div className="ios-3d-prototype__actions" aria-label="Rotate 3D prototype">
      <button type="button" disabled={status!=="ready"}
        onClick={()=>actionsRef.current?.rotate(-Math.PI/4)}
        aria-label="Rotate creature left">↶ Left</button>
      <button type="button" disabled={status!=="ready"}
        onClick={()=>actionsRef.current?.reset()}
        aria-label="Reset 3D view">Reset</button>
      <button type="button" disabled={status!=="ready"}
        onClick={()=>actionsRef.current?.rotate(Math.PI/4)}
        aria-label="Rotate creature right">Right ↷</button>
    </div>
    <p className="ios-summon-hint">
      Procedural geometry blockout · drag to rotate, pinch or scroll to zoom.
      No skinning, animation, ownership, XP or item reward is represented.
    </p>
  </section>;
}
