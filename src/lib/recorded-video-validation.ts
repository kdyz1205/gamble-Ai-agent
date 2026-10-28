/** A nonempty MediaRecorder Blob can contain only a container header. Validate
 * a decoded frame locally before offering it as uploadable proof. */
export function recordedVideoIsDecodable(blob:Blob,signal?:AbortSignal):Promise<boolean> {
  if(!blob.size||signal?.aborted)return Promise.resolve(false);
  return new Promise(resolve=>{
    const video=document.createElement('video');
    const url=URL.createObjectURL(blob);
    let finished=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const finish=(ok:boolean)=>{
      if(finished)return;finished=true;
      if(timer)clearTimeout(timer);
      signal?.removeEventListener('abort',cancel);
      video.onloadeddata=null;video.onerror=null;
      video.pause();video.removeAttribute('src');video.load();
      URL.revokeObjectURL(url);resolve(ok);
    };
    const cancel=()=>finish(false);
    video.preload='auto';video.muted=true;video.playsInline=true;
    video.onloadeddata=()=>finish(video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0);
    video.onerror=()=>finish(false);
    signal?.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>finish(false),12000);
    if(signal?.aborted){cancel();return;}
    video.src=url;video.load();
  });
}
