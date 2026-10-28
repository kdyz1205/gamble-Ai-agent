"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { upload as blobUpload } from "@vercel/blob/client";
import * as api from "@/lib/api-client";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestGlyph from "@/components/world/QuestGlyph";
import { isConfirmedEvidenceSubmission, mediaProofKind, proofInputError, recordingExtension, recordingMimeType } from "@/lib/evidence-client";

// Summoner.world proof palette.
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const PINK = "#FFD1DC";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

type Mode = null | "upload" | "record" | "photo" | "url";

interface Props {
  challengeId: string;
  evidenceType: string; // hint from market (video/photo/self_report)
  onSubmitted: () => void | Promise<void>;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

function evidenceBlobPathname(challengeId: string, filename: string): string {
  const safe = sanitizeFilename(filename);
  return `evidence/${challengeId}/${Date.now()}-${safe}`;
}

export default function EvidenceUploader(props:Props) {
  const {data:session}=useSession();
  return <EvidenceUploaderContent key={JSON.stringify([props.challengeId,props.evidenceType,session?.user?.id??null])}
    {...props} ownerId={session?.user?.id}/>;
}

function EvidenceUploaderContent({challengeId,evidenceType,onSubmitted,ownerId}:Props&{ownerId?:string}) {
  const [mode, setMode] = useState<Mode>(null);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Webcam state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const [recordedPreviewUrl, setRecordedPreviewUrl] = useState<string | null>(null);
  const requiredMedia = mediaProofKind(evidenceType);
  const writtenProof = ["text", "self_report"].includes(evidenceType.trim().toLowerCase());
  const videoRef = useRef<HTMLVideoElement | null>(null);
  type Capture={stream:MediaStream|null;recorder:MediaRecorder|null;video:HTMLVideoElement|null;
    chunks:Blob[];startedAt:number;save:boolean};
  const captureRef=useRef<Capture|null>(null);
  const [capturePending,setCapturePending]=useState(false);
  const mounted=useRef(true);
  const saveOwner=useRef(false);
  function isCurrentCapture(capture:Capture){return mounted.current&&captureRef.current===capture;}
  function releaseCapture(capture:Capture){
    if(captureRef.current===capture)captureRef.current=null;
    const recorder=capture.recorder;
    if(recorder){
      recorder.onstop=null;recorder.ondataavailable=null;recorder.onerror=null;
      if(recorder.state!=="inactive"){try{recorder.stop();}catch{}}
    }
    capture.stream?.getTracks().forEach(track=>track.stop());
    if(capture.video){capture.video.pause();capture.video.srcObject=null;}
    capture.chunks=[];
  }
  function cancelCapture(update=true){
    const capture=captureRef.current;
    if(capture)releaseCapture(capture);
    if(update&&mounted.current){setCapturePending(false);setRecording(false);setStream(null);setMode(null);}
  }
  useEffect(()=>{
    mounted.current=true;
    const leave=()=>cancelCapture();
    window.addEventListener("pagehide",leave);
    return()=>{mounted.current=false;window.removeEventListener("pagehide",leave);cancelCapture(false);};
  },[]);

  const resetAll = useCallback(() => {
    setFile(null);
    setPreviewUrl(p => { if (p) URL.revokeObjectURL(p); return null; });
    setUrlInput("");
    setRecordedBlob(null);
    setRecordedDuration(0);
    setUploadProgress(0);
    setError("");
  }, []);

  // Stop any active webcam when component unmounts or mode changes
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, [stream]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) { video.srcObject = stream; void video.play().catch(() => {}); }
    return () => { if (video) video.srcObject = null; };
  }, [stream, mode]);

  useEffect(() => {
    if (!recordedBlob) { setRecordedPreviewUrl(null); return; }
    const url = URL.createObjectURL(recordedBlob);
    setRecordedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [recordedBlob]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const pickFile = (kind: "video" | "photo") => {
    if(captureRef.current||saveOwner.current||!mounted.current)return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "video" ? "video/*" : "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f||!mounted.current) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setError("");
    };
    input.click();
  };

  function beginCapture():Capture|null {
    if(captureRef.current||saveOwner.current||!mounted.current)return null;
    const capture:Capture={stream:null,recorder:null,video:null,chunks:[],startedAt:0,save:false};
    captureRef.current=capture;setCapturePending(true);setError("");return capture;
  }

  const startCamera=async(withAudio:boolean)=>{
    const capture=beginCapture();if(!capture)return;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera capture is unavailable. Upload a matching file instead.");
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:withAudio});
      if(!isCurrentCapture(capture)){stream.getTracks().forEach(track=>track.stop());return;}
      capture.stream=stream;setStream(stream);setMode("record");setCapturePending(false);
    }catch(error){
      if(!isCurrentCapture(capture))return;
      cancelCapture();setError(error instanceof Error?error.message:"Could not access camera/mic. Grant permission and try again.");
    }
  };

  const startRecording=()=>{
    const capture=captureRef.current;
    if(!capture||!capture.stream||capture.recorder||!isCurrentCapture(capture))return;
    try{
      if(typeof MediaRecorder==="undefined")throw new Error("Video recording is unavailable. Upload a video file instead.");
      const mimeType=recordingMimeType(type=>MediaRecorder.isTypeSupported(type));
      const recorder=new MediaRecorder(capture.stream,mimeType?{mimeType}:undefined);
      capture.recorder=recorder;capture.chunks=[];capture.startedAt=Date.now();
      recorder.ondataavailable=event=>{if(isCurrentCapture(capture)&&event.data.size>0)capture.chunks.push(event.data);};
      recorder.onstop=()=>{
        if(!isCurrentCapture(capture))return;
        const blob=new Blob(capture.chunks,{type:recorder.mimeType||capture.chunks[0]?.type||"video/webm"});
        const saved=capture.save;
        const duration=(Date.now()-capture.startedAt)/1000;
        releaseCapture(capture);setStream(null);setRecording(false);setCapturePending(false);setMode(null);
        if(!saved){setError("Recording ended before you chose Stop & save. No partial clip was kept.");return;}
        if(!blob.size){setError("The recording was empty. Please record again or upload a video file.");return;}
        setRecordedBlob(blob);setRecordedDuration(duration);
      };
      recorder.onerror=()=>{
        if(!isCurrentCapture(capture))return;
        cancelCapture();setError("Recording failed. No partial clip was kept. Try again or upload a video file.");
      };
      recorder.start();setRecording(true);
    }catch(error){
      if(!isCurrentCapture(capture))return;
      cancelCapture();setError(error instanceof Error?error.message:"Could not start recording. Upload a video file instead.");
    }
  };

  const stopRecording=()=>{
    const capture=captureRef.current;
    if(!capture||!isCurrentCapture(capture)||capture.recorder?.state!=="recording"||capture.save)return;
    capture.save=true;setCapturePending(true);setRecording(false);
    try{capture.recorder.stop();capture.stream?.getTracks().forEach(track=>track.stop());}
    catch(error){cancelCapture();setError(error instanceof Error?error.message:"Could not save the recording. Try again.");}
  };

  const takePhoto=async()=>{
    const capture=beginCapture();if(!capture)return;
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera capture is unavailable. Upload a photo instead.");
      const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if(!isCurrentCapture(capture)){stream.getTracks().forEach(track=>track.stop());return;}
      capture.stream=stream;
      const video=document.createElement("video");capture.video=video;
      video.muted=true;video.playsInline=true;video.srcObject=stream;
      await video.play();if(!isCurrentCapture(capture))return;
      await new Promise(resolve=>setTimeout(resolve,400));if(!isCurrentCapture(capture))return;
      if(!video.videoWidth||!video.videoHeight)throw new Error("The camera did not provide a photo. Try again or upload a file.");
      const canvas=document.createElement("canvas");canvas.width=video.videoWidth;canvas.height=video.videoHeight;
      const context=canvas.getContext("2d");if(!context)throw new Error("Photo capture is unavailable. Upload a file instead.");
      context.drawImage(video,0,0);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error("The photo could not be saved. Try again.")),"image/jpeg",0.92));
      if(!isCurrentCapture(capture))return;
      const file=new File([blob],`photo-${Date.now()}.jpg`,{type:"image/jpeg"});
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      setFile(file);setPreviewUrl(URL.createObjectURL(file));setMode("photo");
    }catch(error){
      if(isCurrentCapture(capture))setError(error instanceof Error?error.message:"Could not take photo.");
    }finally{
      const current=isCurrentCapture(capture);releaseCapture(capture);
      if(current)setCapturePending(false);
    }
  };

  const getFileToUpload = (): File | null => {
    if (file) return file;
    if (recordedBlob) {
      return new File([recordedBlob], `recording-${Date.now()}.${recordingExtension(recordedBlob.type)}`, { type: recordedBlob.type || "video/webm" });
    }
    return null;
  };

  const submit = async () => {
    if(saveOwner.current||captureRef.current||!mounted.current)return;
    const f = getFileToUpload();
    const trimmedDescription = description.trim();
    const trimmedUrl = urlInput.trim();

    const invalid = proofInputError(evidenceType, { fileType: f?.type, url: trimmedUrl, description: trimmedDescription });
    if (invalid) { setError(invalid); return; }
    if (f && f.size > 80 * 1024 * 1024) { setError("Proof files must be 80 MB or smaller. Trim the clip before uploading."); return; }

    saveOwner.current=true;
    setSubmitting(true);
    setError("");
    try {
      let finalUrl: string | undefined = trimmedUrl || undefined;
      let finalType = f?.type.startsWith("video") ? "video" : f?.type.startsWith("image") ? "photo" : requiredMedia || evidenceType || "text";

      // Upload file via Vercel Blob if present
      if (f) {
        setUploading(true);
        setUploadProgress(0);
        const pathname = evidenceBlobPathname(challengeId, f.name);
        const handleUploadUrl = `/api/challenges/${challengeId}/evidence/blob-handle`;
        try {
          const uploaded = await blobUpload(pathname, f, {
            access: "public",
            handleUploadUrl,
            contentType: f.type || undefined,
            multipart: f.size > 4 * 1024 * 1024,
            onUploadProgress: (p) => setUploadProgress(Math.round((p.loaded / p.total) * 100)),
          });
          if(!mounted.current)return;
          finalUrl = uploaded.url;
          if (f.type.startsWith("video")) finalType = "video";
          else if (f.type.startsWith("image")) finalType = "photo";
        } catch (e) {
          if(!mounted.current)return;
          // Fallback: try S3 presign if Blob isn't configured
          try {
            const pres = await fetch(`/api/uploads/evidence-presign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challengeId, contentType: f.type || "application/octet-stream", filename: f.name }),
            });
            const presJson = await pres.json();
            if(!mounted.current)return;
            if (pres.ok && presJson?.uploadUrl && presJson?.publicUrl) {
              const uploaded = await fetch(presJson.uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
              if(!mounted.current)return;
              if (!uploaded.ok) throw new Error(`Upload failed (${uploaded.status}). Your proof was not submitted.`);
              finalUrl = presJson.publicUrl;
            } else {
              throw new Error(presJson.error || "Upload failed — configure Vercel Blob or S3.");
            }
          } catch (fallbackError) {
            throw new Error(
              fallbackError instanceof Error
                ? fallbackError.message
                : e instanceof Error ? `Upload failed: ${e.message}. Tip: paste a public HTTPS URL instead.`
                : "Upload failed. Paste a public HTTPS URL instead.",
            );
          }
        } finally {
          if(mounted.current)setUploading(false);
        }
      }

      if(!mounted.current)return;
      const receipt=await api.submitEvidence(challengeId, {
        type: finalType,
        url: finalUrl,
        description: trimmedDescription || (f ? `Uploaded: ${f.name}` : "Proof submitted"),
      });
      if(!mounted.current)return;
      if(!isConfirmedEvidenceSubmission(receipt,challengeId,ownerId))throw new Error(
        "The server did not confirm this proof for the current account and Quest. Your input was kept.");
      resetAll();
      setMode(null);
      setDescription("");
      await onSubmitted();
    } catch (e) {
      if(mounted.current)setError(e instanceof Error ? e.message : "Could not submit proof");
    } finally {
      saveOwner.current=false;
      if(mounted.current)setSubmitting(false);
    }
  };

  const hasContent = Boolean(file || recordedBlob || urlInput.trim() || description.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="proof-camp"
    >
      <fieldset disabled={submitting} className="min-w-0 border-0 p-0 m-0">
      <div className="proof-camp__header mb-4 flex items-center gap-3">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.2rem] border-2 border-white bg-[#eafaff] shadow-[0_5px_0_rgba(23,53,75,0.08)]"><PicoFamiliar className="h-14 w-14" mood="referee" /></span>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: PEACH_DARK }}>Proof camp</p>
          <p className="mt-1 text-xs font-bold" style={{ color: NAVY_DIM }}>Each friend adds their own clear, traceable proof.</p>
        </div>
      </div>

      {/* Mode chooser — only when no content chosen yet */}
      {!mode && !file && !recordedBlob && !writtenProof && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {requiredMedia !== "photo" && <ActionTile kind="proof" label="Record video" hint="One continuous clip" tint={PEACH} disabled={capturePending} onClick={() => startCamera(true)} />}
          {requiredMedia !== "video" && <ActionTile kind="spark" label="Take photo" hint="Snap from camera" tint={MINT} disabled={capturePending} onClick={takePhoto} />}
          {requiredMedia !== "photo" && <ActionTile kind="proof" label="Upload video" hint="MP4 / WebM" tint={LAVENDER} disabled={capturePending} onClick={() => pickFile("video")} />}
          {requiredMedia !== "video" && <ActionTile kind="receipt" label="Upload photo" hint="JPG / PNG" tint={PINK} disabled={capturePending} onClick={() => pickFile("photo")} />}
          <div className="col-span-2">
            <button disabled={capturePending} onClick={() => setMode("url")}
              className="w-full px-3 py-2 text-xs font-bold active:scale-95 transition-transform"
              style={{ color: NAVY_DIM, background: "#FFFFFF", border: `1px dashed ${NAVY_FAINT}`, borderRadius: "16px" }}>
              Or paste a public HTTPS link
            </button>
          </div>
        </div>
      )}

      {capturePending&&<div role="status" className="my-3 text-sm" data-testid="proof-media-pending">
        <p>Preparing media capture. You can cancel without saving.</p>
        <button type="button" aria-label="Cancel media capture" className="mt-2 min-h-11 px-4 font-bold underline" onClick={()=>cancelCapture()}>Cancel capture</button>
      </div>}

      {/* Live camera preview while recording */}
      {mode === "record" && stream && !recordedBlob && (
        <div className="mb-3">
          <video ref={videoRef} autoPlay muted playsInline
            className="w-full rounded-2xl"
            style={{ background: "#000", maxHeight: 300, objectFit: "cover" }} />
          <div className="flex gap-2 mt-3">
            {!recording ? (
              <motion.button disabled={capturePending} onClick={startRecording} whileTap={{ scale: 0.95 }}
                className="flex-1 py-3 text-sm font-extrabold"
                style={{ color: "#FFFFFF", background: "#EF4444", borderRadius: "9999px", boxShadow: "0 4px 14px 0 rgba(239,68,68,0.40)" }}>
                🔴 Start recording
              </motion.button>
            ) : (
              <motion.button onClick={stopRecording} whileTap={{ scale: 0.95 }}
                className="flex-1 py-3 text-sm font-extrabold"
                style={{ color: NAVY, background: "#FFFFFF", border: `2px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
                ⏹ Stop &amp; save
              </motion.button>
            )}
            <button onClick={()=>cancelCapture()}
              className="px-4 py-2 text-xs font-bold"
              style={{ color: NAVY_DIM, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Recorded video preview */}
      {recordedBlob && (
        <div className="mb-3">
          <video controls src={recordedPreviewUrl ?? undefined}
            className="w-full rounded-2xl" style={{ background: "#000", maxHeight: 300 }} />
          <p className="text-xs font-semibold mt-2 px-3 py-1.5 inline-block"
            style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}>
            ✅ Recorded {recordedDuration.toFixed(1)}s ({Math.round(recordedBlob.size / 1024)} KB)
          </p>
          <button onClick={() => { setRecordedBlob(null); setRecordedDuration(0); setMode(null); }}
            className="ml-2 text-xs font-bold underline" style={{ color: NAVY_DIM }}>
            Re-record
          </button>
        </div>
      )}

      {/* File preview (uploaded or photo snapped) */}
      {file && previewUrl && (
        <div className="mb-3">
          {file.type.startsWith("video") ? (
            <video controls src={previewUrl} className="w-full rounded-2xl" style={{ background: "#000", maxHeight: 300 }} />
          ) : (
            <img src={previewUrl} alt="proof preview" className="w-full rounded-2xl" style={{ maxHeight: 300, objectFit: "cover" }} />
          )}
          <p className="text-xs font-semibold mt-2 px-3 py-1.5 inline-block"
            style={{ color: MINT_TEXT, background: MINT, borderRadius: "9999px" }}>
            ✅ {file.name} ({Math.round(file.size / 1024)} KB)
          </p>
          <button onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(null); setMode(null); }}
            className="ml-2 text-xs font-bold underline" style={{ color: NAVY_DIM }}>
            Remove
          </button>
        </div>
      )}

      {/* URL input */}
      {mode === "url" && (
        <div className="mb-3">
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/video.mp4"
            className="w-full px-4 py-3 text-sm font-medium bg-white focus:outline-none"
            style={{ color: NAVY, border: `1.5px solid ${NAVY_FAINT}`, borderRadius: "16px" }}
          />
          <button onClick={() => setMode(null)} className="mt-2 text-xs font-bold" style={{ color: NAVY_DIM }}>
            ← Back to upload options
          </button>
        </div>
      )}

      {/* Description — always visible */}
      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Describe what you did. For a friend match: identify each player by shirt color or starting court side and upload one continuous recording. No scoreboard needed; add your remembered result if you have one."
        rows={3}
        className="w-full px-4 py-3 text-sm font-medium bg-white focus:outline-none resize-y"
        style={{ color: NAVY, border: `1.5px solid ${NAVY_FAINT}`, borderRadius: "16px", minHeight: 80 }}
      />

      {/* Upload progress */}
      {uploading && (
        <div className="mt-3">
          <div className="h-2 rounded-full overflow-hidden" style={{ background: NAVY_FAINT }}>
            <motion.div
              className="h-full"
              style={{ background: PEACH }}
              initial={{ width: 0 }}
              animate={{ width: `${uploadProgress}%` }}
              transition={{ type: "tween" }}
            />
          </div>
          <p className="text-xs font-semibold mt-1" style={{ color: PEACH_DARK }}>Uploading… {uploadProgress}%</p>
        </div>
      )}

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            role="alert" className="mt-3 px-3 py-2 text-xs font-bold"
            style={{ background: ROSE_BG, color: ROSE_TEXT, borderRadius: "12px" }}
          >
            ⚠️ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <motion.button
        onClick={submit}
        disabled={submitting || capturePending || !!stream || !hasContent}
        whileTap={{ scale: 0.96 }}
        whileHover={!submitting && hasContent ? { scale: 1.02, y: -1 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="quest-primary-button mt-4 w-full py-3.5 text-base font-black disabled:opacity-40"
        style={{
          color: PEACH_TEXT,
          background: submitting || !hasContent ? PEACH : undefined,
          borderRadius: "9999px",
          boxShadow: submitting || !hasContent ? "none" : undefined,
        }}
      >
        {submitting ? (uploading ? "Uploading..." : "Submitting...") : "Submit proof"}
      </motion.button>
      </fieldset>
    </motion.div>
  );
}

function ActionTile({ kind, label, hint, tint, onClick, disabled=false }: {
  kind: "proof" | "spark" | "receipt"; label: string; hint: string; tint: string; onClick: () => void; disabled?:boolean;
}) {
  return (
    <motion.button
      onClick={onClick} disabled={disabled}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="proof-choice p-3 text-left"
      style={{
        background: `${tint}22`,
        border: `2px solid ${tint}66`,
        borderRadius: "18px",
      }}
    >
      <span className="mb-2 grid h-9 w-9 place-items-center rounded-[1rem] border-2 border-white bg-white/70 text-[color:var(--sum-ink)] shadow-[0_4px_0_rgba(23,53,75,0.08)]"><QuestGlyph className="h-4 w-4" kind={kind} /></span>
      <p className="text-sm font-bold" style={{ color: NAVY }}>{label}</p>
      <p className="text-[11px] font-medium" style={{ color: NAVY_DIM }}>{hint}</p>
    </motion.button>
  );
}
