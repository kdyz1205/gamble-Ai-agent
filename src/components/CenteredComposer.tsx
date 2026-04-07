"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  onSubmit: (message: string) => void;
  isActive: boolean;
  isParsing?: boolean;
}

export default function CenteredComposer({ onSubmit, isActive, isParsing }: Props) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const send = useCallback(() => {
    const v = input.trim();
    if (!v || isParsing) return;
    onSubmit(v);
    setInput("");
  }, [input, isParsing, onSubmit]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* ── Voice input via browser SpeechRecognition ── */
  const toggleMic = useCallback(() => {
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let final = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interimText += event.results[i][0].transcript;
        }
      }
      if (final) {
        setInput(prev => prev + final);
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
      // Auto-submit if we got text
      if (textareaRef.current && textareaRef.current.value.trim()) {
        // Don't auto-submit, let user review
      }
    };

    recognition.onerror = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }, [listening]);

  // Focus input on mount (idle)
  useEffect(() => {
    if (!isActive && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isActive]);

  return (
    <div className="w-full">
      {/* Input card */}
      <div
        style={{
          background: "#111110",
          border: `1px solid ${isParsing ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.1)"}`,
          borderRadius: "2px",
          transition: "border-color 0.3s",
        }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={isActive ? "Edit: e.g. \"$20 stake\" or \"video proof\"" : "I bet Benny's wife fails the DMV test — $10..."}
          rows={isActive ? 1 : 2}
          disabled={isParsing}
          className="w-full bg-transparent px-4 py-3 text-sm font-mono resize-none focus:outline-none"
          style={{ color: "#E5E0D8", caretColor: "#D4AF37" }}
        />

        {/* Interim speech */}
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

        {/* Bottom bar: mic + send */}
        <div className="flex items-center justify-between px-3 py-2 border-t" style={{ borderColor: "rgba(212,175,55,0.06)" }}>
          {/* Mic button */}
          <button
            onClick={toggleMic}
            className="flex items-center gap-1.5 px-2 py-1.5 transition-colors"
            style={{
              color: listening ? "#A31F34" : "#8b8b83",
              background: listening ? "rgba(163,31,52,0.1)" : "transparent",
              borderRadius: "2px",
            }}
          >
            {listening ? (
              <>
                <motion.div
                  className="w-2 h-2 rounded-full"
                  style={{ background: "#A31F34" }}
                  animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
                <span className="text-[10px] font-mono uppercase tracking-wider">Listening...</span>
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

          {/* Send */}
          <button
            onClick={send}
            disabled={!input.trim() || isParsing}
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
