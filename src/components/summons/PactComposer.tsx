"use client";
import {interfaceCopy} from "@/lib/interface-copy";
import {SumText,useSumLanguage} from "@/components/locale/SumLanguage";

import Link from "next/link";
import { useSession } from "next-auth/react";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import RitualButton from "@/components/scene/RitualButton";
import QuestGlyph from "@/components/world/QuestGlyph";
import * as api from "@/lib/api-client";
import { COMPOSER_AUTH_CHECKPOINT, draftForComposer, readComposerCheckpoint } from "@/lib/composer-draft";

const opponentOptions = ["Open match", "Invite only", "Public pool"] as const;
const proofOptions = ["24 hours", "72 hours", "7 days"] as const;
const promptChips = [
  ["Friend match", "My friend and I will play badminton. First to 3 points wins."],
  ["Fitness quest", "My friend and I will compete to do the most pushups in 60 seconds."],
  ["Habit streak", "My friend and I want to walk every day for 7 days. Help us agree on proof."],
  ["Skill challenge", "My friend and I want a drawing challenge. Help us define a fair win condition."],
] as const;
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

export default function PactComposer({ initialPrompt = "", appMode = false }: { initialPrompt?: string; appMode?: boolean } = {}) {
  const uiLanguage=useSumLanguage();
  const t=(text:string)=>interfaceCopy(uiLanguage,text);
  const { data: session, status: sessionStatus } = useSession();
  const restoredAuthRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const castTimersRef = useRef<number[]>([]);
  const publishRequestIdRef = useRef<string | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const [input, setInput] = useState(initialPrompt);
  const [stake, setStake] = useState("0");
  const [opponentMode, setOpponentMode] = useState<(typeof opponentOptions)[number]>("Invite only");
  const [proofWindow, setProofWindow] = useState<string>("24 hours");
  const [turns, setTurns] = useState<api.AgentTurn[]>([]);
  const [draftState, setDraftState] = useState(() => api.emptyAgentDraftState());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [castPhase, setCastPhase] = useState<CastPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [marketUrl, setMarketUrl] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const canSubmit = Boolean(input.trim()) && !isSubmitting && !isRecording && !isTranscribing;
  const latestReply = useMemo(() => turns.filter((turn) => turn.role === "ai").at(-1), [turns]);
  const latestUserTurn = useMemo(() => turns.filter((turn) => turn.role === "user").at(-1), [turns]);
  const challengeTitle = getChallengeTitle(input);
  const storedChallengeTitle = draftState.title || draftState.proposition || getChallengeTitle(latestUserTurn?.content ?? "");
  const stakeDisplay = stake === "0" ? "Free entry" : stake ? `${stake} credits` : "Unset";
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
    if (sessionStatus === "loading" || restoredAuthRef.current) return;
    restoredAuthRef.current = true;
    try {
      const raw = sessionStorage.getItem(COMPOSER_AUTH_CHECKPOINT);
      if (!raw) return;
      sessionStorage.removeItem(COMPOSER_AUTH_CHECKPOINT);
      const saved = readComposerCheckpoint(raw, session?.user?.id ?? null);
      if (!saved) return;
      setInput(saved.input); setStake(saved.settings.stake);
      setOpponentMode(saved.settings.opponentMode as (typeof opponentOptions)[number]);
      setProofWindow(saved.settings.proofWindow); setDraftState(saved.draft); setTurns(saved.turns);
    } catch { /* Restricted browser storage must not block challenge creation. */ }
  }, [sessionStatus, session?.user?.id]);

  useEffect(() => {
    return () => {
      clearCastTimers();
      if (voiceRecorderRef.current?.state === "recording") {
        voiceRecorderRef.current.onstop = null;
        voiceRecorderRef.current.stop();
      }
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const log = conversationRef.current;
    if (log) log.scrollTop = log.scrollHeight;
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
    return draftForComposer(base, { stake, opponentMode, proofWindow });
  }

  function applyServerDraft(next: api.AgentDraftState) {
    setDraftState(next);
    if (next.stake !== null) setStake(String(next.stake));
    if (next.timeWindow) setProofWindow(next.timeWindow);
    if (next.participants) setOpponentMode(/public pool/i.test(next.participants)
      ? "Public pool" : /open opponent/i.test(next.participants) ? "Open match" : "Invite only");
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
      applyServerDraft(response.draftState);
      publishRequestIdRef.current = null;
      setInput("");

      if (response.toolError) setError(response.toolError);

      const toolResult = response.toolResult as
        | { marketUrl?: string; shareUrl?: string; challengeId?: string }
        | undefined;
      const publishedId = toolResult?.challengeId;
      setMarketUrl(appMode && publishedId && /^[a-zA-Z0-9_-]{8,128}$/.test(publishedId)
        ? `/app/quest?id=${encodeURIComponent(publishedId)}`
        : toolResult?.marketUrl || toolResult?.shareUrl ||
          (publishedId ? `/challenge/${publishedId}` : null));
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
      applyServerDraft(response.draftState);
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
      const publishedId = toolResult?.challengeId;
      const nextUrl = appMode && publishedId && /^[a-zA-Z0-9_-]{8,128}$/.test(publishedId)
        ? `/app/quest?id=${encodeURIComponent(publishedId)}`
        : toolResult?.marketUrl || toolResult?.shareUrl ||
          (publishedId ? `/challenge/${publishedId}` : null);
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
          <p className="text-[10px] font-extrabold uppercase tracking-[0.28em]" style={{ color: "var(--sum-muted)" }}> <SumText en="Quest card" zh="挑战卡片"/> </p>
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
          {t(resultStatus)}
        </span>
      </div>

      <p className="relative z-10 mt-3 text-sm font-semibold leading-6" style={{ color: "var(--sum-muted)" }}>
        {resultSummary}
      </p>

      <div className="relative z-10 mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {resultItems.map(([label, value], index) => (
          <div
            key={t(label)}
            className="qx-result-metric min-w-0 rounded-[16px] px-3 py-2.5"
            style={{ "--metric-delay": `${index * 70}ms` } as CSSProperties}
          >
            <span>{t(label)}</span>
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
          <span className="block text-[10px] font-extrabold uppercase tracking-[0.16em]"><SumText en="Safety note" zh="安全说明"/></span>
          {resultSafetyNote}
        </div>
      )}

      <div className="qx-result-lockstrip relative z-10 mt-3 grid grid-cols-3 gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
        <span>{draftState.readyToPublish ? t("Rules ready") : t("Rules to confirm")}</span>
        <span><SumText en="Invite after publishing" zh="发布后邀请"/></span>
        <span><SumText en="Proof comes next" zh="随后提交证据"/></span>
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
              ? t("Publishing…")
              : draftState.stake && draftState.stake > 0
                ? (uiLanguage==="zh"?`发布并预留 ${draftState.stake} 积分`:`Publish & escrow ${draftState.stake} credits`)
                : t("Publish free quest")}
          </button>
        )}
        {marketUrl && (
          <Link
            className="qx-result-cta inline-flex min-h-11 items-center rounded-full px-5 text-sm font-extrabold"
            href={marketUrl}
            style={{ background: "var(--sum-peach)", color: "var(--sum-ink)" }}
          > <SumText en="Open Quest" zh="打开 Quest"/> </Link>
        )}
      </div>
    </section>
  ) : null;

  return (
    <>
      <div
        className="quest-composer h-full"
        data-cast-phase={castPhase}
        data-casting={castingActive ? "true" : "false"}
        data-live={hasInput ? "true" : "false"}
        data-result={latestReply ? "true" : "false"}
        data-testid="pact-composer"
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
          aria-busy={isSubmitting}
          onSubmit={(event) => { void handleSubmit(event); }}
          className="relative z-10 grid gap-3"
        >
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-extrabold leading-tight sm:text-xl" style={{ color: "var(--sum-ink)" }}> <SumText en="Tell Pico your idea." zh="告诉 Pico 你的想法。"/> </h2>
                <p className="mt-2 max-w-[34rem] text-sm font-medium leading-5" style={{ color: "var(--sum-muted)" }}> <SumText en="Review every rule before publishing." zh="发布前请核对每一条规则。"/> </p>
              </div>
              <span
                className="sum-sticker-badge shrink-0 rounded-full px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em]"
                style={{
                  background: draftState.readyToPublish ? "linear-gradient(135deg, var(--sum-sun), var(--sum-peach))" : undefined,
                  color: "var(--sum-ink)",
                }}
              >
                {draftState.readyToPublish ? t("Ready") : t("Quest draft")}
              </span>
            </div>

            <div className="quest-idea-strip mt-4">
              {promptChips.map(([label, example]) => (
                <button
                  key={t(label)}
                  disabled={isSubmitting || isRecording || isTranscribing}
                  onClick={() => { setInput(example); inputRef.current?.focus(); }}
                  type="button"
                >
                  {t(label)}
                </button>
              ))}
            </div>

            <details className="quest-terms">
              <summary>
                <span className="inline-flex items-center gap-2"><QuestGlyph className="h-4 w-4" kind="rules" /> <SumText en="Quest terms" zh="挑战条款"/></span>
                <span className="text-[10px] font-bold text-[color:var(--sum-muted)]">{t(stakeDisplay)} · {t(opponentMode)} · {t(proofWindow)}</span>
              </summary>
              <fieldset className="quest-terms__grid min-w-0" disabled={isSubmitting}>
              <legend className="sr-only"><SumText en="Quest terms" zh="挑战条款"/></legend>
              <label className="quest-control">
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}> <SumText en="Credits" zh="积分"/> </span>
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

              <div className="quest-control">
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}> <SumText en="Opponent" zh="对手"/> </span>
                <div className="quest-choice-grid">
                  {opponentOptions.map((option) => {
                    const selected = option === opponentMode;
                    return (
                      <button
                        key={t(option)}
                        data-selected={selected ? "true" : "false"}
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
                        style={{ "--choice-color": "var(--sum-peach)" } as CSSProperties}
                        type="button"
                      >
                        {t(option)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="quest-control">
                <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "var(--sum-muted)" }}> <SumText en="Proof window" zh="证据提交时限"/> </span>
                <div className="quest-choice-grid">
                  {Array.from(new Set([...proofOptions, proofWindow])).map((option) => {
                    const selected = option === proofWindow;
                    return (
                      <button
                        key={t(option)}
                        data-selected={selected ? "true" : "false"}
                        onClick={() => {
                          setProofWindow(option);
                          setDraftState((current) => ({ ...current, timeWindow: option }));
                          publishRequestIdRef.current = null;
                        }}
                        style={{ "--choice-color": "var(--sum-mint)" } as CSSProperties}
                        type="button"
                      >
                        {t(option)}
                      </button>
                    );
                  })}
                </div>
              </div>
              </fieldset>
            </details>

            {turns.length > 0 && (
              <div aria-label="Challenge conversation" aria-live="polite" className="quest-conversation mt-4" ref={conversationRef} role="log" tabIndex={0}>
                {turns.map((turn, index) => (
                  <div className={`quest-conversation__turn quest-conversation__turn--${turn.role}`} key={index}>
                    <span className="text-xs font-extrabold">{turn.role === "user" ? t("You") : "Pico · AI referee"}</span>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{turn.content}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="quest-composer__prompt mt-3">
              <textarea
                aria-label={turns.length ? t("Reply to Pico") : t("Describe your challenge")}
                className="qx-challenge-input"
                data-live={hasInput ? "true" : "false"}
                disabled={isSubmitting}
                onChange={handleInput}
                onInput={handleInput}
                placeholder={turns.length ? t("Answer the question or change a rule…") : placeholderExamples[0]}
                ref={inputRef}
                value={input}
              />
              <div className="quest-composer__actions">
              <button
                aria-label={isRecording ? "Stop voice recording" : "Describe quest by voice"}
                className="quest-tool-button"
                disabled={isSubmitting || isTranscribing}
                onClick={() => { void toggleVoiceInput(); }}
                style={{ background: isRecording ? "#fecaca" : undefined, color: isRecording ? "#991b1b" : undefined }}
                title={isRecording ? t("Stop recording") : "Speak your challenge"}
                type="button"
              >
                <span aria-hidden className="grid h-5 w-5 place-items-center">
                  {isRecording ? (
                    <span className="h-3 w-3 rounded-[3px] bg-current" />
                  ) : (
                    <QuestGlyph className="h-5 w-5" kind="voice" />
                  )}
                </span>
                <span>{isTranscribing ? "..." : isRecording ? t("Stop") : t("Voice")}</span>
              </button>
              <RitualButton
                aria-label="Summon"
                className="quest-primary-button quest-submit-button qx-generate-button"
                data-cast-phase={castPhase}
                data-casting={castingActive ? "true" : "false"}
                disabled={!canSubmit}
                type="submit"
              >
                <QuestGlyph className="h-4 w-4" kind="spark" />
                {isSubmitting ? "Thinking…" : turns.length ? "Send reply" : t("Summon quest")}
              </RitualButton>
              </div>
            </div>

            {contractResult ?? (
              <div
                className="quest-blueprint qx-blueprint-preview"
                data-cast-phase={castPhase}
                data-casting={castingActive ? "true" : "false"}
                data-active={hasInput ? "true" : "false"}
                data-testid="challenge-blueprint-preview"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.22em]" style={{ color: "var(--sum-muted)" }}> <SumText en="AI Quest Blueprint" zh="AI 挑战草案"/> </p>
                    <p className="mt-1 max-w-[42rem] truncate text-sm font-extrabold" style={{ color: "var(--sum-ink)" }}>
                      {hasInput ? challengeTitle : t("Type one measurable challenge sentence.")}
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
                    {hasInput ? "Structuring" : t("Waiting")}
                  </span>
                </div>

                <div className="quest-blueprint__track">
                  {blueprintItems.map(([label, value]) => (
                    <span
                      key={t(label)}
                      className="qx-blueprint-cell"
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
                        ? draftState.readyToPublish ? "Ready to publish" : "Reply to Pico to finish the rules"
                        : `${stakeDisplay} / ${proofWindow}`}
            </p>
          </div>

          <aside className="hidden">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.28em]" style={{ color: "var(--sum-muted)" }}> <SumText en="Quest card" zh="挑战卡片"/> </p>
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
          <p className="mt-3 rounded-xl px-4 py-3 text-sm font-semibold" role="alert" style={{ background: "#fff1f2", color: "#9f1239" }}>
            {error}
          </p>
        )}

      </div>

      <AuthModal
        open={authOpen}
        onBeforeRedirect={() => {
          try {
            sessionStorage.setItem(COMPOSER_AUTH_CHECKPOINT, JSON.stringify({
              ownerId: session?.user?.id ?? null, savedAt: Date.now(), input,
              settings: { stake, opponentMode, proofWindow }, draft: draftState, turns: turns.slice(-16),
            }));
          } catch { /* OAuth remains usable when storage is unavailable. */ }
        }}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setAuthOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
