"use client";

import {useEffect,useRef} from "react";

type Phase="preview"|"open"|"live"|"completed"|"cancelled";

type Spark={x:number;y:number;depth:number;drift:number;speed:number;offset:number};

/**
 * Fixed positions keep the first paint deterministic and prevent server/client
 * layout drift. The effect is visual-only and never determines a Quiz outcome.
 */
const SPARKS:Spark[]=Array.from({length:58},(_,index)=>({
  x:((index*37+11)%97)/100,
  y:((index*47+17)%89)/100,
  depth:0.35+(index%7)*0.11,
  drift:4+(index%6)*3,
  speed:0.35+(index%9)*0.095,
  offset:index*2.399963229728653,
}));

function createSprite(color:string){
  const sprite=document.createElement("canvas");
  sprite.width=64;sprite.height=64;
  const g=sprite.getContext("2d");
  if(!g)return sprite;
  const gradient=g.createRadialGradient(32,32,0,32,32,31);
  gradient.addColorStop(0,"#ffffff");
  gradient.addColorStop(.12,color);
  gradient.addColorStop(.4,color+"70");
  gradient.addColorStop(1,color+"00");
  g.fillStyle=gradient;
  g.fillRect(0,0,64,64);
  return sprite;
}

/**
 * Render budget: one cached particle texture, 58 fixed sprites at most,
 * capped DPR / pixel count, 30 FPS on touch screens and adaptive throttling.
 * The canvas pauses when offscreen, hidden, motion-reduced or data-saving.
 * A static CSS-star fallback remains visible whenever animation is paused.
 */
export default function QuizArenaParticles({phase}:{phase:Phase}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const arena=canvas.closest<HTMLElement>(".ios-quiz-arena");
    const ctx=canvas.getContext("2d",{alpha:true,desynchronized:true});
    if(!ctx||!arena)return;

    const blue=createSprite("#9bdeff");
    const gold=createSprite("#ffe5a0");
    const reducedMedia=window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarse=window.matchMedia("(pointer: coarse)").matches;
    const connection=navigator as Navigator&{connection?:{saveData?:boolean}};
    const saveData=connection.connection?.saveData===true;
    let visible=true,disposed=false;
    let width=0,height=0,scale=1;
    let frameId=0,timerId=0;
    let rate=coarse?30:45;
    let activeSprites=coarse?36:58;
    let slowFrames=0,frameSamples=0;

    const reduced=()=>{
      try{
        return reducedMedia.matches||
          localStorage.getItem("sum-ios-reduced-motion")==="true";
      }catch{return reducedMedia.matches;}
    };

    function stop(){
      if(frameId){cancelAnimationFrame(frameId);frameId=0;}
      if(timerId){window.clearTimeout(timerId);timerId=0;}
    }
    function allowed(){
      return !disposed&&visible&&!document.hidden&&!reduced()&&!saveData&&
        width>=30&&height>=30;
    }
    function measure(){
      const bounds=canvas!.getBoundingClientRect();
      const w=Math.round(bounds.width),h=Math.round(bounds.height);
      if(w<1||h<1)return;
      // 750k maximum backing pixels even on high-DPI tablets.
      const dpr=Math.min(window.devicePixelRatio||1,coarse?1.6:2,
        Math.sqrt(750000/(w*h)));
      if(w===width&&h===height&&Math.abs(dpr-scale)<0.01)return;
      width=w;height=h;scale=dpr;
      canvas!.width=Math.max(1,Math.round(width*scale));
      canvas!.height=Math.max(1,Math.round(height*scale));
      ctx!.setTransform(scale,0,0,scale,0,0);
    }
    function draw(time:number){
      frameId=0;
      if(!allowed()){sync();return;}
      const start=performance.now();
      const speed=phase==="live"?1.3:phase==="completed"?0.7:0.45;
      const t=time*.001;
      ctx!.clearRect(0,0,width,height);
      ctx!.globalCompositeOperation="lighter";
      const count=phase==="cancelled"?Math.ceil(activeSprites/3):activeSprites;
      for(let i=0;i<count;i++){
        const item=SPARKS[i];
        const span=height+44;
        const x=item.x*width+Math.sin(t*item.speed+item.offset)*item.drift;
        const y=((item.y*height-t*item.speed*speed*11)%span+span)%span-20;
        const size=(item.depth*12+4)*(phase==="completed"?1.25:1);
        const pulse=0.65+Math.sin(t*(0.8+item.speed)+item.offset)*0.25;
        ctx!.globalAlpha=pulse*item.depth;
        ctx!.drawImage(phase==="completed"&&i%3===0?gold:blue,
          x-size/2,y-size/2,size,size);
      }
      if(phase==="live"){
        const sweep=(Math.sin(t*1.25)+1)/2;
        const middleY=height*.5;
        ctx!.globalAlpha=.18+0.16*sweep;
        ctx!.strokeStyle="#90dfff";
        ctx!.lineWidth=1.3;
        ctx!.beginPath();
        ctx!.moveTo(width*.21,middleY-18);
        ctx!.quadraticCurveTo(width*.50,middleY-41-12*sweep,
          width*.79,middleY-18);
        ctx!.stroke();
      }
      ctx!.globalAlpha=1;
      ctx!.globalCompositeOperation="source-over";

      // Back off on slow devices rather than increasing phone temperature.
      if(performance.now()-start>8)slowFrames++;
      frameSamples++;
      if(frameSamples>=30){
        if(slowFrames>=8){
          rate=Math.max(20,rate-10);
          activeSprites=Math.max(20,Math.floor(activeSprites*.75));
          arena!.dataset.vfxQuality="adaptive";
        }
        frameSamples=0;slowFrames=0;
      }
      timerId=window.setTimeout(()=>{
        timerId=0;
        if(allowed())frameId=requestAnimationFrame(draw);
      },Math.max(0,1000/rate-8));
    }
    function sync(){
      stop();
      measure();
      if(allowed()){
        arena!.dataset.vfx="canvas";
        arena!.dataset.vfxQuality=rate===20?"adaptive":"balanced";
        frameId=requestAnimationFrame(draw);
      }else{
        arena!.dataset.vfx="static";
        ctx!.clearRect(0,0,width,height);
      }
    }
    const observer=typeof IntersectionObserver==="function"?
      new IntersectionObserver(entries=>{
        visible=Boolean(entries[0]?.isIntersecting);
        sync();
      },{threshold:.03}):null;
    observer?.observe(canvas);
    const resize=typeof ResizeObserver==="function"?
      new ResizeObserver(sync):null;
    resize?.observe(canvas);
    document.addEventListener("visibilitychange",sync);
    window.addEventListener("sum-ios-preferences-changed",sync);
    window.addEventListener("resize",sync);
    reducedMedia.addEventListener?.("change",sync);
    sync();
    return ()=>{
      disposed=true;stop();
      observer?.disconnect();resize?.disconnect();
      document.removeEventListener("visibilitychange",sync);
      window.removeEventListener("sum-ios-preferences-changed",sync);
      window.removeEventListener("resize",sync);
      reducedMedia.removeEventListener?.("change",sync);
      ctx.clearRect(0,0,width,height);
      if(arena.dataset.vfx)delete arena.dataset.vfx;
      if(arena.dataset.vfxQuality)delete arena.dataset.vfxQuality;
    };
  },[phase]);
  return <canvas ref={canvasRef} className="ios-quiz-arena__vfx"
    aria-hidden="true" data-testid="ios-quiz-arena-vfx"/>;
}
