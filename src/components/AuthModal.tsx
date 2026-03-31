"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { register, login } from "@/lib/api-client";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (user: { id: string; username: string; email: string }) => void;
}

export default function AuthModal({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await register(email, username, password);
        onSuccess(res.user);
      } else {
        const res = await login(email, password);
        onSuccess(res.user);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm rounded-2xl overflow-hidden"
              style={{
                background: "rgba(13,13,30,0.97)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 60px rgba(124,92,252,0.08)",
              }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Top accent */}
              <div className="h-0.5 bg-gradient-to-r from-accent via-teal to-accent" />

              <div className="p-6">
                {/* Header */}
                <div className="text-center mb-6">
                  <div className="inline-flex w-12 h-12 rounded-xl items-center justify-center mb-3"
                       style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)", boxShadow: "0 0 24px rgba(124,92,252,0.3)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-extrabold text-text-primary">
                    {mode === "register" ? "Create Account" : "Welcome Back"}
                  </h2>
                  <p className="text-xs text-text-muted mt-1">
                    {mode === "register" ? "Join ChallengeAI to create and accept challenges" : "Sign in to continue"}
                  </p>
                </div>

                {/* Error */}
                {error && (
                  <div className="mb-4 px-3 py-2 rounded-xl text-xs font-bold"
                       style={{ background: "rgba(255,71,87,0.1)", color: "#ff4757", border: "1px solid rgba(255,71,87,0.2)" }}>
                    {error}
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className="w-full px-4 py-3 rounded-xl text-sm font-medium text-text-primary placeholder:text-text-muted bg-bg-input border border-border-subtle focus:border-accent focus:outline-none transition-colors"
                  />
                  {mode === "register" && (
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      placeholder="Username"
                      required
                      className="w-full px-4 py-3 rounded-xl text-sm font-medium text-text-primary placeholder:text-text-muted bg-bg-input border border-border-subtle focus:border-accent focus:outline-none transition-colors"
                    />
                  )}
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    minLength={6}
                    className="w-full px-4 py-3 rounded-xl text-sm font-medium text-text-primary placeholder:text-text-muted bg-bg-input border border-border-subtle focus:border-accent focus:outline-none transition-colors"
                  />

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="shimmer-btn w-full py-3 rounded-xl text-sm font-extrabold text-white disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                      boxShadow: "0 4px 20px rgba(124,92,252,0.3)",
                    }}
                  >
                    {loading ? "..." : mode === "register" ? "Create Account" : "Sign In"}
                  </motion.button>
                </form>

                {/* Toggle mode */}
                <div className="mt-4 text-center">
                  <button
                    onClick={() => { setMode(mode === "register" ? "login" : "register"); setError(""); }}
                    className="text-xs font-medium text-text-muted hover:text-accent transition-colors"
                  >
                    {mode === "register" ? "Already have an account? Sign in" : "Don't have an account? Register"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
