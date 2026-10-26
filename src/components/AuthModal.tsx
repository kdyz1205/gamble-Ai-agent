"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { createPortal } from "react-dom";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onBeforeRedirect?: () => void;
  initialMode?: "login" | "register";
  returnTo?: string;
}

// Shared Summoners World storybook palette — also used by /enter and /app.
const NAVY = "var(--sum-ink)";
const NAVY_DIM = "var(--sum-muted)";
const NAVY_FAINT = "var(--sum-border)";
const PEACH = "var(--storybook-forest)";
const PEACH_HOVER = "#467b65";
const PEACH_TEXT = "#FFFFFF";
const MINT = "var(--sum-mint)";
const MINT_TEXT = "var(--storybook-forest)";
const PINK = "var(--storybook-blush)";
const ROSE_BG = "#fff0ed";
const ROSE_TEXT = "#94473E";

export default function AuthModal({ open, onClose, onSuccess, onBeforeRedirect, initialMode = "register", returnTo }: Props) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Reset transient state whenever modal closes so re-opening gives a clean slate
  // (fixes "modal closed but stuck" — old success/error/loading flags could keep
  // the overlay visible).
  useEffect(() => {
    if (!open) {
      setError("");
      setLoading(false);
      setSuccess(false);
      setWebviewWarning(false);
      setWebviewCopyNotice("");
    } else {
      setMode(initialMode);
    }
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open, onClose]);

  /**
   * Detect in-app webviews where Google blocks OAuth ("disallowed_useragent"
   * — Google's 2022+ policy to prevent OAuth token interception by embedded
   * browsers). Users who tapped the link from Messages / WeChat / Weibo /
   * Slack / Instagram / FB Messenger / Line / QQ / TikTok / a QR-code
   * preview get hit by this. The only real fix is to open the URL in the
   * actual OS browser.
   */
  const isBlockedWebview = (): boolean => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    // Classic in-app webview signatures
    if (/FB_IAB|FBAN|FBAV|Instagram|Line\/|MicroMessenger|QQBrowser|Weibo|Twitter|TikTok|Snapchat/i.test(ua)) return true;
    // iOS WKWebView — an app embeds Safari's engine but without the URL bar
    // Heuristic: iPhone/iPad + "AppleWebKit" but NO "Safari/" token means webview
    if (/(iPhone|iPad|iPod)/i.test(ua) && !/Safari\//i.test(ua)) return true;
    // Android Chrome WebView
    if (/\bwv\b/.test(ua)) return true;
    return false;
  };

  const [webviewWarning, setWebviewWarning] = useState(false);
  const [webviewCopyNotice, setWebviewCopyNotice] = useState("");

  const handleGoogleLogin = () => {
    // Guard: in-app webview → Google will reject with "disallowed_useragent".
    // Show a copy-the-link prompt instead of the normal flow so the user can
    // paste into real Safari / Chrome. We do NOT kick off signIn in this case.
    if (isBlockedWebview()) {
      setWebviewWarning(true);
      return;
    }

    // Before starting the OAuth flow, nuke any stale state/PKCE cookies from a
    // previously-abandoned attempt. Without this, if the user clicks Sign In,
    // closes the modal, then clicks again, NextAuth compares the new URL state
    // against a stale cookie and rejects the callback as "state mismatch".
    const staleCookies = [
      "next-auth.state",
      "__Secure-next-auth.state",
      "next-auth.pkce.code_verifier",
      "__Secure-next-auth.pkce.code_verifier",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
    ];
    for (const name of staleCookies) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
    onBeforeRedirect?.();
    const fromAuthPage = window.location.pathname.startsWith("/auth/");
    const fallback = fromAuthPage ? "/app/today" : `${window.location.pathname}${window.location.search}`;
    const callbackUrl = returnTo?.startsWith("/") && !returnTo.startsWith("//") && !returnTo.includes("\\")
      ? returnTo : fallback;
    signIn("google", { callbackUrl }, { prompt: "select_account" });
  };

  const copySiteLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setWebviewCopyNotice("Link copied. Open it in Safari or Chrome.");
    } catch {
      setWebviewCopyNotice("Copy this URL and open it in Safari or Chrome.");
    }
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
        }, 900);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 text-sm font-medium bg-white placeholder:text-slate-400 placeholder:font-normal focus:outline-none transition-colors";
  const inputStyle: React.CSSProperties = {
    color: NAVY,
    borderRadius: "16px",
    border: `1.5px solid ${NAVY_FAINT}`,
    caretColor: PEACH_HOVER,
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — soft sky blur, not dark tribunal */}
          <motion.div
            className="fixed inset-0 z-[1000]"
            style={{
              background: "rgba(39, 60, 56, 0.34)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto p-3 py-5 sm:p-6"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="auth-portal relative w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
              initial={{ scale: 0.92, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 24, opacity: 0 }}
              transition={{ type: "spring", damping: 22, stiffness: 400 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="summon-auth-title"
            >
              {/* Floating candy orbs in card bg */}
              <div
                className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-60 pointer-events-none"
                style={{ background: PINK, filter: "blur(24px)" }}
              />
              <div
                className="absolute -bottom-8 -left-6 w-32 h-32 rounded-full opacity-50 pointer-events-none"
                style={{ background: PEACH, filter: "blur(26px)" }}
              />

              <div className="relative p-6 sm:p-7">
                <button type="button" className="sum-auth-close" aria-label="Close sign-in" onClick={onClose}>×</button>
                {/* Success overlay */}
                <AnimatePresence>
                  {success && (
                    <motion.div
                      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
                      style={{
                        background: "rgba(255,253,250,0.96)",
                        backdropFilter: "blur(8px)",
                        borderRadius: "28px",
                      }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <motion.div
                        className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
                        style={{
                          background: MINT,
                          boxShadow: "0 8px 24px rgba(49,94,82,0.14)",
                        }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", damping: 14, stiffness: 260 }}
                      >
                        <PicoFamiliar className="h-20 w-20" mood="celebrate" />
                      </motion.div>
                      <p className="text-base font-bold" style={{ color: MINT_TEXT }}>
                        You&apos;re in! Your quest world is ready.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Header */}
                <div className="text-center mb-6">
                  <motion.div
                    className="inline-flex w-16 h-16 rounded-full items-center justify-center mb-3"
                    style={{
                      background: `linear-gradient(135deg, ${PEACH} 0%, ${PINK} 100%)`,
                      boxShadow: "0 4px 14px 0 rgba(251,146,60,0.39)",
                    }}
                    whileHover={{ scale: 1.06, rotate: -6 }}
                    animate={{ y: [0, -4, 0] }}
                    transition={{
                      y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
                    }}
                  >
                    <PicoFamiliar className="h-16 w-16" mood="guide" />
                  </motion.div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      <h2 id="summon-auth-title" className="text-2xl font-bold" style={{ color: NAVY }}>
                        {mode === "register" ? "Join Summoners World" : "Welcome back, Summoner"}
                      </h2>
                      <p className="text-sm mt-1.5" style={{ color: NAVY_DIM }}>
                        {mode === "register"
                          ? "Make your first quest a reality"
                          : "Pick up your next quest"}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* In-app webview warning — Google blocks OAuth here.
                    Appears only when the user tapped the link from Messages /
                    WeChat / Slack / Instagram / similar embedded browsers. */}
                {webviewWarning && (
                  <div className="mb-4 px-4 py-3 rounded-2xl text-xs font-semibold leading-relaxed"
                    style={{ background: ROSE_BG, color: ROSE_TEXT, border: `1px solid ${ROSE_TEXT}33` }}>
                    <p className="mb-2">
                      Google blocks sign-in from in-app browsers. Open this page in <b>Safari</b> or <b>Chrome</b> directly, or use email + password below.
                    </p>
                    <button
                      type="button"
                      onClick={copySiteLink}
                      className="px-3 py-1.5 text-[11px] font-black rounded-full active:scale-95 transition-transform"
                      style={{ color: ROSE_TEXT, background: "#FFFFFF", border: `1px solid ${ROSE_TEXT}` }}>
                      Copy link
                    </button>
                    {webviewCopyNotice && <p className="mt-2 text-xs">{webviewCopyNotice}</p>}
                  </div>
                )}

                {/* Google Sign In */}
                <motion.button
                  type="button"
                  onClick={handleGoogleLogin}
                  whileHover={{ scale: 1.02, background: "#F8FCF8" }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="w-full flex items-center justify-center gap-3 py-3 text-sm font-semibold mb-4"
                  style={{
                    color: NAVY,
                    background: "#FFFFFF",
                    border: `1.5px solid ${NAVY_FAINT}`,
                    borderRadius: "9999px",
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
                  <div className="flex-1 h-px" style={{ background: NAVY_FAINT }} />
                  <span className="text-xs font-medium" style={{ color: NAVY_DIM }}>
                    or
                  </span>
                  <div className="flex-1 h-px" style={{ background: NAVY_FAINT }} />
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      className="animate-error-shake mb-4 px-4 py-2.5 text-xs font-semibold"
                      style={{
                        background: ROSE_BG,
                        color: ROSE_TEXT,
                        borderRadius: "16px",
                      }}
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: NAVY_DIM }}>
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      required
                      className={inputClass}
                      style={inputStyle}
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
                          <label className="block text-xs font-semibold mb-1.5" style={{ color: NAVY_DIM }}>
                            Nickname
                          </label>
                          <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="What should we call you?"
                            required
                            className={inputClass}
                            style={inputStyle}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div>
                    <label className="block text-xs font-semibold mb-1.5" style={{ color: NAVY_DIM }}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      required
                      minLength={6}
                      className={inputClass}
                      style={inputStyle}
                    />
                  </div>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileHover={!loading ? { scale: 1.02 } : {}}
                    whileTap={!loading ? { scale: 0.96 } : {}}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className="w-full py-3.5 text-sm font-bold disabled:opacity-60 mt-2"
                    style={{
                      color: PEACH_TEXT,
                      background: PEACH,
                      borderRadius: "9999px",
                      boxShadow: "0 4px 14px 0 rgba(251,146,60,0.39)",
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <motion.span
                          className="w-4 h-4 rounded-full border-2 inline-block"
                          style={{
                            borderColor: `${PEACH_TEXT}40`,
                            borderTopColor: PEACH_TEXT,
                          }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                        />
                        {mode === "register" ? "Creating…" : "Signing in…"}
                      </span>
                    ) : mode === "register" ? (
                      "Enter the Quest World"
                    ) : (
                      "Sign In"
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
                    className="text-xs font-medium transition-colors"
                    style={{ color: NAVY_DIM }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = PEACH_TEXT)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = NAVY_DIM)}
                  >
                    {mode === "register"
                      ? "Already have an account? Sign in"
                      : "New here? Create an account"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
