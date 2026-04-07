"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AudioRecorder } from "@/lib/audio-recorder";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean;
}

type MicState = "idle" | "recording" | "transcribing";

export default function CenteredComposer({ onSubmit, isActive, isParsing }: Props) {
  const [input, setInput] = useState("");
  const [micState, setMicState] = useState<MicState>("idle");
  const [interim, setInterim] = useState("");
  const [voiceLang, setVoiceLang] = useState<"auto" | "en" | "zh">("auto");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browserRecognitionRef = useRef<any>(null);

  const send = useCallback(() => {
    const v = input.trim();
    if (!v || isParsing) return;
    onSubmit(v);
    setInput("");
  }, [input, isParsing, onSubmit]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* ── Dual-track voice: browser preview + server transcribe ── */
  const startRecording = useCallback(async () => {
    if (micState !== "idle") return;

    // Track A: Browser SpeechRecognition for real-time preview
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      const recognition = new SR();
      recognition.continuous = true;
      recognition.interimResults = true;
      const langMap = { auto: navigator.language || "en-US", en: "en-US", zh: "zh-CN" };
      recognition.lang = langMap[voiceLang];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interimText = "";
        for (let i = 0; i < event.results.length; i++) {
          if (!event.results[i].isFinal) {
            interimText += event.results[i][0].transcript;
          }
        }
        setInterim(interimText);
      };
      recognition.onerror = () => {};
      recognition.start();
      browserRecognitionRef.current = recognition;
    }

    // Track B: Real audio recording for server-side transcription
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setMicState("recording");
    } catch {
      setMicState("idle");
      alert("Could not access microphone.");
    }
  }, [micState, voiceLang]);

  const stopRecording = useCallback(async () => {
    if (micState !== "recording") return;

    // Stop browser preview
    if (browserRecognitionRef.current) {
      browserRecognitionRef.current.stop();
      browserRecognitionRef.current = null;
    }
    setInterim("");
    setMicState("transcribing");

    // Stop recording and get audio blob
    const recorder = recorderRef.current;
    if (!recorder) { setMicState("idle"); return; }

    const audioBlob = await recorder.stop();
    recorderRef.current = null;

    // Upload to server for high-quality transcription
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");
      formData.append("lang", voiceLang);

      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await res.json();

      if (data.transcript) {
        // Server transcript overrides everything
        setInput(data.transcript);
        setMicState("idle");
        // Auto-submit the high-quality transcript
        onSubmit(data.transcript);
      } else {
        // Fallback: use whatever browser captured
        setMicState("idle");
      }
    } catch {
      // Network error — keep whatever text was in input
      setMicState("idle");
    }
  }, [micState, voiceLang, onSubmit]);

  const toggleMic = useCallback(() => {
    if (micState === "idle") {
      startRecording();
    } else if (micState === "recording") {
      stopRecording();
    }
  }, [micState, startRecording, stopRecording]);

  // Focus input on idle mount
  useEffect(() => {
    if (!isActive && textareaRef.current) textareaRef.current.focus();
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.cancel();
      browserRecognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className="w-full">
      <div
        style={{
          background: "#111110",
          border: `1px solid ${micState === "recording" ? "rgba(163,31,52,0.4)" : isParsing ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.1)"}`,
          borderRadius: "2px",
          transition: "border-color 0.3s",
        }}
      >
        {/* Recording indicator */}
        <AnimatePresence>
          {micState === "recording" && (
            <motion.div
              className="flex items-center gap-2 px-4 py-2 border-b"
              style={{ borderColor: "rgba(163,31,52,0.2)", background: "rgba(163,31,52,0.04)" }}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
            >
              <motion.div
                className="w-2 h-2 rounded-full"
                style={{ background: "#A31F34" }}
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#A31F34" }}>
                Recording — tap mic to finish
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Transcribing state */}
        <AnimatePresence>
          {micState === "transcribing" && (
            <motion.div
              className="flex items-center gap-2 px-4 py-2 border-b"
              style={{ borderColor: "rgba(212,175,55,0.15)", background: "rgba(212,175,55,0.04)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="w-3 h-3 rounded-full border border-t-transparent"
                style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
              />
              <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#D4AF37" }}>
                Transcribing with AI...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isActive ? "Edit: \"$20 stake\" or \"video proof\"" : "I bet Benny's wife fails the DMV test — $10..."}
          rows={isActive ? 1 : 2}
          disabled={isParsing || micState === "transcribing"}
          className="w-full bg-transparent px-4 py-3 text-sm font-mono resize-none focus:outline-none"
          style={{ color: "#E5E0D8", caretColor: "#D4AF37" }}
        />

        {/* Live preview from browser recognition */}
        <AnimatePresence>
          {interim && (
            <motion.div
              className="px-4 pb-2 text-xs font-mono italic"
              style={{ color: "#D4AF37", opacity: 0.5 }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
            >
              {interim}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: "rgba(212,175,55,0.06)" }}>
          <div className="flex items-center gap-1">
            {/* Language toggle */}
            {(["auto", "en", "zh"] as const).map(lang => (
              <button
                key={lang}
                onClick={() => setVoiceLang(lang)}
                className="px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider transition-colors"
                style={{
                  color: voiceLang === lang ? "#D4AF37" : "#8b8b83",
                  background: voiceLang === lang ? "rgba(212,175,55,0.1)" : "transparent",
                  borderRadius: "1px",
                }}
              >
                {lang === "auto" ? "Auto" : lang === "en" ? "EN" : "中"}
              </button>
            ))}

            <div className="w-px h-3 mx-1" style={{ background: "rgba(212,175,55,0.1)" }} />

            {/* Mic button */}
            <button
              onClick={toggleMic}
              disabled={micState === "transcribing"}
              className="flex items-center gap-1.5 px-2 py-1.5 transition-colors disabled:opacity-40"
              style={{
                color: micState === "recording" ? "#A31F34" : "#8b8b83",
                background: micState === "recording" ? "rgba(163,31,52,0.1)" : "transparent",
                borderRadius: "2px",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span className="text-[10px] font-mono uppercase tracking-wider">
                {micState === "recording" ? "Stop" : micState === "transcribing" ? "..." : "Mic"}
              </span>
            </button>
          </div>

          {/* Send */}
          <button
            onClick={send}
            disabled={!input.trim() || isParsing || micState !== "idle"}
            className="px-4 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all disabled:opacity-30"
            style={{
              color: input.trim() ? "#0A0A0B" : "#8b8b83",
              background: input.trim() ? "#D4AF37" : "transparent",
              border: input.trim() ? "none" : "1px solid rgba(212,175,55,0.1)",
              borderRadius: "2px",
            }}
          >
            {isParsing ? "..." : isActive ? "Update" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
