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

  const inputClass =
    "w-full px-4 py-3 rounded-md text-sm font-mono tracking-wide bg-[#111113] text-[#E5E0D8] placeholder:text-[#8b8b83] border border-[#D4AF37]/20 focus:border-[#D4AF37]/60 focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30 transition-colors";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-50"
            style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
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
              className="w-full max-w-sm rounded-lg overflow-hidden relative"
              style={{
                background: "#0A0A0B",
                border: "1px solid rgba(212,175,55,0.18)",
                boxShadow:
                  "0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(212,175,55,0.06), inset 0 1px 0 rgba(212,175,55,0.08)",
              }}
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Gold gradient top accent */}
              <div
                className="h-[2px]"
                style={{
                  background:
                    "linear-gradient(90deg, transparent, #D4AF37, #C5993A, #D4AF37, transparent)",
                }}
              />

              <div className="p-6">
                {/* Success overlay */}
                <AnimatePresence>
                  {success && (
                    <motion.div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-lg"
                      style={{ background: "rgba(10,10,11,0.98)" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <motion.div
                        className="w-16 h-16 rounded-lg flex items-center justify-center mb-4"
                        style={{
                          background: "rgba(212,175,55,0.1)",
                          border: "1px solid rgba(212,175,55,0.25)",
                        }}
                        initial={{ scale: 0, rotate: -45 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: "spring", damping: 15, stiffness: 200 }}
                      >
                        <span className="text-3xl">&#9878;</span>
                      </motion.div>
                      <p className="text-sm font-serif font-bold text-[#D4AF37]">
                        The Tribunal recognizes you.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Header */}
                <div className="text-center mb-6">
                  <motion.div
                    className="inline-flex w-14 h-14 rounded-lg items-center justify-center mb-3 relative"
                    style={{
                      background:
                        "radial-gradient(ellipse at center, rgba(212,175,55,0.12) 0%, rgba(10,10,11,0.9) 70%)",
                      border: "1px solid rgba(212,175,55,0.25)",
                      boxShadow: "0 0 20px rgba(212,175,55,0.1)",
                    }}
                    whileHover={{ scale: 1.05 }}
                  >
                    <span className="text-2xl" style={{ color: "#D4AF37" }}>
                      &#9878;
                    </span>
                  </motion.div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      <h2 className="text-lg font-serif font-bold text-[#E5E0D8] tracking-wide">
                        {mode === "register"
                          ? "Enter the Tribunal"
                          : "Return to the Tribunal"}
                      </h2>
                      <p className="text-xs font-mono text-[#8b8b83] mt-1.5 tracking-wider uppercase">
                        {mode === "register"
                          ? "Lex Divina awaits your challenge"
                          : "Your seat at the bench remains"}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Google Sign In */}
                <motion.button
                  type="button"
                  onClick={handleGoogleLogin}
                  whileHover={{
                    scale: 1.02,
                    borderColor: "rgba(212,175,55,0.4)",
                    background: "rgba(212,175,55,0.06)",
                  }}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-3 py-3 rounded-md text-sm font-mono font-bold text-[#E5E0D8] mb-4 transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(212,175,55,0.15)",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                  Continue with Google
                </motion.button>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex-1 h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(212,175,55,0.2), transparent)",
                    }}
                  />
                  <span className="text-[10px] font-mono font-bold text-[#8b8b83] uppercase tracking-widest">
                    or
                  </span>
                  <div
                    className="flex-1 h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent, rgba(212,175,55,0.2), transparent)",
                    }}
                  />
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="animate-error-shake mb-4 px-3 py-2.5 rounded-md text-xs font-mono font-bold"
                      style={{
                        background: "rgba(163,31,52,0.1)",
                        color: "#A31F34",
                        border: "1px solid rgba(163,31,52,0.2)",
                        borderLeft: "3px solid #A31F34",
                      }}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#8b8b83] mb-1.5">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="advocate@tribunal.law"
                      required
                      className={inputClass}
                    />
                  </div>

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
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-widest text-[#8b8b83] mb-1.5">
                            Title
                          </label>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Your chosen name"
                            required
                            className={inputClass}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-widest text-[#8b8b83] mb-1.5">
                      Passphrase
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Your sealed word"
                      required
                      minLength={6}
                      className={inputClass}
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={
                      !loading
                        ? {
                            scale: 1.02,
                            boxShadow:
                              "0 6px 28px rgba(212,175,55,0.25), inset 0 1px 0 rgba(212,175,55,0.2)",
                          }
                        : {}
                    }
                    whileTap={!loading ? { scale: 0.97 } : {}}
                    className="w-full py-3.5 rounded-md text-sm font-serif font-bold text-[#0A0A0B] disabled:opacity-60 transition-shadow tracking-wide"
                    style={{
                      background:
                        "linear-gradient(135deg, #D4AF37, #B8963A, #D4AF37)",
                      boxShadow:
                        "0 4px 20px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          className="w-4 h-4 border-2 border-[#0A0A0B]/30 border-t-[#0A0A0B] rounded-full inline-block"
                          animate={{ rotate: 360 }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        />
                        {mode === "register" ? "Sealing..." : "Entering..."}
                      </span>
                    ) : mode === "register" ? (
                      "Seal Your Oath"
                    ) : (
                      "Enter"
                    )}
                  </motion.button>
                </form>

                {/* Toggle mode */}
                <div className="mt-5 text-center">
                  <button
                    onClick={() => {
                      setMode(mode === "register" ? "login" : "register");
                      setError("");
                    }}
                    className="text-xs font-mono text-[#8b8b83] hover:text-[#D4AF37] transition-colors tracking-wide"
                  >
                    {mode === "register"
                      ? "Already sworn in? Return to the Tribunal"
                      : "No oath yet? Enter the Tribunal"}
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
