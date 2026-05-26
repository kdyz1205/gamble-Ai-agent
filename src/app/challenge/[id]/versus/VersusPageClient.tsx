/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";
import { upload as blobUpload } from "@vercel/blob/client";
import ParticleBackground from "@/components/ParticleBackground";
import { isAiReviewStatus, isEvidenceWindowStatus, isOpenForOpponentStatus } from "@/lib/challenge-state-machine";
import { formatChallengeDeadline } from "@/lib/challenge-time";

/* ── Helpers ── */
function evidenceBlobPathname(challengeId: string, filename: string): string {
  const base = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 120) || "clip";
  return `evidence/${challengeId}/${base}`;
}

function supportedRecordingMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return undefined;
  return [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=avc1",
    "video/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

const TIER_COST: Record<1 | 2 | 3, number> = { 1: 1, 2: 5, 3: 25 };
const TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Free", 2: "Premium", 3: "Premium" };
const TIER_DESC: Record<1 | 2 | 3, string> = {
  1: "Basic AI",
  2: "Strong judge",
  3: "Deep review",
};

function statusConfig(s: string) {
  const map: Record<string, { label: string; color: string; bg: string; border: string }> = {
    open:      { label: "Awaiting Opponent",  color: "#a78bfa", bg: "rgba(124,92,252,0.1)",  border: "rgba(124,92,252,0.25)" },
    waiting_for_opponent: { label: "Awaiting Opponent", color: "#a78bfa", bg: "rgba(124,92,252,0.1)", border: "rgba(124,92,252,0.25)" },
    live:      { label: "Challenge in Progress", color: "#00e87a", bg: "rgba(0,232,122,0.1)",   border: "rgba(0,232,122,0.25)" },
    evidence_window_open: { label: "Evidence Window", color: "#00e87a", bg: "rgba(0,232,122,0.1)", border: "rgba(0,232,122,0.25)" },
    creator_submitted: { label: "Creator Submitted", color: "#00e87a", bg: "rgba(0,232,122,0.1)", border: "rgba(0,232,122,0.25)" },
    opponent_submitted: { label: "Opponent Submitted", color: "#00e87a", bg: "rgba(0,232,122,0.1)", border: "rgba(0,232,122,0.25)" },
    judging:   { label: "AI Analyzing...",    color: "#f5a623", bg: "rgba(245,166,35,0.1)",  border: "rgba(245,166,35,0.25)" },
    ai_reviewing: { label: "AI Analyzing...", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    ai_verdict_ready: { label: "Verdict Ready", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    dispute_window_open: { label: "Dispute Window", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    manual_review_required: { label: "Manual Review", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    ai_inconclusive: { label: "AI Inconclusive", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    finalized: { label: "Finalized", color: "#f5a623", bg: "rgba(245,166,35,0.1)", border: "rgba(245,166,35,0.25)" },
    settled:   { label: "Challenge Settled",     color: "#00e87a", bg: "rgba(0,232,122,0.1)",   border: "rgba(0,232,122,0.25)" },
    cancelled: { label: "Cancelled",          color: "#ff4757", bg: "rgba(255,71,87,0.1)",   border: "rgba(255,71,87,0.25)" },
    refunded: { label: "Refunded", color: "#ff4757", bg: "rgba(255,71,87,0.1)", border: "rgba(255,71,87,0.25)" },
    voided: { label: "Voided", color: "#ff4757", bg: "rgba(255,71,87,0.1)", border: "rgba(255,71,87,0.25)" },
    draft:     { label: "Draft",              color: "#a78bfa", bg: "rgba(124,92,252,0.1)",  border: "rgba(124,92,252,0.25)" },
  };
  return map[s] ?? map.draft;
}

/* ── TypewriterText ── */
function TypewriterText({ text, speed = 18 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timer);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && <span className="typewriter-cursor">&nbsp;</span>}
    </span>
  );
}

/* ── PlayerSide ── */
function PlayerSide({
  participant,
  evidence,
  isMe,
  side,
  challengeStatus,
}: {
  participant: ChallengeDetail["participants"][0] | null;
  evidence: ChallengeDetail["evidence"][0] | undefined;
  isMe: boolean;
  side: "left" | "right";
  challengeStatus: string;
}) {
  const isLeft = side === "left";
  const gradFrom = isLeft ? "#7c5cfc" : "#00d4c8";
  const gradTo = isLeft ? "#5b3fd9" : "#0d9488";
  const sideGlow = isLeft ? "rgba(124,92,252,0.06)" : "rgba(0,212,200,0.06)";

  if (!participant) {
    return (
      <motion.div
        className="flex-1 flex flex-col items-center justify-center min-h-[280px] rounded-2xl border-2 border-dashed"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
      >
        <motion.div
          className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 flex items-center justify-center mb-4"
          animate={{ borderColor: ["rgba(255,255,255,0.08)", "rgba(124,92,252,0.3)", "rgba(255,255,255,0.08)"] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          <span className="text-2xl text-text-muted">?</span>
        </motion.div>
        <p className="text-sm font-bold text-text-muted">Waiting for opponent...</p>
        <p className="text-[10px] text-text-muted/60 mt-1">Share the link to invite</p>
      </motion.div>
    );
  }

  const username = participant.user.username;
  const role = participant.role === "creator" ? "Creator" : "Opponent";
  const hasEvidence = Boolean(evidence);

  return (
    <motion.div
      className="flex-1 relative rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(${isLeft ? "135deg" : "225deg"}, ${sideGlow}, transparent 60%)`,
        border: isMe ? `1px solid ${isLeft ? "rgba(124,92,252,0.35)" : "rgba(0,212,200,0.35)"}` : "1px solid rgba(255,255,255,0.06)",
      }}
      initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: isLeft ? 0.1 : 0.2 }}
    >
      {/* Top plasma line */}
      <div className={isLeft ? "plasma-line" : "plasma-line"} style={{
        background: `linear-gradient(90deg, transparent, ${gradFrom}, ${gradTo}, ${gradFrom}, transparent)`,
        backgroundSize: "200% 100%",
        animation: "plasma-flow 3s ease infinite",
        height: "2px",
      }} />

      <div className="p-5 md:p-6">
        {/* Player info */}
        <div className="flex items-center gap-3 mb-5">
          <motion.div
            className="relative w-14 h-14 rounded-xl flex items-center justify-center text-xl font-black text-white shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})`,
              boxShadow: `0 0 24px ${isLeft ? "rgba(124,92,252,0.3)" : "rgba(0,212,200,0.3)"}`,
            }}
            animate={isMe ? {
              boxShadow: [
                `0 0 24px ${isLeft ? "rgba(124,92,252,0.3)" : "rgba(0,212,200,0.3)"}`,
                `0 0 36px ${isLeft ? "rgba(124,92,252,0.5)" : "rgba(0,212,200,0.5)"}`,
                `0 0 24px ${isLeft ? "rgba(124,92,252,0.3)" : "rgba(0,212,200,0.3)"}`,
              ]
            } : {}}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            {participant.user.image ? (
              <img src={participant.user.image} alt="" className="w-full h-full rounded-xl object-cover" />
            ) : (
              username.charAt(0).toUpperCase()
            )}
            {isMe && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-accent flex items-center justify-center">
                <span className="text-[8px] font-black text-white">ME</span>
              </div>
            )}
          </motion.div>
          <div>
            <p className="text-base font-black text-text-primary">@{username}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: isLeft ? "#a78bfa" : "#00d4c8" }}>
              {role}
            </p>
          </div>
        </div>

        {/* Evidence status */}
        <div
          className="rounded-xl p-4 evidence-card"
          style={{
            background: hasEvidence ? "rgba(0,232,122,0.06)" : "rgba(255,255,255,0.03)",
            border: hasEvidence ? "1px solid rgba(0,232,122,0.15)" : "1px solid rgba(255,255,255,0.06)",
            "--evidence-color": hasEvidence ? "#00e87a" : isLeft ? "#7c5cfc" : "#00d4c8",
          } as React.CSSProperties}
        >
          <div className="flex items-center gap-2 mb-2">
            {hasEvidence ? (
              <motion.div
                className="w-6 h-6 rounded-full bg-success flex items-center justify-center"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </motion.div>
            ) : (
              <motion.div
                className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: "rgba(255,255,255,0.15)" }}
                animate={challengeStatus !== "settled" ? { borderColor: ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.25)", "rgba(255,255,255,0.1)"] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-text-muted" />
              </motion.div>
            )}
            <span className={`text-xs font-bold ${hasEvidence ? "text-success" : "text-text-muted"}`}>
              {hasEvidence ? "Evidence submitted" : "Waiting for evidence"}
            </span>
          </div>

          {evidence && (
            <motion.div
              className="space-y-1.5"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{evidence.type}</p>
              {evidence.url && (
                <a href={evidence.url} target="_blank" rel="noreferrer"
                   className="text-xs text-accent hover:underline break-all block truncate">
                  {evidence.url}
                </a>
              )}
              {evidence.description && (
                <p className="text-xs text-text-secondary line-clamp-3">{evidence.description}</p>
              )}
            </motion.div>
          )}

          {!hasEvidence && isMe && challengeStatus !== "settled" && (
            <p className="text-[11px] text-text-muted/70 mt-1">Upload your proof below</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════ */
export default function VersusPageClient({ challengeId }: { challengeId: string }) {
  const { data: session, update: updateSession } = useSession();
  const uid = (session?.user as { id?: string; credits?: number } | undefined)?.id;
  const credits = (session?.user as { credits?: number } | undefined)?.credits ?? 0;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [noteType, setNoteType] = useState<"error" | "success" | "info">("info");
  const [pasteUrl, setPasteUrl] = useState("");
  const [sharedSameCamera, setSharedSameCamera] = useState(false);
  const [recordingSession, setRecordingSession] = useState<Awaited<ReturnType<typeof api.startRecordingSession>> | null>(null);
  const [tier, setTier] = useState<1 | 2 | 3>(1);
  const [verdictRevealed, setVerdictRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Camera recording state
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState("");
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const showNote = (msg: string, type: "error" | "success" | "info" = "info") => {
    setNote(msg);
    setNoteType(type);
    if (type !== "error") setTimeout(() => setNote(""), 4000);
  };

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const { challenge: c } = await api.getChallenge(challengeId);
      setChallenge(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [challengeId]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!challenge || challenge.status === "settled") return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [challenge, refresh]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Reveal verdict with delay for drama
  useEffect(() => {
    if (challenge?.status === "settled" && challenge.judgments[0] && !verdictRevealed) {
      const timer = setTimeout(() => setVerdictRevealed(true), 400);
      return () => clearTimeout(timer);
    }
  }, [challenge, verdictRevealed]);

  const creator = challenge?.participants.find((p) => p.role === "creator");
  const opponent = challenge?.participants.find((p) => p.role === "opponent");
  const myEvidence = challenge?.evidence.find((e) => e.userId === uid);
  const isCreator = uid && challenge?.creatorId === uid;
  const canCapture = challenge && isEvidenceWindowStatus(challenge.status) && !myEvidence && challenge.participants.some(p => p.user.id === uid);
  const canJoin = challenge && isOpenForOpponentStatus(challenge.status) && uid && challenge.creatorId !== uid && !challenge.participants.some(p => p.user.id === uid);
  const challengeTextForMode = `${challenge?.title ?? ""} ${challenge?.rules ?? ""} ${challenge?.evidenceMode ?? ""} ${challenge?.evidenceType ?? ""} ${challenge?.proofSource ?? ""}`.toLowerCase();
  const sameCameraHinted = /same[_ -]?camera|same phone|one phone|single phone|shared video|same video|together/.test(challengeTextForMode);
  const sameCameraEligible = Boolean(challenge && canCapture && creator && opponent && /video|camera|record|fitness|push|plank|squat/.test(challengeTextForMode));
  const rawEvidenceMode = String(challenge?.evidenceMode || challenge?.evidenceType || "").toLowerCase();
  const recordingSessionRequired = rawEvidenceMode === "same_camera_video" || rawEvidenceMode === "live_host_video";
  const recordingMode = rawEvidenceMode === "live_host_video" ? "live_host_video" : recordingSessionRequired ? "same_camera_video" : "separate_video";

  useEffect(() => {
    if (sameCameraEligible && sameCameraHinted) setSharedSameCamera(true);
  }, [challenge?.id, sameCameraEligible, sameCameraHinted]);

  useEffect(() => {
    setRecordingSession(null);
  }, [challenge?.id]);

  const playCameraPreview = useCallback(async () => {
    if (!cameraStream || !videoPreviewRef.current) return false;
    const video = videoPreviewRef.current;
    if (video.srcObject !== cameraStream) video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
      setCameraReady(true);
      return true;
    } catch {
      const hasLiveTrack = cameraStream.getVideoTracks().some((track) => track.readyState === "live");
      if (video.readyState >= 2 || video.videoWidth > 0 || hasLiveTrack) {
        setCameraReady(true);
        return true;
      }
      setCameraReady(false);
      setCameraError("Camera opened, but preview autoplay was blocked. Tap the preview once, then start recording.");
      return false;
    }
  }, [cameraStream]);

  useEffect(() => {
    if (!cameraStream || !videoPreviewRef.current) return;
    const video = videoPreviewRef.current;
    if (video.srcObject !== cameraStream) video.srcObject = cameraStream;
    video.muted = true;
    video.playsInline = true;
    void playCameraPreview();
    const readyFallback = window.setTimeout(() => {
      const hasLiveTrack = cameraStream.getVideoTracks().some((track) => track.readyState === "live");
      if (video.readyState >= 2 || video.videoWidth > 0 || hasLiveTrack) setCameraReady(true);
    }, 700);
    return () => {
      window.clearTimeout(readyFallback);
      if (video.srcObject === cameraStream) video.srcObject = null;
    };
  }, [cameraStream, playCameraPreview]);

  useEffect(() => {
    return () => {
      if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    };
  }, [cameraStream]);

  const sameCameraMetadata = (file?: File) => ({
    ...(file ? { fileName: file.name, fileSizeBytes: file.size, contentType: file.type || null } : {}),
    ...(sharedSameCamera
      ? {
          sharedSameCamera: true,
          captureMode: "one_phone_same_camera",
          identityGuidance: "Creator/Participant A should be on the left; opponent/Participant B should be on the right when possible.",
        }
      : {}),
  });

  const evidenceDescription = (base: string) => sharedSameCamera
    ? `Shared same-camera video for both players. Creator/Participant A should be left; opponent/Participant B should be right. ${base}`
    : base;

  const ensureRecordingSession = async () => {
    if (!challenge || !recordingSessionRequired) return null;
    if (recordingSession?.recordingSessionId) return recordingSession.recordingSessionId;
    const sessionInfo = await api.startRecordingSession(challenge.id, { mode: recordingMode });
    setRecordingSession(sessionInfo);
    return sessionInfo.recordingSessionId;
  };

  const uploadFile = async (file: File) => {
    if (!challenge || !uid) return;
    setBusy(true);
    setNote("");
    const hint = "Configure S3 or Vercel Blob, or paste a public https URL.";
    try {
      const recordingSessionId = await ensureRecordingSession();
      let presign: Awaited<ReturnType<typeof api.presignEvidenceUpload>> | null = null;
      try {
        presign = await api.presignEvidenceUpload({
          challengeId: challenge.id,
          contentType: file.type || "application/octet-stream",
          filename: file.name,
        });
      } catch { presign = null; }

      if (presign?.configured && presign.uploadUrl && presign.publicUrl) {
        const headers: Record<string, string> = { ...(presign.headers as Record<string, string> | undefined) };
        const put = await fetch(presign.uploadUrl, { method: presign.method ?? "PUT", body: file, headers });
        if (!put.ok) throw new Error(`Upload failed (${put.status})`);
        await api.submitEvidence(challenge.id, {
          type: file.type.startsWith("video") ? "video" : "photo",
          url: presign.publicUrl,
          recordingSessionId: recordingSessionId ?? undefined,
          description: evidenceDescription(`Captured: ${file.name}`),
          metadata: sameCameraMetadata(file),
        });
      } else {
        const pathname = evidenceBlobPathname(challenge.id, file.name);
        const handleUploadUrl = `/api/challenges/${challenge.id}/evidence/blob-handle`;
        const blob = await blobUpload(pathname, file, {
          access: "public",
          handleUploadUrl,
          contentType: file.type || undefined,
          multipart: file.size > 4 * 1024 * 1024,
          clientPayload: JSON.stringify({ fileName: file.name, fileSizeBytes: file.size, contentType: file.type || null }),
        });
        await api.submitEvidence(challenge.id, {
          type: file.type.startsWith("video") ? "video" : "photo",
          url: blob.url,
          recordingSessionId: recordingSessionId ?? undefined,
          description: evidenceDescription(`Captured: ${file.name}`),
          metadata: sameCameraMetadata(file),
        });
      }

      showNote("Evidence uploaded!", "success");
      await refresh();
      await updateSession?.();
    } catch (e) {
      showNote(e instanceof Error ? `${e.message} — ${hint}` : `Upload failed — ${hint}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = async () => {
    if (!challenge || !uid || !pasteUrl.trim()) return;
    setBusy(true);
    setNote("");
    try {
      const recordingSessionId = await ensureRecordingSession();
      await api.submitEvidence(challenge.id, {
        type: "video",
        url: pasteUrl.trim(),
        recordingSessionId: recordingSessionId ?? undefined,
        description: evidenceDescription("Video URL (manual)"),
        metadata: sameCameraMetadata(),
      });
      setPasteUrl("");
      showNote("Evidence submitted!", "success");
      await refresh();
      await updateSession?.();
    } catch (e) {
      showNote(e instanceof Error ? e.message : "Submit failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const runJudge = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (credits < cost) {
      showNote(`Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`, "error");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const prefs = readOracleLlmPrefs();
      await api.judgeChallenge(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      await refresh();
      await updateSession?.();
    } catch (e) {
      showNote(e instanceof Error ? e.message : "Judge failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const runJudgeAsync = async () => {
    if (!challenge) return;
    const cost = TIER_COST[tier];
    if (credits < cost) {
      showNote(`Need ${cost} credits for ${TIER_LABEL[tier]}. You have ${credits}.`, "error");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const prefs = readOracleLlmPrefs();
      const res = await api.judgeChallengeAsync(challenge.id, tier, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      showNote("AI is analyzing evidence... you can leave this page.", "info");
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const j = await api.getJudgeJob(res.jobId);
          if (j.status === "completed" || j.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setBusy(false);
            if (j.status === "failed") showNote(j.error || "Verdict failed", "error");
            await refresh();
            await updateSession?.();
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
        }
      }, 2000);
    } catch (e) {
      showNote(e instanceof Error ? e.message : "Could not start verdict", "error");
      setBusy(false);
    }
  };

  const acceptChallenge = async () => {
    if (!challenge || !uid) return;
    window.location.href = `/join/${challenge.id}`;
  };

  const copyLink = () => {
    const url = `${window.location.origin}/join/${challengeId}`;
    const markCopied = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (!navigator.clipboard?.writeText) {
      showNote(`Invite link: ${url}`, "info");
      markCopied();
      return;
    }
    navigator.clipboard.writeText(url)
      .then(() => {
        showNote("Invite link copied. Opponent must accept the rules before joining.", "success");
        markCopied();
      })
      .catch(() => {
        showNote(`Copy blocked by browser. Invite link: ${url}`, "info");
        markCopied();
      });
  };

  const startCamera = async () => {
    setCameraError("");
    setCameraReady(false);
    try {
      await ensureRecordingSession();
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: true,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        setCameraError("Microphone was blocked, so recording will continue without audio.");
      }
      setCameraStream(stream);
    } catch {
      setCameraError("Camera access required for fair play. Please allow camera access to submit evidence.");
    }
  };

  const startRecording = () => {
    if (!cameraStream) return;
    if (typeof MediaRecorder === "undefined") {
      setCameraError("This browser cannot record video directly. Upload a video file instead.");
      return;
    }
    chunksRef.current = [];
    const mimeType = supportedRecordingMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(cameraStream, { mimeType }) : new MediaRecorder(cameraStream);
    } catch {
      setCameraError("Could not start recording in this browser. Upload a video file instead.");
      return;
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || recorder.mimeType || "video/webm" });
      setRecordedBlob(blob);
      cameraStream.getTracks().forEach((t) => t.stop());
      setCameraStream(null);
      setCameraReady(false);
    };
    mediaRecorderRef.current = recorder;
    void playCameraPreview();
    recorder.start(1000);
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const submitRecordedVideo = async () => {
    if (!recordedBlob) return;
    const file = new File([recordedBlob], `evidence-${Date.now()}.webm`, { type: "video/webm" });
    setRecordedBlob(null);
    await uploadFile(file);
  };

  /* ── Auth guard ── */
  if (!uid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#06060f" }}>
        <ParticleBackground />
        <motion.div className="relative z-10 space-y-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
               style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)", boxShadow: "0 0 40px rgba(124,92,252,0.3)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h2 className="text-xl font-black text-text-primary">Sign in to enter the challenge</h2>
          <p className="text-sm text-text-secondary">You need an account to view and join challenges</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/markets" className="inline-block px-6 py-3 rounded-xl text-sm font-extrabold text-white"
                  style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)", boxShadow: "0 4px 20px rgba(124,92,252,0.3)" }}>
              My challenges
            </Link>
            <Link href="/" className="inline-block px-6 py-3 rounded-xl text-sm font-extrabold"
                  style={{ background: "rgba(255,255,255,0.08)", color: "rgba(240,240,255,0.88)", border: "1px solid rgba(255,255,255,0.12)" }}>
              Create challenge
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ── Loading / Error ── */
  if (err || !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#06060f" }}>
        <ParticleBackground />
        <motion.div className="relative z-10 text-center space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {err ? (
            <div className="rounded-2xl p-6 glow-danger" style={{ background: "rgba(255,71,87,0.06)" }}>
              <p className="text-sm font-bold text-danger">{err}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 rounded-xl mx-auto animate-breathe-glow" style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }} />
              <p className="text-sm text-text-muted">Loading challenge room...</p>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/markets" className="rounded-full px-4 py-2 text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}>
              Back to manager
            </Link>
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-accent">
              Create challenge
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  const status = statusConfig(challenge.status);
  const verdictRow = challenge.judgments?.[0] ?? null;
  const creatorEvidence = challenge.evidence.find(e => e.userId === creator?.user.id);
  const opponentEvidence = challenge.evidence.find(e => e.userId === opponent?.user.id);
  const deadlineLabel = formatChallengeDeadline(challenge.deadline);

  return (
    <div className="min-h-screen relative" style={{ background: "#06060f" }}>
      <ParticleBackground />

      {/* Ambient glow orbs */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,92,252,0.05) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
        <motion.div
          className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,200,0.04) 0%, transparent 70%)" }}
          animate={{ scale: [1, 1.08, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 10, repeat: Infinity, delay: 2 }}
        />
      </div>

      {/* ── Header ── */}
      <motion.header
        className="sticky top-0 z-30 glass-panel"
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 260 }}
      >
        <div className="plasma-line" />
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 py-3">
          <Link href="/markets" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                 style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)", boxShadow: "0 0 16px rgba(124,92,252,0.4)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <span className="text-sm font-extrabold text-text-primary group-hover:text-white transition-colors">
              My challenges
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-text-secondary transition-colors hover:text-white sm:inline-flex"
            >
              New challenge
            </Link>
            {/* Status badge */}
            <motion.div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
              style={{ background: status.bg, color: status.color, border: `1px solid ${status.border}` }}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {(isEvidenceWindowStatus(challenge.status) || isAiReviewStatus(challenge.status)) && (
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: status.color }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
              {status.label}
            </motion.div>

            {/* Stake badge */}
            {challenge.stake > 0 && (
              <div className="px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider"
                   style={{ background: "rgba(245,166,35,0.1)", color: "#f5a623", border: "1px solid rgba(245,166,35,0.2)" }}>
                {challenge.stake} cr stake
              </div>
            )}
          </div>
        </div>
      </motion.header>

      {/* ── Main Content ── */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Title + Rules */}
        <motion.div
          className="text-center space-y-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <h1 className="text-2xl sm:text-3xl font-black text-text-primary leading-tight">{challenge.title}</h1>
          {challenge.rules && (
            <p className="text-sm text-text-secondary max-w-xl mx-auto">{challenge.rules}</p>
          )}
          <div className="flex items-center justify-center gap-3 text-[10px] text-text-muted">
            <span>Evidence: {challenge.evidenceType.replace(/_/g, " ")}</span>
            {deadlineLabel && (
              <>
                <span className="text-text-muted/30">|</span>
                <span>{deadlineLabel}</span>
              </>
            )}
          </div>
        </motion.div>

        {/* ══ BATTLE ARENA — Split Screen ══ */}
        <div className="flex flex-col md:flex-row gap-4 md:gap-0 items-stretch">
          {/* Left: Creator */}
          <PlayerSide
            participant={creator ?? null}
            evidence={creatorEvidence}
            isMe={creator?.user.id === uid}
            side="left"
            challengeStatus={challenge.status}
          />

          {/* VS Divider */}
          <div className="flex md:flex-col items-center justify-center px-4 py-3 md:py-0">
            <div className="hidden md:block battle-divider h-full min-h-[200px]" />
            <motion.div
              className="relative w-14 h-14 rounded-full flex items-center justify-center z-10"
              style={{
                background: "linear-gradient(135deg, rgba(124,92,252,0.15), rgba(0,212,200,0.15))",
                border: "2px solid rgba(255,255,255,0.1)",
                boxShadow: "0 0 30px rgba(124,92,252,0.2), 0 0 60px rgba(0,212,200,0.1)",
              }}
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
            >
              <span className="text-xs font-black bg-gradient-to-r from-accent to-teal bg-clip-text text-transparent">VS</span>
              {/* Orbiting energy dot */}
              <motion.div
                className="absolute w-2 h-2 rounded-full"
                style={{ background: "#7c5cfc", boxShadow: "0 0 8px rgba(124,92,252,0.8)" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                initial={{ x: 20 }}
              />
            </motion.div>
            <div className="md:hidden h-px w-full bg-gradient-to-r from-transparent via-accent/20 to-transparent" />
          </div>

          {/* Right: Opponent */}
          <PlayerSide
            participant={opponent ?? null}
            evidence={opponentEvidence}
            isMe={opponent?.user.id === uid}
            side="right"
            challengeStatus={challenge.status}
          />
        </div>

        {/* ── Join Button (for non-participants viewing open challenge) ── */}
        <AnimatePresence>
          {canJoin && (
            <motion.div
              className="flex justify-center"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <motion.button
                onClick={() => void acceptChallenge()}
                disabled={busy}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="shimmer-btn px-8 py-4 rounded-2xl text-base font-black text-white disabled:opacity-50"
                style={{
                  background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
                  boxShadow: "0 8px 40px rgba(124,92,252,0.35), 0 0 80px rgba(0,212,200,0.1)",
                }}
              >
                {busy ? "Opening..." : "Review rules and join"}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Evidence Upload Section ── */}
        <AnimatePresence>
          {canCapture && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="rounded-2xl overflow-hidden gradient-border-animated"
              style={{
                background: "rgba(12,12,28,0.95)",
                boxShadow: "0 16px 60px rgba(0,0,0,0.4)",
              }}
            >
              <div className="plasma-line" />
              <div className="p-5 md:p-6 space-y-4">
                {/* Liveness prompt */}
                {challenge?.livenessPrompt && (
                  <div className="px-4 py-3 rounded-xl text-center"
                       style={{ background: "rgba(245,166,35,0.15)", border: "2px solid rgba(245,166,35,0.4)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                      Anti-Cheat Verification Required
                    </p>
                    <p className="text-sm font-extrabold text-amber-200">
                      {challenge.livenessPrompt}
                    </p>
                    <p className="text-[10px] text-amber-400/60 mt-1">
                      If this action is not visible in your video, AI will rule against you
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                       style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-extrabold text-text-primary">Submit Your Evidence</p>
                    <p className="text-[10px] text-text-muted">Record live video or paste a public URL</p>
                  </div>
                </div>

                {sameCameraEligible && (
                  <label
                    className="flex items-start gap-3 rounded-xl px-4 py-3 cursor-pointer"
                    style={{ background: "rgba(124,92,252,0.08)", border: "1px solid rgba(124,92,252,0.2)" }}
                  >
                    <input
                      type="checkbox"
                      checked={sharedSameCamera}
                      onChange={(event) => setSharedSameCamera(event.target.checked)}
                      className="mt-1 h-4 w-4 accent-[#7c5cfc]"
                    />
                    <span className="text-xs text-text-secondary leading-relaxed">
                      One-phone shared video for both players. Keep creator on the left, opponent on the right, and both full bodies visible.
                    </span>
                  </label>
                )}

                {recordingSessionRequired && (
                  <div
                    className="rounded-xl px-4 py-3 space-y-2"
                    style={{ background: "rgba(0,212,200,0.06)", border: "1px solid rgba(0,212,200,0.18)" }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal">
                      Recording protocol
                    </p>
                    {recordingSession ? (
                      <ul className="space-y-1">
                        {recordingSession.preRollInstructions?.slice(0, 4).map((item: string, index: number) => (
                          <li key={`${index}-${item}`} className="text-[11px] text-text-secondary leading-relaxed">
                            {index + 1}. {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        The app will start a recording session before you record, upload, or paste evidence.
                      </p>
                    )}
                  </div>
                )}

                {/* Camera permission error */}
                {cameraError && (
                  <div className="px-4 py-3 rounded-xl"
                       style={{ background: "rgba(255,71,87,0.12)", border: "1px solid rgba(255,71,87,0.35)" }}>
                    <p className="text-xs font-bold text-red-400">{cameraError}</p>
                  </div>
                )}

                {/* Camera Recording Section */}
                <div className="space-y-3">
                  {!cameraStream && !recordedBlob && (
                    <motion.button
                      onClick={() => void startCamera()}
                      disabled={busy}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-4 rounded-xl text-sm font-extrabold text-white disabled:opacity-40"
                      style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}
                    >
                      Open Camera to Record Evidence
                    </motion.button>
                  )}

                  {cameraStream && (
                    <div className="space-y-3">
                      <div className="relative overflow-hidden rounded-xl" style={{ background: "#000" }}>
                        <video
                          ref={videoPreviewRef}
                          autoPlay
                          muted
                          playsInline
                          onClick={() => { void playCameraPreview(); }}
                          onLoadedMetadata={() => {
                            setCameraReady(true);
                            void videoPreviewRef.current?.play().catch(() => {});
                          }}
                          onCanPlay={() => setCameraReady(true)}
                          onPlaying={() => setCameraReady(true)}
                          className="w-full"
                          style={{ maxHeight: 300, background: "#000", objectFit: "cover" }}
                        />
                        {!cameraReady && (
                          <button
                            type="button"
                            onClick={() => { void playCameraPreview(); }}
                            className="absolute inset-0 flex items-center justify-center bg-black/70 px-4 text-center"
                          >
                            <span className="text-xs font-bold text-white">Starting camera preview... tap here if it stays black.</span>
                          </button>
                        )}
                      </div>
                      {!isRecording ? (
                        <motion.button
                          onClick={startRecording}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className="w-full py-3 rounded-xl text-sm font-bold text-white"
                          style={{ background: "#dc2626" }}
                        >
                          Start Recording
                        </motion.button>
                      ) : (
                        <motion.button
                          onClick={stopRecording}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className="w-full py-3 rounded-xl text-sm font-bold text-white animate-pulse"
                          style={{ background: "#991b1b" }}
                        >
                          Stop Recording
                        </motion.button>
                      )}
                    </div>
                  )}

                  {recordedBlob && (
                    <div className="space-y-3">
                      <div className="text-center text-sm text-text-secondary px-3 py-2 rounded-xl"
                           style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.15)" }}>
                        Video recorded ({(recordedBlob.size / 1024 / 1024).toFixed(1)} MB). Ready to submit.
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <motion.button
                          onClick={() => setRecordedBlob(null)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className="py-2.5 rounded-xl text-xs font-bold border border-border-subtle"
                          style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.7)" }}
                        >
                          Re-record
                        </motion.button>
                        <motion.button
                          onClick={() => void submitRecordedVideo()}
                          disabled={busy}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className="py-2.5 rounded-xl text-xs font-extrabold text-white disabled:opacity-40"
                          style={{ background: "linear-gradient(135deg, #00e87a, #00d4c8)" }}
                        >
                          {busy ? "Uploading..." : "Submit Video"}
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>

                {/* URL paste fallback */}
                <div className="flex flex-col gap-2 p-4 rounded-xl" style={{ background: "rgba(0,212,200,0.04)", border: "1px solid rgba(0,212,200,0.12)" }}>
                  <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4c8" strokeWidth="2" strokeLinecap="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span className="text-xs font-bold text-teal">Paste URL (fallback)</span>
                  </div>
                  <input
                    value={pasteUrl}
                    onChange={e => setPasteUrl(e.target.value)}
                    placeholder="https://... video or image URL"
                    className="w-full rounded-lg px-3 py-2.5 text-xs bg-bg-input border border-border-subtle text-text-primary placeholder:text-text-muted focus:border-teal/50"
                  />
                  <motion.button
                    type="button"
                    disabled={busy || !pasteUrl.trim()}
                    onClick={() => void submitUrl()}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-2.5 rounded-lg text-xs font-extrabold text-white disabled:opacity-40"
                    style={{ background: "linear-gradient(135deg, #00d4c8, #0d9488)" }}
                  >
                    {busy ? "Uploading..." : "Submit URL"}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── AI Judge Section ── */}
        <AnimatePresence>
          {isAiReviewStatus(challenge.status) && isCreator && challenge.judgments.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl overflow-hidden"
              style={{
                background: "linear-gradient(165deg, rgba(245,166,35,0.06) 0%, rgba(124,92,252,0.04) 100%)",
                border: "1px solid rgba(245,166,35,0.2)",
                boxShadow: "0 16px 60px rgba(245,166,35,0.08)",
              }}
            >
              <div className="plasma-line-gold" />
              <div className="p-5 md:p-6 space-y-5">
                <div className="flex items-center gap-3">
                  <motion.div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, #f5a623, #ea580c)", boxShadow: "0 0 20px rgba(245,166,35,0.3)" }}
                    animate={{ boxShadow: ["0 0 20px rgba(245,166,35,0.2)", "0 0 30px rgba(245,166,35,0.4)", "0 0 20px rgba(245,166,35,0.2)"] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </motion.div>
                  <div>
                    <h3 className="text-base font-black text-text-primary">AI Judge Ready</h3>
                    <p className="text-[10px] text-text-muted">All evidence is in. Run the AI verdict.</p>
                  </div>
                </div>

                {/* Tier selector */}
                <div className="grid grid-cols-3 gap-2">
                  {([1, 2, 3] as const).map((t) => (
                    <motion.button
                      key={t}
                      onClick={() => setTier(t)}
                      whileHover={{ scale: 1.03, y: -2 }}
                      whileTap={{ scale: 0.97 }}
                      className="relative rounded-xl p-3 text-center transition-all overflow-hidden"
                      style={{
                        background: tier === t ? "rgba(245,166,35,0.12)" : "rgba(255,255,255,0.03)",
                        border: tier === t ? "1px solid rgba(245,166,35,0.4)" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {tier === t && (
                        <motion.div
                          className="absolute inset-0 rounded-xl"
                          layoutId="tier-glow"
                          style={{ background: "rgba(245,166,35,0.08)", border: "1px solid rgba(245,166,35,0.25)" }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                        />
                      )}
                      <div className="relative z-10">
                        <p className="text-sm font-black" style={{ color: tier === t ? "#f5a623" : "rgba(240,240,255,0.5)" }}>
                          {TIER_LABEL[t]}
                        </p>
                        <p className="text-[10px] text-text-muted mt-0.5">{TIER_DESC[t]}</p>
                        <p className="text-xs font-bold mt-1" style={{ color: tier === t ? "#f5a623" : "rgba(240,240,255,0.35)" }}>
                          {TIER_COST[t]} credits
                        </p>
                      </div>
                    </motion.button>
                  ))}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <motion.button
                    type="button"
                    disabled={busy}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void runJudge()}
                    className="shimmer-btn py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                    style={{
                      background: "linear-gradient(135deg, #f5a623, #7c5cfc)",
                      boxShadow: "0 8px 32px rgba(245,166,35,0.2)",
                    }}
                  >
                    {busy ? "AI Analyzing..." : `Run Verdict (${TIER_COST[tier]} cr)`}
                  </motion.button>
                  <motion.button
                    type="button"
                    disabled={busy}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => void runJudgeAsync()}
                    className="py-3.5 rounded-xl text-xs font-extrabold border border-amber-400/30 text-amber-100/80 disabled:opacity-40"
                    style={{ background: "rgba(245,166,35,0.06)" }}
                  >
                    Background Verdict (for video)
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Non-creator waiting for judge ── */}
        {isAiReviewStatus(challenge.status) && !isCreator && (
          <motion.div
            className="rounded-2xl p-5 text-center"
            style={{ background: "rgba(245,166,35,0.06)", border: "1px solid rgba(245,166,35,0.15)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <motion.div
              className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center"
              style={{ background: "rgba(245,166,35,0.15)" }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f5a623" strokeWidth="2.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </motion.div>
            <p className="text-sm font-bold text-amber-200">Waiting for the creator to start the AI verdict</p>
            <p className="text-[10px] text-text-muted mt-1">All evidence has been submitted</p>
          </motion.div>
        )}

        {/* ══ VERDICT REVEAL ══ */}
        <AnimatePresence>
          {verdictRow && verdictRevealed && (
            <motion.div
              key="verdict"
              className="rounded-2xl overflow-hidden verdict-enter"
              style={{
                background: "linear-gradient(165deg, rgba(0,232,122,0.06) 0%, rgba(124,92,252,0.04) 100%)",
                border: "1px solid rgba(0,232,122,0.2)",
                boxShadow: "0 24px 80px rgba(0,232,122,0.1), 0 0 1px rgba(0,232,122,0.3) inset",
              }}
            >
              <div className="plasma-line-success" />
              <div className="p-6 md:p-8 space-y-5">
                {/* Header */}
                <div className="text-center space-y-3">
                  <motion.div
                    className="inline-flex w-16 h-16 rounded-2xl items-center justify-center mx-auto"
                    style={{ background: "linear-gradient(135deg, #00e87a, #00d4c8)", boxShadow: "0 0 40px rgba(0,232,122,0.3)" }}
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </motion.div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-success">AI Verdict</p>
                  <h2 className="text-2xl font-black text-text-primary">
                    Winner: <span className="text-success">@{verdictRow.winner?.username ?? "Tie / Void"}</span>
                  </h2>
                </div>

                {/* Metadata */}
                <div className="flex flex-wrap justify-center gap-2">
                  {verdictRow.aiModel && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-white/5 text-text-muted border border-border-subtle">
                      AI judge
                    </span>
                  )}
                  {typeof verdictRow.confidence === "number" && (
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold"
                          style={{
                            background: verdictRow.confidence > 0.7 ? "rgba(0,232,122,0.1)" : "rgba(245,166,35,0.1)",
                            color: verdictRow.confidence > 0.7 ? "#00e87a" : "#f5a623",
                            border: `1px solid ${verdictRow.confidence > 0.7 ? "rgba(0,232,122,0.2)" : "rgba(245,166,35,0.2)"}`,
                          }}>
                      {(verdictRow.confidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>

                {/* Reasoning with typewriter */}
                <div className="rounded-xl p-5" style={{ background: "rgba(6,6,15,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-3">AI Reasoning</p>
                  <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
                    <TypewriterText text={verdictRow.reasoning ?? ""} speed={12} />
                  </p>
                </div>

                {/* Settlement summary */}
                {challenge.stake > 0 && (
                  <motion.div
                    className="flex items-center justify-center gap-6 py-3 rounded-xl"
                    style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.1)" }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="text-center">
                      <p className="text-[9px] font-bold uppercase text-text-muted">Stake</p>
                      <p className="text-sm font-black text-amber-400">{challenge.stake} cr</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(0,232,122,0.5)" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                    <div className="text-center">
                      <p className="text-[9px] font-bold uppercase text-text-muted">Winner receives</p>
                      <p className="text-sm font-black text-success">{challenge.stake * 2} cr</p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom Actions ── */}
        <motion.div
          className="flex flex-wrap gap-3 justify-center pt-2 pb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={copyLink}
            className="shimmer-btn flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy Invite Link"}
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void refresh()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-border-subtle"
            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </motion.button>

          <Link href="/markets">
            <motion.div
              whileHover={{ scale: 1.03, y: -1 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold border border-border-subtle cursor-pointer"
              style={{ background: "rgba(255,255,255,0.04)", color: "rgba(240,240,255,0.85)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Manager
            </motion.div>
          </Link>
        </motion.div>

        {/* ── Notification bar ── */}
        <AnimatePresence>
          {note && (
            <motion.div
              className="fixed bottom-6 left-1/2 z-50 px-5 py-3 rounded-2xl text-xs font-bold"
              style={{
                transform: "translateX(-50%)",
                background: noteType === "error" ? "rgba(255,71,87,0.95)"
                  : noteType === "success" ? "rgba(0,232,122,0.95)"
                  : "rgba(124,92,252,0.95)",
                color: "white",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                backdropFilter: "blur(12px)",
              }}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
            >
              {note}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Busy overlay */}
        <AnimatePresence>
          {busy && (
            <motion.div
              className="fixed bottom-20 left-1/2 z-40 flex items-center gap-2 px-4 py-2 rounded-xl"
              style={{ transform: "translateX(-50%)", background: "rgba(10,10,24,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <motion.div
                className="w-3 h-3 rounded-full"
                style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)" }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-[10px] font-bold text-text-secondary">Processing...</span>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
