"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import * as api from "@/lib/api-client";
import type { ChallengeDetail } from "@/lib/api-client";
import { readOracleLlmPrefs } from "@/lib/oracle-prefs";

export default function VersusPageClient({ challengeId }: { challengeId: string }) {
  const { data: session, update: updateSession } = useSession();
  const uid = (session?.user as { id?: string } | undefined)?.id;

  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [pasteUrl, setPasteUrl] = useState("");

  const refresh = useCallback(async () => {
    setErr("");
    try {
      const { challenge: c } = await api.getChallenge(challengeId);
      setChallenge(c);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    }
  }, [challengeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!challenge || challenge.status === "settled") return;
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [challenge?.status, refresh]);

  const creator = challenge?.participants.find((p) => p.role === "creator");
  const opponent = challenge?.participants.find((p) => p.role === "opponent");
  const myEvidence = challenge?.evidence.find((e) => e.userId === uid);
  const isCreator = uid && challenge?.creatorId === uid;

  const uploadFile = async (file: File) => {
    if (!challenge || !uid) return;
    setBusy(true);
    setNote("");
    try {
      const presign = await api.presignEvidenceUpload({
        challengeId: challenge.id,
        contentType: file.type || "application/octet-stream",
        filename: file.name,
      });
      if (!presign.configured || !presign.uploadUrl || !presign.publicUrl) {
        setNote("Direct upload is off — paste a public HTTPS URL to your clip below.");
        setBusy(false);
        return;
      }
      const headers: Record<string, string> = {
        ...(presign.headers as Record<string, string> | undefined),
      };
      const put = await fetch(presign.uploadUrl, {
        method: presign.method ?? "PUT",
        body: file,
        headers,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);

      await api.submitEvidence(challenge.id, {
        type: file.type.startsWith("video") ? "video" : "photo",
        url: presign.publicUrl,
        description: `Captured: ${file.name}`,
      });
      await refresh();
      await updateSession?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const submitUrl = async () => {
    if (!challenge || !uid || !pasteUrl.trim()) return;
    setBusy(true);
    setNote("");
    try {
      await api.submitEvidence(challenge.id, {
        type: "video",
        url: pasteUrl.trim(),
        description: "Video URL (manual)",
      });
      setPasteUrl("");
      await refresh();
      await updateSession?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setBusy(false);
    }
  };

  const runJudge = async () => {
    if (!challenge) return;
    setBusy(true);
    setNote("");
    try {
      const prefs = readOracleLlmPrefs();
      await api.judgeChallenge(challenge.id, 1, {
        providerId: prefs.providerId,
        ...(prefs.model ? { model: prefs.model } : {}),
      });
      await refresh();
      await updateSession?.();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Judge failed");
    } finally {
      setBusy(false);
    }
  };

  if (!uid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#06060f" }}>
        <p className="text-text-secondary mb-4">Sign in to enter the versus room.</p>
        <Link href="/" className="text-accent font-bold">
          Back home
        </Link>
      </div>
    );
  }

  if (err || !challenge) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "#06060f" }}>
        <p className="text-text-muted mb-4">{err || "Loading…"}</p>
        <Link href="/" className="text-accent font-bold">
          Back home
        </Link>
      </div>
    );
  }

  const left = creator;
  const right = opponent;
  const canCapture = ["open", "live", "matched"].includes(challenge.status) && !myEvidence;

  return (
    <motion.div
      layoutId={`challenge-card-${challengeId}`}
      className="min-h-screen px-4 py-8 max-w-5xl mx-auto"
      style={{ background: "#06060f" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="text-sm font-bold text-accent hover:underline">
          ← Home
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          {challenge.status}
        </span>
      </div>

      <h1 className="text-xl font-black text-text-primary text-center mb-2">{challenge.title}</h1>
      <p className="text-center text-xs text-text-muted mb-8">
        {challenge.stake > 0 ? `${challenge.stake} credits at stake · ` : ""}
        Evidence: {challenge.evidenceType.replace(/_/g, " ")}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {[left, right].map((slot, idx) => {
          if (!slot) {
            return (
              <div
                key={idx}
                className="rounded-2xl p-6 border border-dashed border-white/10 text-text-muted text-sm text-center"
              >
                Waiting for opponent…
              </div>
            );
          }
          const ev = challenge.evidence.find((e) => e.userId === slot.user.id);
          const label = slot.role === "creator" ? "Challenger (A)" : "Warrior (B)";
          const isMe = slot.user.id === uid;
          return (
            <motion.div
              key={slot.user.id}
              className="rounded-2xl p-5 border"
              style={{
                background: "rgba(255,255,255,0.04)",
                borderColor: isMe ? "rgba(124,92,252,0.45)" : "rgba(255,255,255,0.08)",
              }}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: idx * 0.08 }}
            >
              <p className="text-[10px] font-bold text-text-muted uppercase mb-1">{label}</p>
              <p className="text-lg font-black text-text-primary mb-3">@{slot.user.username}</p>
              {ev ? (
                <div className="text-xs text-text-secondary space-y-1">
                  <p className="font-semibold text-success">Evidence in · {ev.type}</p>
                  {ev.url && (
                    <a href={ev.url} target="_blank" rel="noreferrer" className="text-accent break-all block">
                      Open media
                    </a>
                  )}
                  {ev.description && <p className="text-text-muted">{ev.description}</p>}
                </div>
              ) : (
                <p className="text-xs text-text-muted">{isMe ? "You — upload your proof." : "Not submitted yet."}</p>
              )}
            </motion.div>
          );
        })}
      </div>

      {canCapture && (
        <div
          className="rounded-2xl p-5 mb-6 space-y-4"
          style={{ background: "rgba(124,92,252,0.08)", border: "1px solid rgba(124,92,252,0.2)" }}
        >
          <p className="text-sm font-bold text-text-primary">Your capture</p>
          <p className="text-[11px] text-text-muted">
            Use the camera on mobile, or choose a file. Uploads require S3 presign env; otherwise paste a public video URL.
          </p>
          <div className="flex flex-wrap gap-2">
            <label className="px-4 py-2 rounded-xl text-xs font-extrabold text-white cursor-pointer"
              style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}>
              Camera / file
              <input
                type="file"
                accept="video/*,image/*"
                capture="environment"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              placeholder="https://… video URL"
              className="flex-1 min-w-[200px] rounded-xl px-3 py-2 text-sm bg-bg-input border border-border-subtle text-text-primary"
            />
            <button
              type="button"
              disabled={busy || !pasteUrl.trim()}
              onClick={() => void submitUrl()}
              className="px-4 py-2 rounded-xl text-xs font-extrabold text-white disabled:opacity-40"
              style={{ background: "linear-gradient(135deg, #00d4c8, #0d9488)" }}
            >
              Submit URL
            </button>
          </div>
        </div>
      )}

      {challenge.status === "judging" && isCreator && (
        <div className="text-center mb-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runJudge()}
            className="px-6 py-3 rounded-xl text-sm font-black text-white disabled:opacity-40"
            style={{ background: "linear-gradient(135deg, #f5a623, #ea580c)" }}
          >
            Run AI verdict (if auto-judge did not finish)
          </button>
        </div>
      )}

      {challenge.status === "settled" && challenge.judgments[0] && (
        <motion.div
          className="rounded-2xl p-5 text-center"
          style={{ background: "rgba(0,232,122,0.08)", border: "1px solid rgba(0,232,122,0.25)" }}
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <p className="text-xs font-bold text-text-muted uppercase mb-2">Settled</p>
          <p className="text-text-primary font-bold">
            Winner: @{challenge.judgments[0].winner?.username ?? "—"}
          </p>
          <p className="text-xs text-text-secondary mt-2 text-left whitespace-pre-wrap">
            {challenge.judgments[0].reasoning}
          </p>
        </motion.div>
      )}

      {note && <p className="text-xs font-bold text-center mt-4" style={{ color: "#ff4757" }}>{note}</p>}
      {busy && <p className="text-[10px] text-center text-text-muted mt-2">Working…</p>}
    </motion.div>
  );
}
