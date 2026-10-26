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
        // Cap Retina resolution to protect mobile memory and battery.
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,
          window.matchMedia("(pointer:coarse)").matches?1.8:2));
        renderer.outputColorSpace=THREE.SRGBColorSpace;
        renderer.toneMapping=THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure=1.08;
        const scene=new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff,0xd9ecff,1.25));
        const sun=new THREE.DirectionalLight(0xfff2e1,2.25);
        sun.position.set(-3,6,5);scene.add(sun);
        const fill=new THREE.DirectionalLight(0xb9ecff,1.1);
        fill.position.set(4,2,5);scene.add(fill);
        const rim=new THREE.DirectionalLight(0xd8b9ff,1.45);
        rim.position.set(2,4,-3);scene.add(rim);
        // A subtle energy orbit and deterministic fireflies surround the GLB.
        // Decorative meshes are not claimed as creature rigging or animation.
        const orbit=new THREE.Mesh(
          new THREE.TorusGeometry(1.39,0.012,6,96),
          new THREE.MeshBasicMaterial({color:0x8bcfff,transparent:true,
            opacity:0.58,blending:THREE.AdditiveBlending,depthWrite:false}),
        );
        orbit.rotation.x=-Math.PI/2;orbit.position.y=0.1;scene.add(orbit);
        const positions=new Float32Array(55*3);
        for(let i=0;i<55;i++){
          const angle=i*2.399963,rad=1.1+(i%9)*0.095;
          positions[i*3]=Math.cos(angle)*rad;
          positions[i*3+1]=0.23+(i%13)*0.18;
          positions[i*3+2]=Math.sin(angle)*rad;
        }
        const sparksGeometry=new THREE.BufferGeometry();
        sparksGeometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
        const sparks=new THREE.Points(sparksGeometry,new THREE.PointsMaterial({
          color:0xc4eaff,size:0.055,transparent:true,opacity:0.7,
          sizeAttenuation:true,depthWrite:false,blending:THREE.AdditiveBlending,
        }));
        scene.add(sparks);
        // One cheap, cached contact-shadow texture grounds the creature.
        const shadowCanvas=document.createElement("canvas");
        shadowCanvas.width=128;shadowCanvas.height=128;
        const shadowCtx=shadowCanvas.getContext("2d");
        if(shadowCtx){
          const gradient=shadowCtx.createRadialGradient(64,64,5,64,64,63);
          gradient.addColorStop(0,"rgba(13,28,59,.48)");
          gradient.addColorStop(.6,"rgba(22,48,86,.22)");
          gradient.addColorStop(1,"rgba(22,48,86,0)");
          shadowCtx.fillStyle=gradient;
          shadowCtx.fillRect(0,0,128,128);
        }
        const shadowTexture=new THREE.CanvasTexture(shadowCanvas);
        const shadow=new THREE.Mesh(new THREE.PlaneGeometry(3.2,3.2),
          new THREE.MeshBasicMaterial({
            map:shadowTexture,transparent:true,opacity:.75,depthWrite:false,
            side:THREE.DoubleSide,
          }));
        shadow.rotation.x=-Math.PI/2;shadow.position.y=0.025;
        scene.add(shadow);
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
        let modelBaseY=0;
        let frameId=0,lastFrame=0,inView=true,contextHealthy=true;
        const motionMedia=window.matchMedia("(prefers-reduced-motion: reduce)");
        const motionDisabled=()=>{
          try{return motionMedia.matches||
            window.localStorage.getItem("sum-ios-reduced-motion")==="true";}
          catch{return motionMedia.matches;}
        };
        const render=()=>{if(!stopped&&contextHealthy)renderer.render(scene,camera);};
        const stopAnimation=()=>{
          if(frameId){window.cancelAnimationFrame(frameId);frameId=0;}
        };
        const animate=(time:number)=>{
          frameId=0;
          if(stopped||!contextHealthy||!inView||document.hidden||motionDisabled())return;
          if(time-lastFrame>=1000/30){
            sparks.rotation.y=time*0.00007;
            orbit.rotation.z=Math.sin(time*0.0005)*0.045;
            if(model)model.position.y=modelBaseY+Math.sin(time*0.0014)*0.055;
            render();lastFrame=time;
          }
          frameId=window.requestAnimationFrame(animate);
        };
        const syncAnimation=()=>{
          stopAnimation();
          if(model)model.position.y=modelBaseY;
          render();
          if(!stopped&&contextHealthy&&inView&&!document.hidden&&!motionDisabled())
            frameId=window.requestAnimationFrame(animate);
        };
        const visibilityObserver=typeof IntersectionObserver==="function"?
          new IntersectionObserver(entries=>{
            inView=Boolean(entries[0]?.isIntersecting);syncAnimation();
          },{threshold:0.03}):null;
        visibilityObserver?.observe(container);
        document.addEventListener("visibilitychange",syncAnimation);
        window.addEventListener("sum-ios-preferences-changed",syncAnimation);
        motionMedia.addEventListener?.("change",syncAnimation);
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
          event.preventDefault();contextHealthy=false;stopAnimation();
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
          stopAnimation();visibilityObserver?.disconnect();
          document.removeEventListener("visibilitychange",syncAnimation);
          window.removeEventListener("sum-ios-preferences-changed",syncAnimation);
          motionMedia.removeEventListener?.("change",syncAnimation);
          observer?.disconnect();
          window.removeEventListener("resize",size);
          canvas.removeEventListener("webglcontextlost",contextLost);
          controls.removeEventListener("change",render);
          controls.dispose();
          actionsRef.current=null;
          if(model){scene.remove(model);discard(model);}
          scene.remove(orbit,sparks,shadow);
          orbit.geometry.dispose();(orbit.material as import("three").Material).dispose();
          sparksGeometry.dispose();(sparks.material as import("three").Material).dispose();
          shadow.geometry.dispose();(shadow.material as import("three").Material).dispose();
          shadowTexture.dispose();
          renderer.dispose();
          renderer.forceContextLoss();
        };

        const loader=new GLTFLoader();
        loader.load(src,gltf=>{
          if(stopped){discard(gltf.scene);return;}
          // The source GLBs contain vertex colors but no authored PBR
          // material. glTF's default metallic surface appears almost black
          // with no environment map; use nonmetallic matte preview material.
          gltf.scene.traverse(object=>{
            const mesh=object as import("three").Mesh;
            if(mesh.isMesh){
              const before=Array.isArray(mesh.material)?mesh.material:[mesh.material];
              for(const old of before)old?.dispose();
              mesh.material=new THREE.MeshStandardMaterial({
                vertexColors:true,metalness:0.04,roughness:0.52,
              });
            }
          });
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
          modelBaseY=axisRoot.position.y;
          model=axisRoot;
          scene.add(axisRoot);
          // Fit each species to the phone viewport, not a fixed camera distance.
          box.setFromObject(axisRoot);
          const center=new THREE.Vector3(),sphere=new THREE.Sphere();
          box.getCenter(center);box.getBoundingSphere(sphere);
          const fov=THREE.MathUtils.degToRad(camera.fov);
          const distance=Math.min(7.4,Math.max(3.8,
            sphere.radius/Math.sin(fov/2)*1.12));
          camera.position.set(distance*.62,center.y+distance*.35,distance*.81);
          controls.target.copy(center);
          controls.maxDistance=Math.max(10,distance*2.2);
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
          syncAnimation();
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
