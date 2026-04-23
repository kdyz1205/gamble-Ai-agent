"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { upload as blobUpload } from "@vercel/blob/client";
import * as api from "@/lib/api-client";

// LuckyPlay palette — only the tokens this component actually uses.
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
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

export default function EvidenceUploader({ challengeId, evidenceType, onSubmitted }: Props) {
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);

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

  const pickFile = (kind: "video" | "photo") => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "video" ? "video/*" : "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setError("");
    };
    input.click();
  };

  const startCamera = async (withAudio: boolean) => {
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: withAudio });
      setStream(s);
      setMode("record");
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not access camera/mic. Grant permission and try again.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  };

  const startRecording = () => {
    if (!stream) return;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8") ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setRecordedBlob(blob);
      setRecordedDuration((Date.now() - recordStartRef.current) / 1000);
      chunksRef.current = [];
    };
    mediaRecorderRef.current = recorder;
    recordStartRef.current = Date.now();
    recorder.start();
    setRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    stopCamera();
  };

  const takePhoto = async () => {
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      // Wait a moment for focus, then snap
      const video = document.createElement("video");
      video.srcObject = s;
      await video.play();
      await new Promise(r => setTimeout(r, 400));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      s.getTracks().forEach(t => t.stop());
      canvas.toBlob((b) => {
        if (!b) return;
        const f = new File([b], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(f);
        setPreviewUrl(URL.createObjectURL(f));
        setMode("photo");
      }, "image/jpeg", 0.92);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not take photo.");
    }
  };

  const getFileToUpload = (): File | null => {
    if (file) return file;
    if (recordedBlob) {
      return new File([recordedBlob], `recording-${Date.now()}.webm`, { type: recordedBlob.type || "video/webm" });
    }
    return null;
  };

  const submit = async () => {
    const f = getFileToUpload();
    const trimmedDescription = description.trim();
    const trimmedUrl = urlInput.trim();

    if (!f && !trimmedUrl && !trimmedDescription) {
      setError("Add a file, URL, or description — AI needs something to judge.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      let finalUrl: string | undefined = trimmedUrl || undefined;
      let finalType = f?.type.startsWith("video") ? "video" : f?.type.startsWith("image") ? "photo" : evidenceType || "text";

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
          finalUrl = uploaded.url;
          if (f.type.startsWith("video")) finalType = "video";
          else if (f.type.startsWith("image")) finalType = "photo";
        } catch (e) {
          // Fallback: try S3 presign if Blob isn't configured
          try {
            const pres = await fetch(`/api/uploads/evidence-presign`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ challengeId, contentType: f.type || "application/octet-stream", filename: f.name }),
            });
            const presJson = await pres.json();
            if (pres.ok && presJson?.uploadUrl && presJson?.publicUrl) {
              await fetch(presJson.uploadUrl, { method: "PUT", body: f, headers: { "Content-Type": f.type } });
              finalUrl = presJson.publicUrl;
            } else {
              throw new Error(presJson.error || "Upload failed — configure Vercel Blob or S3.");
            }
          } catch {
            throw new Error(
              e instanceof Error
                ? `Upload failed: ${e.message}. Tip: paste a public HTTPS URL instead.`
                : "Upload failed. Paste a public HTTPS URL instead.",
            );
          }
        } finally {
          setUploading(false);
        }
      }

      await api.submitEvidence(challengeId, {
        type: finalType,
        url: finalUrl,
        description: trimmedDescription || (f ? `Uploaded: ${f.name}` : "Evidence submitted"),
      });
      resetAll();
      setMode(null);
      setDescription("");
      await onSubmitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit evidence");
    } finally {
      setSubmitting(false);
    }
  };

  const hasContent = Boolean(file || recordedBlob || urlInput.trim() || description.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="lp-glass"
      style={{ borderRadius: "24px", padding: "20px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
          style={{ background: `linear-gradient(135deg, ${PEACH}, ${PINK})`, boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
          📸
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: PEACH_DARK }}>Your evidence</p>
          <p className="text-xs font-medium" style={{ color: NAVY_DIM }}>Record live, upload, or paste — AI will judge.</p>
        </div>
      </div>

      {/* Mode chooser — only when no content chosen yet */}
      {!mode && !hasContent && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <ActionTile emoji="📹" label="Record video" hint="Webcam + mic" tint={PEACH} onClick={() => startCamera(true)} />
          <ActionTile emoji="📸" label="Take photo" hint="Snap from camera" tint={MINT} onClick={takePhoto} />
          <ActionTile emoji="🎥" label="Upload video" hint="MP4 / WebM from device" tint={LAVENDER} onClick={() => pickFile("video")} />
          <ActionTile emoji="🖼️" label="Upload photo" hint="JPG / PNG from device" tint={PINK} onClick={() => pickFile("photo")} />
          <div className="col-span-2">
            <button onClick={() => setMode("url")}
              className="w-full px-3 py-2 text-xs font-bold active:scale-95 transition-transform"
              style={{ color: NAVY_DIM, background: "#FFFFFF", border: `1px dashed ${NAVY_FAINT}`, borderRadius: "16px" }}>
              🔗 …or paste an HTTPS URL instead
            </button>
          </div>
        </div>
      )}

      {/* Live camera preview while recording */}
      {mode === "record" && stream && !recordedBlob && (
        <div className="mb-3">
          <video ref={videoRef} autoPlay muted playsInline
            className="w-full rounded-2xl"
            style={{ background: "#000", maxHeight: 300, objectFit: "cover" }} />
          <div className="flex gap-2 mt-3">
            {!recording ? (
              <motion.button onClick={startRecording} whileTap={{ scale: 0.95 }}
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
            <button onClick={() => { stopCamera(); setMode(null); }}
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
          <video controls src={URL.createObjectURL(recordedBlob)}
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
            <img src={previewUrl} alt="evidence preview" className="w-full rounded-2xl" style={{ maxHeight: 300, objectFit: "cover" }} />
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
        placeholder="Describe what you did — the AI uses this + any media to judge. Be specific: reps, times, exact actions."
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
            className="mt-3 px-3 py-2 text-xs font-bold"
            style={{ background: ROSE_BG, color: ROSE_TEXT, borderRadius: "12px" }}
          >
            ⚠️ {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <motion.button
        onClick={submit}
        disabled={submitting || !hasContent}
        whileTap={{ scale: 0.96 }}
        whileHover={!submitting && hasContent ? { scale: 1.02, y: -1 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="w-full mt-4 py-3.5 text-base font-extrabold disabled:opacity-40"
        style={{
          color: PEACH_TEXT,
          background: PEACH,
          borderRadius: "9999px",
          boxShadow: submitting || !hasContent ? "none" : `0 4px 14px 0 ${ORANGE_GLOW}`,
        }}
      >
        {submitting ? (uploading ? "Uploading…" : "Submitting…") : "Submit evidence 🚀"}
      </motion.button>
    </motion.div>
  );
}

function ActionTile({ emoji, label, hint, tint, onClick }: {
  emoji: string; label: string; hint: string; tint: string; onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -2 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="p-3 text-left"
      style={{
        background: `${tint}22`,
        border: `1px solid ${tint}66`,
        borderRadius: "18px",
      }}
    >
      <div className="text-2xl mb-1">{emoji}</div>
      <p className="text-sm font-bold" style={{ color: NAVY }}>{label}</p>
      <p className="text-[11px] font-medium" style={{ color: NAVY_DIM }}>{hint}</p>
    </motion.button>
  );
}
