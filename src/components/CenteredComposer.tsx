"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "@/lib/api-client";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean;
}

type VoiceLang = "auto" | "en" | "zh";

export default function CenteredComposer({ onSubmit, isActive, isParsing }: Props) {
  const [input, setInput] = useState("");
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
    return undefined;
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

  return (
    <div className="w-full">
      <div
        style={{
          background: "#111110",
          border: `1px solid ${busy ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.1)"}`,
          borderRadius: "2px",
          transition: "border-color 0.3s",
        }}
      >
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isActive ? "Edit: e.g. \"$20 stake\" or \"video proof\"" : "I bet Benny's wife fails the DMV test — $10..."}
          rows={isActive ? 1 : 2}
          disabled={busy}
          className="w-full bg-transparent px-4 py-3 text-sm font-mono resize-none focus:outline-none"
          style={{ color: "#E5E0D8", caretColor: "#D4AF37" }}
        />

        <AnimatePresence>
          {interim && (
            <motion.div
              className="px-4 pb-2 text-xs font-mono italic"
              style={{ color: "#D4AF37", opacity: 0.6 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
            >
              {interim}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: "rgba(212,175,55,0.06)" }}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 mr-1">
              {(["auto", "en", "zh"] as const).map(lang => (
                <button
                  key={lang}
                  onClick={() => setVoiceLang(lang)}
                  disabled={listening || isTranscribing}
                  className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider transition-colors disabled:opacity-40"
                  style={{
                    color: voiceLang === lang ? "#D4AF37" : "#8b8b83",
                    background: voiceLang === lang ? "rgba(212,175,55,0.1)" : "transparent",
                    borderRadius: "1px",
                  }}
                >
                  {lang === "auto" ? "Auto" : lang === "en" ? "EN" : "中"}
                </button>
              ))}
            </div>

            <button
              onClick={() => { void toggleMic(); }}
              disabled={busy && !listening}
              className="flex items-center gap-1.5 px-2 py-1.5 transition-colors disabled:opacity-40"
              style={{
                color: listening ? "#A31F34" : "#8b8b83",
                background: listening ? "rgba(163,31,52,0.1)" : "transparent",
                borderRadius: "2px",
              }}
            >
              {isTranscribing ? (
                <>
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#D4AF37" }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-[10px] font-mono uppercase tracking-wider">Transcribing...</span>
                </>
              ) : listening ? (
                <>
                  <motion.div
                    className="w-2 h-2 rounded-full"
                    style={{ background: "#A31F34" }}
                    animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-[10px] font-mono uppercase tracking-wider">Recording...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                  <span className="text-[10px] font-mono uppercase tracking-wider">Mic</span>
                </>
              )}
            </button>
          </div>

          <button
            onClick={send}
            disabled={!input.trim() || busy}
            className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-30"
            style={{
              color: input.trim() && !busy ? "#0A0A0B" : "#8b8b83",
              background: input.trim() && !busy ? "#D4AF37" : "transparent",
              border: input.trim() && !busy ? "none" : "1px solid rgba(212,175,55,0.1)",
              borderRadius: "2px",
            }}
          >
            {busy ? "..." : isActive ? "Update" : "Send"}
          </button>
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
