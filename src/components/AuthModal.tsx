"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AuthModal({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        redirect: false,
        email,
        password,
        username: mode === "register" ? username : undefined,
        action: mode,
      });

      if (res?.error) {
        setError(res.error === "CredentialsSignin" ? "Invalid credentials" : res.error);
      } else {
        onSuccess();
        onClose();
      }
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
              <div className="h-0.5 bg-gradient-to-r from-accent via-teal to-accent" />

              <div className="p-6">
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
                    {mode === "register" ? "Join ChallengeAI — 10 seconds to start" : "Sign in to continue"}
                  </p>
                </div>

                {/* Google Sign In */}
                <motion.button
                  type="button"
                  onClick={handleGoogleLogin}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-bold text-white mb-4"
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </motion.button>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>

                {error && (
                  <div className="mb-4 px-3 py-2 rounded-xl text-xs font-bold"
                       style={{ background: "rgba(255,71,87,0.1)", color: "#ff4757", border: "1px solid rgba(255,71,87,0.2)" }}>
                    {error}
                  </div>
                )}

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
