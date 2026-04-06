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
  const [success, setSuccess] = useState(false);

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
        setSuccess(true);
        onSuccess();
        setTimeout(() => {
          setSuccess(false);
          onClose();
        }, 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full px-4 py-3 rounded-xl text-sm font-medium text-text-primary placeholder:text-text-muted input-premium border border-border-subtle focus:border-accent focus:outline-none";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}
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
                boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(124,92,252,0.08)",
              }}
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Gradient top accent */}
              <div className="h-0.5" style={{ background: "linear-gradient(90deg, #7c5cfc, #00d4c8, #7c5cfc)", backgroundSize: "200% 100%", animation: "gradient-drift 4s linear infinite" }} />

              <div className="p-6">
                {/* Success overlay */}
                <AnimatePresence>
                  {success && (
                    <motion.div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl"
                      style={{ background: "rgba(13,13,30,0.98)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <motion.div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: "rgba(0,232,122,0.15)" }}
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 15, stiffness: 200 }}
                      >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#00e87a" strokeWidth="2.5" strokeLinecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </motion.div>
                      <p className="text-sm font-bold text-success">Welcome to ChallengeAI!</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Header with crossfade */}
                <div className="text-center mb-6">
                  <motion.div
                    className="inline-flex w-12 h-12 rounded-xl items-center justify-center mb-3 relative"
                    style={{ background: "linear-gradient(135deg, #7c5cfc, #00d4c8)", boxShadow: "0 0 24px rgba(124,92,252,0.3)" }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </motion.div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      <h2 className="text-lg font-extrabold text-text-primary">
                        {mode === "register" ? "Create Account" : "Welcome Back"}
                      </h2>
                      <p className="text-xs text-text-muted mt-1">
                        {mode === "register" ? "Join ChallengeAI — 10 seconds to start" : "Sign in to continue"}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Google Sign In */}
                <motion.button
                  type="button"
                  onClick={handleGoogleLogin}
                  whileHover={{ scale: 1.02, borderColor: "rgba(124,92,252,0.3)", background: "rgba(255,255,255,0.09)" }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-bold text-white mb-4 transition-colors"
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

                {/* Error with shake */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="animate-error-shake mb-4 px-3 py-2.5 rounded-xl text-xs font-bold"
                      style={{
                        background: "rgba(255,71,87,0.1)",
                        color: "#ff4757",
                        border: "1px solid rgba(255,71,87,0.2)",
                        borderLeft: "3px solid #ff4757",
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email"
                    required
                    className={inputClass}
                  />
                  {/* Username field with expand/collapse animation */}
                  <AnimatePresence>
                    {mode === "register" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                      >
                        <input
                          type="text"
                          value={username}
                          onChange={e => setUsername(e.target.value)}
                          placeholder="Username"
                          required
                          className={inputClass}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    minLength={6}
                    className={inputClass}
                  />

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={!loading ? { scale: 1.02, boxShadow: "0 6px 28px rgba(124,92,252,0.4)" } : {}}
                    whileTap={!loading ? { scale: 0.97 } : {}}
                    className="shimmer-btn w-full py-3.5 rounded-xl text-sm font-extrabold text-white disabled:opacity-60 transition-shadow"
                    style={{
                      background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                      boxShadow: "0 4px 20px rgba(124,92,252,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full inline-block"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        />
                        {mode === "register" ? "Creating..." : "Signing in..."}
                      </span>
                    ) : (
                      mode === "register" ? "Create Account" : "Sign In"
                    )}
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
