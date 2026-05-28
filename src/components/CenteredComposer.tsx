"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";

type VoiceLang = "auto" | "en" | "zh";

interface Props {
  onSubmit: (message: string, languageMode: VoiceLang) => void;
  isActive: boolean;
  isParsing?: boolean;
  initialValue?: string;
  onQuotaChange?: (quota: api.DailyAiQuotaStatus) => void;
}

const LANGUAGE_OPTIONS: Array<{
  value: VoiceLang;
  shortLabel: string;
  label: string;
  status: string;
}> = [
  {
    value: "auto",
    shortLabel: "Auto",
    label: "Auto",
    status: "",
  },
  {
    value: "en",
    shortLabel: "English",
    label: "EN",
    status: "",
  },
  {
    value: "zh",
    shortLabel: "中文",
    label: "中文",
    status: "中文输出。",
  },
];

function detectTextLanguage(value: string): VoiceLang | null {
  if (/[\u3400-\u9FFF]/.test(value)) return "zh";
  if (/[A-Za-z]/.test(value)) return "en";
  return null;
}

function browserLanguagePrefersChinese() {
  if (typeof navigator === "undefined") return false;
  const languages = [navigator.language, ...(navigator.languages ?? [])]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());
  return languages.some((item) => item.startsWith("zh"));
}

function voiceMessageLanguage(mode: VoiceLang, text: string): VoiceLang {
  const detected = detectTextLanguage(text);
  if (detected) return detected;
  if (mode !== "auto") return mode;
  return browserLanguagePrefersChinese() ? "zh" : "en";
}

function normalizeVoiceTranscript(value: string) {
  const pushup = "\u4fef\u5367\u6491";
  return value
    .replace(/(\d+)\s*\u4e2a\s*push[\s-]*ups?\b/gi, `$1\u4e2a${pushup}`)
    .replace(/(\d+)\s*\u4e2a\s*push\s*up\b/gi, `$1\u4e2a${pushup}`)
    .replace(/(\d+)\s*\u4e2a\s*pose\b/gi, `$1\u4e2a${pushup}`)
    .replace(/(\d+)\s*\u4e2a\s*post\b/gi, `$1\u4e2a${pushup}`)
    .replace(/\bpush[\s-]*ups?\b/gi, pushup);
}

export default function CenteredComposer({ onSubmit, isActive, isParsing, initialValue, onQuotaChange }: Props) {
  const [input, setInput] = useState(initialValue || "");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("auto");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Kept only as a defensive cleanup handle for older browser-preview code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const latestInputRef = useRef("");
  const latestInterimRef = useRef("");

  const send = useCallback(() => {
    const v = input.trim();
    if (!v || isParsing || isTranscribing) return;
    onSubmit(v, voiceLang);
    setInput("");
    setInterim("");
    setVoiceError("");
  }, [input, isParsing, isTranscribing, onSubmit, voiceLang]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  useEffect(() => {
    latestInputRef.current = input;
  }, [input]);

  useEffect(() => {
    latestInterimRef.current = interim;
  }, [interim]);

  const getRecognitionLanguage = useCallback(() => {
    if (voiceLang === "en") return "en-US";
    if (voiceLang === "zh") return "zh-CN";
    const detected = detectTextLanguage(`${latestInputRef.current} ${latestInterimRef.current}`);
    if (detected === "zh") return "zh-CN";
    if (detected === "en") return "en-US";
    if (browserLanguagePrefersChinese()) return "zh-CN";
    // Auto is optimized for the product's common mixed prompt pattern:
    // Mandarin sentence + English name/action words ("Jerry", "push-up").
    // Explicit EN is still available for pure English dictation.
    return "zh-CN";
  }, [voiceLang]);

  const getLanguageHint = useCallback((): "en" | "zh" | undefined => {
    if (voiceLang === "en") return "en";
    if (voiceLang === "zh") return "zh";
    // Auto mode must not force the browser language. The user may speak Chinese
    // on an English browser, or mix Chinese and English in one prompt.
    return undefined;
  }, [voiceLang]);

  const stopPreviewRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognitionRef.current = null;
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Browser speech APIs throw if stop() races their own onend.
    }
  }, []);

  const stopRecorderOnly = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const stopAllTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const transcribeRecordedAudio = useCallback(async () => {
    const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm";
    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
    const previewText = `${latestInputRef.current} ${latestInterimRef.current}`.trim();

    if (!audioBlob.size && !previewText) {
      return;
    }

    setIsTranscribing(true);
    try {
      const result = await api.transcribeAudio(audioBlob, {
        languageHint: getLanguageHint(),
        previewText,
      });
      if (result.dailyQuota) onQuotaChange?.(result.dailyQuota);

      const finalText = normalizeVoiceTranscript(result.transcript || previewText).trim();
      if (finalText) {
        // Show in input box; let user review before submitting.
        setInput(finalText);
        setInterim("");
        if (result.usedFallback && result.error) {
          const messageLang = voiceMessageLanguage(voiceLang, finalText);
          setVoiceError(
            messageLang === "zh"
              ? "AI 转写暂时失败，现在用的是浏览器预览。请看一眼再发送。"
              : "AI transcription failed, so this is browser speech preview. Check it before sending.",
          );
        }
      } else if (result.error) {
        const messageLang = voiceMessageLanguage(voiceLang, previewText);
        setVoiceError(
          messageLang === "zh"
            ? "语音服务暂时不可用。请选择中文后再试，或直接输入文字。"
            : "Voice transcription is temporarily unavailable. Try again or type it.",
        );
      }
    } catch {
      // Fallback: use browser preview text
      if (previewText) {
        setInput(normalizeVoiceTranscript(previewText));
        setInterim("");
      }
    } finally {
      setIsTranscribing(false);
      audioChunksRef.current = [];
    }
  }, [getLanguageHint, onQuotaChange, voiceLang]);

  const startPreviewRecognition = useCallback(() => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    stopPreviewRecognition();
    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    const recognitionLanguage = getRecognitionLanguage();
    if (recognitionLanguage) recognition.lang = recognitionLanguage;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText) {
        const normalizedFinal = normalizeVoiceTranscript(finalText.trim());
        setInput(prev => prev ? `${prev.trimEnd()} ${normalizedFinal}` : normalizedFinal);
      }
      setInterim(normalizeVoiceTranscript(interimText.trim()));
    };

    recognition.onerror = () => {
      setInterim("");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [getRecognitionLanguage, stopPreviewRecognition]);

  const startRecording = useCallback(async () => {
    if (isParsing || isTranscribing) return;
    setVoiceError("");

    const hasMediaRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
    const hasGetUserMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

    if (!hasMediaRecorder || !hasGetUserMedia) {
      setVoiceError(voiceLang === "zh" ? "这个浏览器不支持语音录制。请直接输入文字。" : "This browser does not support voice recording. Type the challenge instead.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err instanceof DOMException && ["NotAllowedError", "SecurityError", "PermissionDeniedError"].includes(err.name);
      setListening(false);
      setVoiceError(
        denied
          ? voiceLang === "zh" ? "麦克风权限被拒绝。允许权限后再试，或直接输入文字。" : "Microphone permission was blocked. Allow it, or type the challenge instead."
          : err instanceof Error ? err.message : voiceLang === "zh" ? "无法开始录音。请直接输入文字。" : "Could not start recording. Type the challenge instead.",
      );
      return;
    }
    streamRef.current = stream;
    audioChunksRef.current = [];

    // CROSS-BROWSER MIME NEGOTIATION — this matters a lot for iOS Safari.
    //
    // iOS Safari's MediaRecorder does NOT support audio/webm (any variant).
    // Its native output is audio/mp4 (AAC). Previous code only tried webm and
    // silently failed on iPhone — which is exactly the "I said Chinese and
    // nothing came back" bug. Try in order of (desktop-preferred → mobile
    // Safari → progressive fallbacks) and stop at the first supported one.
    //
    // If NONE of our explicit candidates are supported we fall through to
    // `new MediaRecorder(stream)` with no mimeType, letting the browser pick
    // its default — which is always guaranteed to work if MediaRecorder
    // itself exists. We then read `recorder.mimeType` to know what format
    // we actually got, and forward that to the backend so OpenAI can decode.
    const MIME_CANDIDATES = [
      "audio/webm;codecs=opus",     // Chrome, Edge, Firefox (desktop + Android)
      "audio/ogg;codecs=opus",      // Firefox, older Chrome
      "audio/mp4;codecs=mp4a.40.2", // iOS Safari (AAC-LC)
      "audio/mp4",                  // iOS Safari fallback
      "audio/webm",                 // generic webm
      "audio/aac",                  // rare but worth trying
    ];
    const chosenMime = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));

    let recorder: MediaRecorder;
    try {
      recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);
    } catch {
      // Absolute last-resort: some browsers throw even when isTypeSupported
      // said yes. Retry with no options so we at least get default-encoded audio.
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setVoiceError(err instanceof Error ? err.message : voiceLang === "zh" ? "无法开始录音。请直接输入文字。" : "Could not start recording. Type the challenge instead.");
        return;
      }
    }
    mediaRecorderRef.current = recorder;
    if (typeof console !== "undefined") {
      console.log(`[mic] recording with mime=${recorder.mimeType || "(browser default)"}`);
    }

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setVoiceError(voiceLang === "zh" ? "录音中断了。请重新点麦克风再试一次。" : "Recording stopped unexpectedly. Tap Mic and try again.");
      setListening(false);
      stopPreviewRecognition();
      stopAllTracks();
    };

    recorder.onstop = async () => {
      stopPreviewRecognition();
      stopAllTracks();
      setListening(false);
      await transcribeRecordedAudio();
    };

    recorder.start();
    setListening(true);
    setInterim("");
    startPreviewRecognition();
  }, [isParsing, isTranscribing, startPreviewRecognition, stopAllTracks, stopPreviewRecognition, transcribeRecordedAudio, voiceLang]);

  const toggleMic = useCallback(async () => {
    if (listening) {
      stopPreviewRecognition();
      stopRecorderOnly();
      return;
    }

    await startRecording();
  }, [listening, startRecording, stopPreviewRecognition, stopRecorderOnly]);

  // Sync initialValue into input when it changes (e.g. "Edit input" brings back original text)
  useEffect(() => {
    if (initialValue !== undefined && initialValue !== input) {
      setInput(initialValue);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  useEffect(() => {
    if (!isActive && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      stopPreviewRecognition();
      stopRecorderOnly();
      stopAllTracks();
    };
  }, [stopAllTracks, stopPreviewRecognition, stopRecorderOnly]);

  const busy = Boolean(isParsing || isTranscribing || listening);

  // Axelrod canonical palette.
  const NAVY = "#1E293B";
  const NAVY_DIM = "#64748B";
  const NAVY_FAINT = "rgba(148,163,184,0.28)";
  const PEACH = "#FED7AA";       // orange-200 CTA
  const PEACH_DARK = "#FDBA74";  // orange-300 hover
  const PEACH_TEXT = "#7C2D12";  // orange-900 text on peach
  const ORANGE_GLOW = "rgba(251,146,60,0.39)";
  const MINT = "#A7F3D0";        // mint-200
  const ROSE = "#FECACA";        // red-200 (gentle)
  const canSend = Boolean(input.trim() && !busy);
  const selectedLanguage = LANGUAGE_OPTIONS.find(option => option.value === voiceLang) ?? LANGUAGE_OPTIONS[0];

  return (
    <div className="w-full">
      <div
        style={{
          background: "rgba(255,255,255,0.86)",
          border: `1px solid ${busy ? PEACH : NAVY_FAINT}`,
          borderRadius: "28px",
          boxShadow: busy
            ? `0 4px 14px 0 ${ORANGE_GLOW}`
            : `0 26px 80px rgba(15,23,42,0.09)`,
          transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
          backdropFilter: "blur(18px)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isActive ? "Tweak it: \"$20 stake\" or \"video proof\"" : "Challenge Alex: I can do 20 pushups in one minute..."}
          rows={isActive ? 1 : 2}
          disabled={busy}
          className="w-full bg-transparent px-5 py-5 text-lg font-semibold resize-none focus:outline-none placeholder:font-normal"
          style={{ color: NAVY, caretColor: PEACH }}
        />

        <AnimatePresence>
          {interim && (
            <motion.div
              className="px-5 pb-2 text-sm italic"
              style={{ color: PEACH_DARK }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              exit={{ opacity: 0 }}
            >
              {interim}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between px-3 py-3 border-t" style={{ borderColor: NAVY_FAINT }}>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1" aria-label="Language mode">
              {LANGUAGE_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => setVoiceLang(option.value)}
                  disabled={listening || isTranscribing}
                  className="px-2.5 py-1 text-[11px] font-black transition-all disabled:opacity-40"
                  style={{
                    color: voiceLang === option.value ? PEACH_TEXT : NAVY_DIM,
                    background: voiceLang === option.value ? PEACH : "transparent",
                    borderRadius: "999px",
                  }}
                  title={option.status}
                  aria-pressed={voiceLang === option.value}
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => { void toggleMic(); }}
              disabled={busy && !listening}
              className="flex items-center gap-1.5 px-3 py-1.5 transition-all disabled:opacity-40 active:scale-95"
              style={{
                color: listening ? "#FFFFFF" : isTranscribing ? "#FFFFFF" : NAVY,
                background: listening ? ROSE : isTranscribing ? MINT : "transparent",
                borderRadius: "999px",
              }}
            >
              {isTranscribing ? (
                <>
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#FFFFFF" }}
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs font-bold">Transcribing</span>
                </>
              ) : listening ? (
                <>
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#FFFFFF" }}
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs font-bold">Recording</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <span className="text-xs font-bold">Mic</span>
                </>
              )}
            </button>
          </div>

          <motion.button
            onClick={send}
            disabled={!canSend}
            whileTap={canSend ? { scale: 0.94 } : undefined}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="px-7 py-2.5 text-sm font-black transition-all disabled:opacity-40"
            style={{
              color: canSend ? PEACH_TEXT : NAVY_DIM,
              background: canSend ? PEACH : NAVY_FAINT,
              borderRadius: "9999px",
              boxShadow: canSend ? `0 4px 14px 0 ${ORANGE_GLOW}` : "none",
            }}
          >
            {busy ? "..." : isActive ? "Update" : "Send"}
          </motion.button>
        </div>
      </div>
      {selectedLanguage.status && (
        <p className="mt-2 px-1 text-xs font-semibold" style={{ color: NAVY_DIM }}>
          {selectedLanguage.status}
        </p>
      )}
      {voiceError && (
        <p className="mt-2 rounded-xl px-3 py-2 text-xs font-bold" style={{ color: "#991B1B", background: "#FECACA" }}>
          {voiceError}
        </p>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}
