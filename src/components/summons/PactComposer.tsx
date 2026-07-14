"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import RitualButton from "@/components/scene/RitualButton";
import * as api from "@/lib/api-client";

const opponentOptions = ["Open match", "Invite only", "Public pool"] as const;
const proofOptions = ["24 hours", "72 hours", "7 days"] as const;
const promptChips = ["Friend match", "Fitness quest", "Habit streak", "Skill challenge"] as const;
const placeholderExamples = [
  "First to win 3 badminton rallies...",
  "I can do 20 pushups in 60 seconds...",
  "Who can hold a plank longer?",
  "Challenge Alex to a Mario Kart score battle...",
] as const;
type CastPhase = "idle" | "charging" | "binding" | "sealing" | "settling";

function getChallengeTitle(input: string) {
  const firstLine = input.trim().split("\n")[0]?.trim();
  if (!firstLine) return "Awaiting challenge";
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function getProofHint(input: string, proofWindow: string) {
  const normalized = input.toLowerCase();
  if (/\b(by|before|until|on)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2})\b/.test(normalized)) {
    return "Deadline detected";
  }
  return proofWindow;
}

function newRequestId(prefix: string) {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

export default function PactComposer() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const castTimersRef = useRef<number[]>([]);
  const publishRequestIdRef = useRef<string | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const [input, setInput] = useState("");
  const [stake, setStake] = useState("50");
  const [opponentMode, setOpponentMode] = useState<(typeof opponentOptions)[number]>("Invite only");
  const [proofWindow, setProofWindow] = useState<(typeof proofOptions)[number]>("24 hours");
  const [turns, setTurns] = useState<api.AgentTurn[]>([]);
  const [draftState, setDraftState] = useState(() => api.emptyAgentDraftState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [castPhase, setCastPhase] = useState<CastPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [marketUrl, setMarketUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const canSubmit = Boolean(input.trim()) && !isSubmitting;
  const latestReply = useMemo(() => turns.filter((turn) => turn.role === "ai").at(-1), [turns]);
  const latestUserTurn = useMemo(() => turns.filter((turn) => turn.role === "user").at(-1), [turns]);
  const challengeTitle = getChallengeTitle(input);
  const storedChallengeTitle = draftState.title || draftState.proposition || getChallengeTitle(latestUserTurn?.content ?? "");
  const stakeDisplay = stake ? `${stake} credits` : "Unset";
  const hasInput = Boolean(input.trim());
  const displayChallengeTitle = hasInput ? challengeTitle : storedChallengeTitle;
  const castingActive = castPhase !== "idle" || isSubmitting;
  const proofHint = getProofHint(input, proofWindow);
  const resultTitle = draftState.title || storedChallengeTitle;
  const resultStatus = draftState.readyToPublish ? "Ready to send" : "Quest draft";
  const resultSummary = draftState.proposition || latestReply?.content || "Your Familiar is shaping the challenge into a clear quest.";
  const resultParticipants = draftState.participants || opponentMode;
  const resultProof = [draftState.evidenceType, draftState.timeWindow || proofWindow].filter(Boolean).join(" / ") || proofHint;
  const resultTiming = draftState.timeWindow || proofWindow || "Timing to be confirmed";
  const resultJudge = draftState.judgeRule || "AI Familiar reviews submitted proof.";
  const resultEntry = draftState.stake == null
    ? stakeDisplay
    : draftState.stake > 0 && draftState.stakeType !== "none"
      ? `${draftState.stake} ${draftState.stakeType || "credits"}`
      : "Free";
  const resultSafetyNote = draftState.safetyNotes.find((note) => note.trim().length > 0);
  const resultItems = [
    ["Summoner / opponent", resultParticipants],
    ["Proof required", resultProof],
    ["Win condition", draftState.proposition || resultTitle],
    ["Deadline / timing", resultTiming],
    ["AI Familiar judge", resultJudge],
    ["Quest entry", resultEntry],
  ] as const;
  const blueprintItems = [
    ["Quest", displayChallengeTitle],
    ["Credits", stakeDisplay],
    ["Opponent", opponentMode],
    ["Proof", proofHint],
    ["Familiar", "AI referee"],
  ] as const;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const value = inputRef.current?.value ?? "";
      setInput((current) => (current === value ? current : value));
    }, 160);

    return () => {
      window.clearInterval(timer);
      clearCastTimers();
      if (voiceRecorderRef.current?.state === "recording") {
        voiceRecorderRef.current.onstop = null;
        voiceRecorderRef.current.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!latestReply || !resultRef.current) return undefined;

    const timer = window.setTimeout(() => {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const mobileViewport = window.innerWidth < 640;
      resultRef.current?.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: mobileViewport ? "center" : "nearest",
      });
    }, 260);

    return () => window.clearTimeout(timer);
  }, [latestReply]);

  function clearCastTimers() {
    castTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    castTimersRef.current = [];
  }

  function triggerCastVisual() {
    clearCastTimers();
    setCastPhase("charging");
    castTimersRef.current = [
      window.setTimeout(() => setCastPhase("binding"), 520),
      window.setTimeout(() => setCastPhase("sealing"), 1260),
      window.setTimeout(() => setCastPhase("settling"), 2180),
      window.setTimeout(() => {
        setCastPhase("idle");
        castTimersRef.current = [];
      }, 3400),
    ];
  }

  function handleInput(event: FormEvent<HTMLTextAreaElement>) {
    setInput(event.currentTarget.value);
  }

  function stopVoiceTracks() {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  }

  async function transcribeVoice(recorder: MediaRecorder) {
    const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || "audio/webm" });
    voiceChunksRef.current = [];
    if (!blob.size) return;

    setIsTranscribing(true);
    setError(null);
    try {
      const response = await api.transcribeAudio(blob);
      const transcript = response.transcript.trim();
      if (!transcript) {
        setError("Pico could not hear a clear sentence. Try again closer to the microphone.");
        return;
      }
      setInput((current) => current.trim() ? `${current.trimEnd()} ${transcript}` : transcript);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not transcribe voice";
      if (/401|unauthorized/i.test(message)) {
        setError("Sign in before using voice transcription.");
        setAuthOpen(true);
      } else {
        setError(message);
      }
    } finally {
      setIsTranscribing(false);
    }
  }

  async function toggleVoiceInput() {
    if (isRecording) {
      voiceRecorderRef.current?.stop();
      return;
    }

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser does not support microphone recording.");
      return;
    }

    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      voiceChunksRef.current = [];
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm",
        "audio/aac",
      ];
      const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }
      voiceRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setIsRecording(false);
        stopVoiceTracks();
        setError("Microphone recording stopped unexpectedly.");
      };
      recorder.onstop = () => {
        setIsRecording(false);
        stopVoiceTracks();
        void transcribeVoice(recorder);
      };
      recorder.start(250);
      setIsRecording(true);
    } catch (err) {
      stopVoiceTracks();
      setError(err instanceof Error ? err.message : "Microphone access was not granted.");
    }
  }

  function draftWithSelectedSettings(base = draftState): api.AgentDraftState {
    const parsedStake = stake.trim() === "" ? null : Math.max(0, Math.floor(Number(stake)));
    const participants = opponentMode === "Invite only"
      ? "you + 1 invited friend"
      : opponentMode === "Public pool"
        ? "you + 1 opponent from the public pool"
        : "you + 1 open opponent";
    return {
      ...base,
      participants,
      stake: Number.isFinite(parsedStake) ? parsedStake : null,
      stakeType: parsedStake === null || !Number.isFinite(parsedStake) ? null : parsedStake === 0 ? "none" : "credits",
      timeWindow: proofWindow,
      readyToPublish: base.readyToPublish && parsedStake !== null && Number.isFinite(parsedStake),
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (!message || isSubmitting) return;

    triggerCastVisual();
    setIsSubmitting(true);
    setError(null);
    setMarketUrl(null);

    try {
      const challengeSettings = `Challenge settings: stake ${stake || "unset"} credits; opponent ${opponentMode}; proof window ${proofWindow}.`;
      const response = await api.agentRespond(
        `${message}\n\n${challengeSettings}`,
        turns,
        draftWithSelectedSettings(),
        newRequestId("turn"),
      );
      const nextTurns: api.AgentTurn[] = [
        ...turns,
        { role: "user", content: message },
        { role: "ai", content: response.userVisibleReply },
      ];
      setTurns(nextTurns);
      setDraftState(response.draftState);
      setInput("");

      if (response.toolError) setError(response.toolError);

      const toolResult = response.toolResult as
        | { marketUrl?: string; shareUrl?: string; challengeId?: string }
        | undefined;
      setMarketUrl(toolResult?.marketUrl || toolResult?.shareUrl || (toolResult?.challengeId ? `/challenge/${toolResult.challengeId}` : null));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not draft challenge";
      if (/401|unauthorized/i.test(message)) {
        setError("Sign in to continue");
        setAuthOpen(true);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePublish() {
    if (isSubmitting || marketUrl) return;
    const selectedDraft = draftWithSelectedSettings();
    if (!selectedDraft.readyToPublish) {
      setError("The quest still needs one clear answer before it can be published.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    triggerCastVisual();
    publishRequestIdRef.current ??= newRequestId("publish");
    try {
      const response = await api.publishAgentDraft(selectedDraft, publishRequestIdRef.current);
      setDraftState(response.draftState);
      setTurns((current) => [
        ...current,
        { role: "user", content: "Publish this quest" },
        { role: "ai", content: response.userVisibleReply },
      ]);
      if (response.toolError) {
        setError(response.toolError);
        return;
      }
      const toolResult = response.toolResult as
        | { marketUrl?: string; shareUrl?: string; challengeId?: string }
        | undefined;
      const nextUrl = toolResult?.marketUrl || toolResult?.shareUrl || (toolResult?.challengeId ? `/challenge/${toolResult.challengeId}` : null);
      if (!nextUrl) {
        setError("The server did not return the published quest link.");
        return;
      }
      setMarketUrl(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish quest");
    } finally {
      setIsSubmitting(false);
    }
  }

  const contractResult = latestReply ? (
    <section
      className="qx-contract-result relative z-10 mt-2 overflow-hidden rounded-[24px] p-3 sm:p-4"
      data-ready={draftState.readyToPublish ? "true" : "false"}
      data-testid="challenge-contract-result"
      ref={resultRef}
      style={{
        border: "1px solid var(--sum-border)",
        background:
          "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(223,245,255,0.82)), radial-gradient(circle at 88% 0%, rgba(255,216,107,0.28), transparent 34%)",
        color: "var(--sum-ink)",
        boxShadow: "0 14px 34px rgba(40,102,133,0.1)",
      }}
    >
      <span aria-hidden className="qx-result-aura" />
      <span aria-hidden className="qx-result-spine" />
      <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.28em]" style={{ color: "var(--sum-muted)" }}>
            Quest card
          </p>
          <h2 className="mt-1.5 max-w-[44rem] text-lg font-semibold leading-[1.12] sm:text-2xl">
            {resultTitle}
          </h2>
        </div>
        <span
          className="qx-result-status rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
          style={{
            border: `1px solid ${draftState.readyToPublish ? "rgba(143,230,193,0.72)" : "var(--sum-border)"}`,
            background: draftState.readyToPublish ? "rgba(143,230,193,0.36)" : "rgba(255,255,255,0.72)",
            color: draftState.readyToPublish ? "var(--sum-ink)" : "var(--sum-muted)",
          }}
        >
          {resultStatus}
        </span>
      </div>

      <p className="relative z-10 mt-3 text-sm font-semibold leading-6" style={{ color: "var(--sum-muted)" }}>
        {resultSummary}
      </p>

      <div className="relative z-10 mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {resultItems.map(([label, value], index) => (
          <div
            key={label}
            className="qx-result-metric min-w-0 rounded-[16px] px-3 py-2.5"
            style={{ "--metric-delay": `${index * 70}ms` } as CSSProperties}
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>

      {resultSafetyNote && (
        <div
          className="relative z-10 mt-3 rounded-[16px] px-3 py-2.5 text-sm font-semibold leading-5"
          style={{
            border: "1px solid rgba(180,35,74,0.18)",
            background: "rgba(255,228,234,0.82)",
            color: "#B4234A",
          }}
        >
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em]">Safety note</span>
          {resultSafetyNote}
        </div>
      )}

      <div className="qx-result-lockstrip relative z-10 mt-3 grid grid-cols-3 gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
        <span>Proof ready</span>
        <span>Familiar judge</span>
        <span>Receipt next</span>
      </div>

      <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2">
        {draftState.readyToPublish && !marketUrl && (
          <button
            className="qx-result-cta inline-flex min-h-11 items-center rounded-full px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
            onClick={() => { void handlePublish(); }}
            style={{ background: "linear-gradient(135deg, var(--sum-peach), var(--sum-sun))", color: "var(--sum-ink)" }}
            type="button"
          >
            {isSubmitting
              ? "Publishing…"
              : draftState.stake && draftState.stake > 0
                ? `Publish & escrow ${draftState.stake} credits`
                : "Publish free quest"}
          </button>
        )}
        {marketUrl && (
          <Link
            className="qx-result-cta inline-flex min-h-11 items-center rounded-full px-5 text-sm font-extrabold"
            href={marketUrl}
            style={{ background: "var(--sum-peach)", color: "var(--sum-ink)" }}
          >
            Open Quest
          </Link>
        )}
      </div>
    </section>
  ) : null;

  return (
    <>
      <div
        className="sum-map-world sum-quest-card relative isolate h-full overflow-hidden p-4 shadow-none sm:p-5 xl:min-h-[640px]"
        data-cast-phase={castPhase}
        data-casting={castingActive ? "true" : "false"}
        data-live={hasInput ? "true" : "false"}
        data-result={latestReply ? "true" : "false"}
        data-testid="pact-composer"
        style={{
          background:
            "radial-gradient(circle at 84% 8%, rgba(255,216,107,0.42), transparent 28%), radial-gradient(circle at 8% 20%, rgba(143,230,193,0.34), transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.95), rgba(223,245,255,0.9))",
          border: "1px solid var(--sum-border)",
          boxShadow: "var(--sum-shadow-soft)",
          color: "var(--sum-ink)",
        }}
      >
        <span
          aria-hidden
          className="sum-quest-orb absolute right-5 top-5 opacity-80"
          style={{ width: "2.75rem", height: "2.75rem", animationDelay: "-0.8s" }}
        />
        <span
          aria-hidden
          className="sum-quest-orb absolute bottom-6 left-6 hidden opacity-60 sm:block"
          style={{ width: "3.5rem", height: "3.5rem", animationDelay: "-2s" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-[72px] -z-10 h-px opacity-60"
          style={{
            background: "linear-gradient(90deg, transparent, rgba(143,230,193,0.72), rgba(255,185,120,0.58), transparent)",
            boxShadow: "0 0 36px rgba(143,230,193,0.3)",
          }}
        />
        <form
          onSubmit={(event) => { void handleSubmit(event); }}
          className="relative z-10 grid gap-2.5 min-[1660px]:grid-cols-[minmax(0,1fr)_220px]"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.28em]" style={{ color: "var(--sum-muted)" }}>
                  Summon Composer
                </p>
                <h1 className="mt-1.5 text-xl font-extrabold leading-[1.12] sm:text-2xl" style={{ color: "var(--sum-ink)" }}>
                  One sentence. Full quest.
                </h1>
                <p className="mt-2 max-w-[34rem] text-sm font-semibold leading-6" style={{ color: "var(--sum-muted)" }}>
                  Your familiar turns a challenge into rules, proof, invite, and receipt.
                </p>
              </div>
              <span
                className="sum-sticker-badge rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em]"
                style={{
                  background: draftState.readyToPublish ? "linear-gradient(135deg, var(--sum-sun), var(--sum-peach))" : undefined,
                  color: "var(--sum-ink)",
                }}
              >
                {draftState.readyToPublish ? "Ready" : "Quest draft"}
              </span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {promptChips.map((label) => (
                <span
                  key={label}
                  className="sum-sticker-badge px-3 py-2 text-xs font-extrabold"
                  style={{
                    background: "rgba(255,255,255,0.78)",
                    boxShadow: "0 8px 18px rgba(40,102,133,0.08)",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-2 grid gap-2 lg:grid-cols-[112px_1fr_1fr]">
              <label className="qx-control-card rounded-[18px] px-3 py-2" style={{ border: "1px solid var(--sum-border)", background: "rgba(255,255,255,0.72)" }}>
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}>
                  Credits
                </span>
                <input
                  className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => {
                    const next = event.target.value;
                    setStake(next);
                    if (next.trim() === "") {
                      setDraftState((current) => ({ ...current, stake: null, stakeType: null, readyToPublish: false }));
                    } else {
                      const nextStake = Math.max(0, Math.floor(Number(next)));
                      setDraftState((current) => ({ ...current, stake: nextStake, stakeType: nextStake === 0 ? "none" : "credits" }));
                    }
                    publishRequestIdRef.current = null;
                  }}
                  style={{ color: "var(--sum-ink)" }}
                  type="number"
                  value={stake}
                />
              </label>

              <div className="qx-control-card rounded-[18px] px-3 py-2" style={{ border: "1px solid var(--sum-border)", background: "rgba(255,255,255,0.72)" }}>
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}>
                  Opponent
                </span>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {opponentOptions.map((option) => {
                    const selected = option === opponentMode;
                    return (
                      <button
                        key={option}
                        className="min-h-10 rounded-xl px-2 text-[10px] font-semibold transition"
                        onClick={() => {
                          setOpponentMode(option);
                          setDraftState((current) => ({
                            ...current,
                            participants: option === "Invite only"
                              ? "you + 1 invited friend"
                              : option === "Public pool"
                                ? "you + 1 opponent from the public pool"
                                : "you + 1 open opponent",
                          }));
                          publishRequestIdRef.current = null;
                        }}
                        style={{
                          background: selected ? "var(--sum-peach)" : "rgba(255,255,255,0.68)",
                          border: `1px solid ${selected ? "rgba(255,185,120,0.72)" : "var(--sum-border)"}`,
                          color: selected ? "var(--sum-ink)" : "var(--sum-muted)",
                        }}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="qx-control-card rounded-[18px] px-3 py-2" style={{ border: "1px solid var(--sum-border)", background: "rgba(255,255,255,0.72)" }}>
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}>
                  Proof window
                </span>
                <div className="mt-2 grid grid-cols-3 gap-1">
                  {proofOptions.map((option) => {
                    const selected = option === proofWindow;
                    return (
                      <button
                        key={option}
                        className="min-h-10 rounded-xl px-2 text-[10px] font-semibold transition"
                        onClick={() => {
                          setProofWindow(option);
                          setDraftState((current) => ({ ...current, timeWindow: option }));
                          publishRequestIdRef.current = null;
                        }}
                        style={{
                          background: selected ? "var(--sum-mint)" : "rgba(255,255,255,0.68)",
                          border: `1px solid ${selected ? "rgba(143,230,193,0.78)" : "var(--sum-border)"}`,
                          color: selected ? "var(--sum-ink)" : "var(--sum-muted)",
                        }}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_56px_150px]">
              <textarea
                className="qx-challenge-input min-h-[9rem] w-full resize-none rounded-[22px] bg-white/85 p-4 text-base font-semibold leading-6 outline-none placeholder:font-semibold sm:min-h-[10rem]"
                data-live={hasInput ? "true" : "false"}
                disabled={isSubmitting}
                onChange={handleInput}
                onInput={handleInput}
                placeholder={placeholderExamples.join("\n")}
                ref={inputRef}
                style={{
                  border: "1px solid var(--sum-border)",
                  color: "var(--sum-ink)",
                  boxShadow: "inset 0 0 28px rgba(40,102,133,0.05)",
                }}
                value={input}
              />
              <button
                aria-label={isRecording ? "Stop voice recording" : "Describe quest by voice"}
                className="grid min-h-14 place-items-center rounded-full border text-[11px] font-extrabold transition hover:-translate-y-0.5 sm:min-h-16"
                disabled={isSubmitting || isTranscribing}
                onClick={() => { void toggleVoiceInput(); }}
                style={{
                  background: isRecording ? "#fecaca" : "rgba(255,255,255,0.88)",
                  borderColor: isRecording ? "#fca5a5" : "var(--sum-border)",
                  color: isRecording ? "#991b1b" : "var(--sum-ink)",
                  boxShadow: isRecording ? "0 0 0 5px rgba(252,165,165,0.2)" : "0 10px 22px rgba(40,102,133,0.08)",
                }}
                title={isRecording ? "Stop recording" : "Speak your challenge"}
                type="button"
              >
                <span aria-hidden className="grid h-5 w-5 place-items-center">
                  {isRecording ? (
                    <span className="h-3 w-3 rounded-[3px] bg-current" />
                  ) : (
                    <svg fill="none" height="20" viewBox="0 0 24 24" width="20">
                      <rect height="11" rx="4" stroke="currentColor" strokeWidth="2" width="7" x="8.5" y="2.5" />
                      <path d="M5 10.5C5 14.37 8.13 17.5 12 17.5C15.87 17.5 19 14.37 19 10.5M12 17.5V21M9 21H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                    </svg>
                  )}
                </span>
                <span>{isTranscribing ? "..." : isRecording ? "Stop" : "Voice"}</span>
              </button>
              <RitualButton
                aria-label="Summon"
                className="qx-generate-button min-h-14 rounded-full px-5 text-sm normal-case tracking-normal sm:min-h-16"
                data-cast-phase={castPhase}
                data-casting={castingActive ? "true" : "false"}
                disabled={!canSubmit}
                style={{
                  background: "linear-gradient(135deg, var(--sum-peach), var(--sum-sun))",
                  border: "1px solid rgba(255,185,120,0.68)",
                  boxShadow: canSubmit ? "0 14px 30px rgba(255,164,96,0.24)" : "none",
                  color: "var(--sum-ink)",
                }}
                type="submit"
              >
                {isSubmitting ? "Summoning..." : "Summon"}
              </RitualButton>
            </div>

            {contractResult ?? (
              <div
                className="qx-blueprint-preview mt-2 overflow-hidden rounded-lg p-2"
                data-cast-phase={castPhase}
                data-casting={castingActive ? "true" : "false"}
                data-active={hasInput ? "true" : "false"}
                data-testid="challenge-blueprint-preview"
                style={{
                  border: "1px solid var(--sum-border)",
                  background: hasInput
                    ? "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(143,230,193,0.18), rgba(255,216,107,0.12))"
                    : "rgba(255,255,255,0.62)",
                  boxShadow: hasInput ? "inset 0 0 34px rgba(40,102,133,0.045), 0 12px 26px rgba(40,102,133,0.08)" : "none",
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "var(--sum-muted)" }}>
                      AI Quest Blueprint
                    </p>
                    <p className="mt-1 max-w-[42rem] truncate text-sm font-extrabold" style={{ color: "var(--sum-ink)" }}>
                      {hasInput ? challengeTitle : "Type one measurable challenge sentence."}
                    </p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    style={{
                      border: `1px solid ${hasInput ? "rgba(143,230,193,0.72)" : "var(--sum-border)"}`,
                      background: hasInput ? "rgba(143,230,193,0.26)" : "rgba(255,255,255,0.68)",
                      color: hasInput ? "var(--sum-ink)" : "var(--sum-muted)",
                    }}
                  >
                    {hasInput ? "Structuring" : "Waiting"}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-5 gap-1 text-[9px] sm:text-[10px]">
                  {blueprintItems.map(([label, value]) => (
                    <span
                      key={label}
                      className="qx-blueprint-cell min-w-0 rounded-md px-1.5 py-1.5 sm:px-2"
                      style={{
                        border: "1px solid var(--sum-border)",
                        background: "rgba(255,255,255,0.72)",
                        color: "var(--sum-muted)",
                      }}
                    >
                      <span className="block uppercase tracking-[0.14em]" style={{ color: "var(--sum-muted)" }}>{label}</span>
                      <span className="mt-0.5 block truncate font-semibold normal-case tracking-normal" style={{ color: "var(--sum-ink)" }}>
                        {value}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-xs font-semibold" style={{ color: "var(--sum-muted)" }}>
              {castPhase === "charging"
                ? "Summoning quest intent..."
                : castPhase === "binding"
                  ? "Binding quest proof..."
                  : castPhase === "sealing"
                    ? "Compiling quest terms..."
                    : castPhase === "settling"
                      ? "Quest preview forming..."
                      : latestReply
                        ? draftState.readyToPublish ? "Ready to publish" : "One answer still needed"
                        : `${stakeDisplay} / ${proofWindow}`}
            </p>
          </div>

          <aside className="hidden rounded-[20px] p-3 min-[1660px]:block" style={{ border: "1px solid var(--sum-border)", background: "rgba(255,255,255,0.72)" }}>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.28em]" style={{ color: "var(--sum-muted)" }}>
              Quest card
            </p>
            <h3 className="mt-3 text-base font-extrabold leading-tight" style={{ color: "var(--sum-ink)" }}>
              {displayChallengeTitle}
            </h3>
            <dl className="mt-3 space-y-0 text-sm">
              {[
                ["Credits", stakeDisplay],
                ["Mode", opponentMode],
                ["Proof", proofWindow],
                ["Familiar", "AI referee"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-t py-2.5" style={{ borderColor: "var(--sum-border)" }}>
                  <dt style={{ color: "var(--sum-muted)" }}>{label}</dt>
                  <dd className="text-right font-semibold" style={{ color: "var(--sum-ink)" }}>{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </form>

        {error && (
          <p className="mt-3 rounded-md px-3 py-2 text-sm" style={{ background: "rgba(163,31,52,0.14)", color: "#fecaca" }}>
            {error}
          </p>
        )}

      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
