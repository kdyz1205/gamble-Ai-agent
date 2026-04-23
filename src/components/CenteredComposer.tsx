"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean;
  initialValue?: string;
}

type VoiceLang = "auto" | "en" | "zh";

export default function CenteredComposer({ onSubmit, isActive, isParsing, initialValue }: Props) {
  const [input, setInput] = useState(initialValue || "");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [voiceLang, setVoiceLang] = useState<VoiceLang>("auto");
  const [isTranscribing, setIsTranscribing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
    onSubmit(v);
    setInput("");
    setInterim("");
  }, [input, isParsing, isTranscribing, onSubmit]);

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
    return navigator.language || "en-US";
  }, [voiceLang]);

  const getLanguageHint = useCallback((): "en" | "zh" | undefined => {
    if (voiceLang === "en") return "en";
    if (voiceLang === "zh") return "zh";
    // Auto mode — peek at the browser/device language. A user whose phone is
    // set to zh-CN / zh-TW / zh-HK almost certainly wants Chinese transcription.
    // Without this hint Whisper sometimes defaulted to English on short / noisy
    // clips, producing empty or garbled transcripts.
    if (typeof navigator !== "undefined") {
      const nav = navigator.language?.toLowerCase() || "";
      if (nav.startsWith("zh")) return "zh";
      if (nav.startsWith("en")) return "en";
    }
    return undefined; // let Whisper auto-detect
  }, [voiceLang]);

  const stopPreviewRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
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

      const finalText = (result.transcript || previewText).trim();
      if (finalText) {
        // Show in input box — let user review before submitting
        setInput(finalText);
        setInterim("");
      }
    } catch {
      // Fallback: use browser preview text
      if (previewText) {
        setInput(previewText);
        setInterim("");
      }
    } finally {
      setIsTranscribing(false);
      audioChunksRef.current = [];
    }
  }, [getLanguageHint, onSubmit]);

  const startPreviewRecognition = useCallback(() => {
    const RecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = getRecognitionLanguage();

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
        setInput(prev => prev ? `${prev.trimEnd()} ${finalText.trim()}` : finalText.trim());
      }
      setInterim(interimText.trim());
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
  }, [getRecognitionLanguage]);

  const startRecording = useCallback(async () => {
    if (isParsing || isTranscribing) return;

    const hasMediaRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
    const hasGetUserMedia = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

    if (!hasMediaRecorder || !hasGetUserMedia) {
      alert("当前浏览器不支持录音。");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    audioChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
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
  }, [isParsing, isTranscribing, startPreviewRecognition, stopAllTracks, stopPreviewRecognition, transcribeRecordedAudio]);

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

  const busy = Boolean(isParsing || isTranscribing);

  // LuckyPlay canonical palette — see project_luckyplay_design_system memory
  const NAVY = "#1E293B";
  const NAVY_DIM = "#64748B";
  const NAVY_FAINT = "#E2E8F0";
  const PEACH = "#FED7AA";       // orange-200 CTA
  const PEACH_DARK = "#FDBA74";  // orange-300 hover
  const PEACH_TEXT = "#7C2D12";  // orange-900 text on peach
  const ORANGE_GLOW = "rgba(251,146,60,0.39)";
  const MINT = "#A7F3D0";        // mint-200
  const ROSE = "#FECACA";        // red-200 (gentle)
  const canSend = Boolean(input.trim() && !busy);

  return (
    <div className="w-full">
      <div
        style={{
          background: "#FFFFFF",
          border: `2px solid ${busy ? PEACH : NAVY_FAINT}`,
          borderRadius: "24px",
          boxShadow: busy
            ? `0 4px 14px 0 ${ORANGE_GLOW}`
            : `0 8px 30px rgba(15,23,42,0.04)`,
          transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isActive ? "✏️ tweak it: \"$20 stake\" or \"video proof\"" : "🎲 I bet Benny's wife fails the DMV test — $10..."}
          rows={isActive ? 1 : 2}
          disabled={busy}
          className="w-full bg-transparent px-5 py-4 text-base font-semibold resize-none focus:outline-none placeholder:font-normal"
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

        <div className="flex items-center justify-between px-3 py-2.5 border-t" style={{ borderColor: NAVY_FAINT }}>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              {(["auto", "en", "zh"] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setVoiceLang(lang)}
                  disabled={listening || isTranscribing}
                  className="px-2.5 py-1 text-[11px] font-bold uppercase transition-all disabled:opacity-40"
                  style={{
                    color: voiceLang === lang ? "#FFFFFF" : NAVY_DIM,
                    background: voiceLang === lang ? PEACH : "transparent",
                    borderRadius: "999px",
                  }}
                >
                  {lang === "auto" ? "Auto" : lang === "en" ? "EN" : "中"}
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
                  <span className="text-xs font-bold">Listening…</span>
                </>
              ) : listening ? (
                <>
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#FFFFFF" }}
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs font-bold">Recording!</span>
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
            className="px-6 py-2 text-sm font-bold transition-all disabled:opacity-40"
            style={{
              color: canSend ? PEACH_TEXT : NAVY_DIM,
              background: canSend ? PEACH : NAVY_FAINT,
              borderRadius: "9999px",
              boxShadow: canSend ? `0 4px 14px 0 ${ORANGE_GLOW}` : "none",
            }}
          >
            {busy ? "…" : isActive ? "Update ✨" : "Send 🚀"}
          </motion.button>
        </div>
      </div>
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
