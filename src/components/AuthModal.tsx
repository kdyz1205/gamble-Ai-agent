"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/* ── tiny inline SVG icons ── */
const EmailIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 1 0-16 0" />
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

/* ── animated loading dots ── */
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="inline-block w-1.5 h-1.5 rounded-full bg-white"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

export default function AuthModal({ open, onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((data: Record<string, { id?: string }>) => setGoogleEnabled(Boolean(data.google)))
      .catch(() => setGoogleEnabled(false));
  }, [open]);

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

  /* shared input wrapper style */
  const inputWrapperClass =
    "flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-medium bg-bg-input border border-border-subtle transition-all duration-200 focus-within:border-accent focus-within:shadow-[0_0_12px_rgba(124,92,252,0.2)]";

  const inputClass =
    "flex-1 bg-transparent text-text-primary placeholder:text-text-muted/50 focus:outline-none text-sm font-medium";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* center wrapper — scrollable on small screens */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* card */}
            <motion.div
              className="gradient-border-animated w-full max-w-sm rounded-2xl overflow-hidden shrink-0 my-auto"
              style={{
                background: "rgba(13,13,30,0.97)",
                boxShadow:
                  "0 24px 80px rgba(0,0,0,0.65), 0 0 80px rgba(124,92,252,0.1), 0 0 40px rgba(0,212,200,0.06)",
              }}
              initial={{ scale: 0.85, y: 30, filter: "blur(8px)" }}
              animate={{ scale: 1, y: 0, filter: "blur(0px)" }}
              exit={{ scale: 0.85, y: 30, filter: "blur(8px)", opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* top gradient line */}
              <div className="plasma-line h-0.5" />

              <div className="p-6">
                {/* ── header ── */}
                <div className="text-center mb-6">
                  {/* logo with orbiting dots */}
                  <div className="relative inline-flex items-center justify-center w-14 h-14 mb-3">
                    {/* orbit dot 1 */}
                    <div className="absolute w-full h-full animate-orbit pointer-events-none">
                      <div
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                        style={{
                          background: "#7c5cfc",
                          boxShadow: "0 0 8px 2px rgba(124,92,252,0.6)",
                        }}
                      />
                    </div>
                    {/* orbit dot 2 (reverse) */}
                    <div className="absolute w-full h-full animate-orbit-reverse pointer-events-none">
                      <div
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full"
                        style={{
                          background: "#00d4c8",
                          boxShadow: "0 0 8px 2px rgba(0,212,200,0.6)",
                        }}
                      />
                    </div>

                    {/* logo core */}
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: "linear-gradient(135deg, #7c5cfc, #00d4c8)",
                        boxShadow: "0 0 28px rgba(124,92,252,0.35)",
                      }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                  </div>

                  <h2 className="text-lg font-extrabold text-text-primary">
                    {mode === "register" ? "Create Account" : "Welcome Back"}
                  </h2>

                  {/* tagline with mount animation */}
                  <motion.p
                    key={mode}
                    className="text-xs text-text-muted mt-1"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  >
                    {mode === "register" ? "Join ChallengeAI — 10 seconds to start" : "Sign in to continue your journey"}
                  </motion.p>
                </div>

                {/* ── Google button ── */}
                {googleEnabled && (
                  <>
                    <motion.button
                      type="button"
                      onClick={handleGoogleLogin}
                      whileHover={{ scale: 1.02, boxShadow: "0 0 24px rgba(124,92,252,0.2)" }}
                      whileTap={{ scale: 0.98 }}
                      className="shimmer-btn w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-bold text-white mb-4 transition-shadow duration-300"
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.12)",
                      }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                      </svg>
                      Continue with Google
                    </motion.button>

                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                    </div>
                  </>
                )}

                {/* ── error ── */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-3 py-2 rounded-xl text-xs font-bold"
                    style={{
                      background: "rgba(255,71,87,0.1)",
                      color: "#ff4757",
                      border: "1px solid rgba(255,71,87,0.2)",
                    }}
                  >
                    {error}
                  </motion.div>
                )}

                {/* ── form ── */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  {/* email */}
                  <div className={inputWrapperClass}>
                    <EmailIcon />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      required
                      className={inputClass}
                    />
                  </div>

                  {/* username (register only) */}
                  <AnimatePresence>
                    {mode === "register" && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className={inputWrapperClass}>
                          <UserIcon />
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Pick a username"
                            required
                            className={inputClass}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* password */}
                  <div className={inputWrapperClass}>
                    <LockIcon />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (6+ characters)"
                      required
                      minLength={6}
                      className={inputClass}
                    />
                  </div>

                  {/* submit */}
                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={{ scale: 1.02, boxShadow: "0 0 32px rgba(124,92,252,0.45)" }}
                    whileTap={{ scale: 0.97 }}
                    className="energy-btn shimmer-btn w-full py-3 rounded-xl text-sm font-extrabold text-white disabled:opacity-50 transition-shadow duration-300"
                    style={{
                      background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)",
                      boxShadow: "0 4px 24px rgba(124,92,252,0.35)",
                    }}
                  >
                    {loading ? (
                      <LoadingDots />
                    ) : mode === "register" ? (
                      "Create Account"
                    ) : (
                      "Sign In"
                    )}
                  </motion.button>
                </form>

                {/* ── toggle link ── */}
                <div className="mt-5 text-center">
                  <button
                    onClick={() => {
                      setMode(mode === "register" ? "login" : "register");
                      setError("");
                    }}
                    className="text-xs font-medium text-text-muted transition-colors duration-200 hover:text-accent relative group"
                  >
                    {mode === "register"
                      ? "Already have an account? Sign in"
                      : "Don't have an account? Register"}
                    <span className="absolute left-0 -bottom-0.5 w-0 h-px bg-accent transition-all duration-300 group-hover:w-full" />
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
