"use client";

import {useEffect,useRef,useState} from "react";
import {transcribeAudio} from "@/lib/api-client";

type Language="auto"|"en"|"zh";
type Result={text:string;usedFallback:boolean};
export function QuizVoiceInput({value,onChange,onResult,disabled=false}:{
  value:string;onChange:(text:string)=>void;
  onResult:(result:Result)=>void;disabled?:boolean;
}){
  const [language,setLanguage]=useState<Language>("auto");
  const [recording,setRecording]=useState(false);
  const [busy,setBusy]=useState(false);
  const [preview,setPreview]=useState("");
  const [error,setError]=useState("");
  const recorder=useRef<MediaRecorder|null>(null);
  const stream=useRef<MediaStream|null>(null);
  const recognition=useRef<{stop:()=>void}|null>(null);
  const chunks=useRef<Blob[]>([]);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const livePreview=useRef("");
  const active=useRef(true);

  const stopTracks=()=>{
    if(timer.current){clearTimeout(timer.current);timer.current=null;}
    try{recognition.current?.stop();}catch{}
    recognition.current=null;
    stream.current?.getTracks().forEach(t=>t.stop());
    stream.current=null;
  };
  useEffect(()=>{
    active.current=true;
    return ()=>{
      active.current=false;
      if(recorder.current?.state==="recording"){
        recorder.current.onstop=null;
        recorder.current.stop();
      }
      if(timer.current)clearTimeout(timer.current);
      try{recognition.current?.stop();}catch{}
      stream.current?.getTracks().forEach(t=>t.stop());
    };
  },[]);

  const stop=()=>{
    if(recorder.current?.state==="recording")recorder.current.stop();
  };
  const start=async()=>{
    setError("");
    if(disabled||busy||recording)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){
      setError("This device cannot record audio. Type your Quiz request instead.");
      return;
    }
    try{
      const media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!active.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;
      const types=[
        "audio/mp4;codecs=mp4a.40.2","audio/mp4",
        "audio/webm;codecs=opus","audio/webm","audio/ogg",
      ];
      const chosen=types.find(type=>MediaRecorder.isTypeSupported(type));
      let r:MediaRecorder;
      try{r=chosen?new MediaRecorder(media,{mimeType:chosen}):new MediaRecorder(media);}
      catch{r=new MediaRecorder(media);}
      recorder.current=r;
      chunks.current=[];
      livePreview.current="";
      setPreview("");
      r.ondataavailable=e=>{if(e.data.size>0)chunks.current.push(e.data);};
      r.onerror=()=>{
        stopTracks();
        if(active.current){setRecording(false);setError("Recording failed. Try again or type your request.");}
      };
      r.onstop=()=>{
        const blob=new Blob(chunks.current,{type:r.mimeType||"audio/webm"});
        chunks.current=[];
        stopTracks();
        setRecording(false);
        if(!active.current)return;
        const textHint=livePreview.current.trim();
        if(blob.size>8*1024*1024){
          setError("Recording exceeds 8 MB. Use a shorter voice message.");
          return;
        }
        setBusy(true);
        void transcribeAudio(blob,{
          languageHint:language==="auto"?undefined:language,
          previewText:textHint,
        }).then(result=>{
          if(!active.current)return;
          const text=result.transcript?.trim()||textHint;
          if(!text){setError("No verified transcript returned. Please type the Quiz request.");return;}
          const merged=[value.trim(),text].filter(Boolean).join(" ").slice(0,300);
          onChange(merged);
          onResult({text:merged,usedFallback:result.usedFallback});
          setPreview("");
        }).catch(err=>{
          if(active.current){
            if(textHint){
              const merged=[value.trim(),textHint].filter(Boolean).join(" ").slice(0,300);
              onChange(merged);
              onResult({text:merged,usedFallback:true});
              setError("Server transcription was unavailable. Please review the browser transcript.");
            }else setError(err instanceof Error?err.message:"Transcription unavailable; type instead.");
          }
        }).finally(()=>{if(active.current)setBusy(false);});
      };
      const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(Speech){
        try{
          const speech=new Speech();
          speech.continuous=true;
          speech.interimResults=true;
          speech.lang=language==="zh"?"zh-CN":language==="en"?"en-US":navigator.language||"en-US";
          speech.onresult=(e:SpeechRecognitionEvent)=>{
            const words:string[]=[];
            for(let i=0;i<e.results.length;i++){
              words.push(e.results[i][0]?.transcript||"");
            }
            livePreview.current=words.join(" ").trim();
            if(active.current)setPreview(livePreview.current);
          };
          speech.onerror=()=>{};
          recognition.current=speech;
          speech.start();
        }catch{recognition.current=null;}
      }
      r.start(250);
      setRecording(true);
      timer.current=setTimeout(()=>stop(),60_000);
    }catch(err){
      stopTracks();
      if(active.current)setError(err instanceof Error?err.message:"Microphone permission denied.");
    }
  };
  return <section className="ios-quiz-voice" aria-label="Voice Quiz request">
    <div className="ios-quiz-languages" role="group" aria-label="Voice language">
      {(["auto","en","zh"] as const).map(l=><button key={l} type="button"
        aria-pressed={language===l} disabled={busy||recording||disabled}
        onClick={()=>setLanguage(l)}>
        {l==="auto"?"Auto":l==="en"?"EN":"中文"}
      </button>)}
    </div>
    <button className="ios-secondary-button" type="button"
      data-testid="quiz-microphone"
      disabled={busy||disabled}
      onClick={()=>void (recording?stop():start())}>
      {busy?"Transcribing…":recording?"Stop recording":"Speak your Quiz"}
    </button>
    <p className="ios-summon-hint">
      Your microphone is used only after pressing Record. Text is editable and
      creating the Quiz requires a separate confirmation.
    </p>
    {preview&&recording&&<p role="status" className="ios-quiz-transcript">
      Hearing: {preview}
    </p>}
    {error&&<p role="alert" className="ios-message ios-message--error">{error}</p>}
  </section>;
}
