"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import CenteredComposer from "@/components/CenteredComposer";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { compileMarket, type MarketDraft, type Clarification, type CompileResult } from "@/lib/market-compiler";

type AppState = "idle" | "compiling" | "drafting" | "publishing" | "live";

export default function Home() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;
  const user = rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined;

  const [appState, setAppState] = useState<AppState>("idle");
  const [userInput, setUserInput] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [draft, setDraft] = useState<MarketDraft | null>(null);
  const [nextQuestion, setNextQuestion] = useState<Clarification | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  /* ── Compile: natural language → market draft ── */
  const handleSubmit = useCallback(async (input: string) => {
    setUserInput(input);
    setError(null);
    setAppState("compiling");

    // First: local compile (instant)
    const result: CompileResult = compileMarket(input);

    if (result.level === "ordinary_chat") {
      setUnderstanding(result.understanding);
      setAppState("idle");
      return;
    }

    // Try API parse for better results if logged in
    if (user && result.draft) {
      try {
        const res = await api.parseChallenge(input);
        if (res.parsed) {
          // Merge API results into local draft (API is smarter for title/rules)
          result.draft.title = res.parsed.title || result.draft.title;
          result.draft.rules = res.parsed.rules || result.draft.rules;
          result.draft.type = res.parsed.type || result.draft.type;
          if (res.parsed.deadline) result.draft.deadline = res.parsed.deadline;
        }
      } catch {
        // Local compile is fine as fallback
      }
    }

    setDraft(result.draft);
    setUnderstanding(result.understanding);
    setNextQuestion(result.nextQuestion);
    setAppState("drafting");
  }, [user]);

  /* ── Apply clarification answer → patch draft ── */
  const handleClarificationAnswer = useCallback((patch: Partial<MarketDraft>) => {
    if (!draft) return;
    const updated = { ...draft, ...patch };
    setDraft(updated);

    // Recompile to find next missing field
    const result = compileMarket(userInput);
    // Apply the patch to the recompiled result too
    if (result.draft) {
      const merged = { ...result.draft, ...updated };
      const remaining = result.allClarifications.filter(c => {
        if (c.field === "stake" && merged.stake > 0) return false;
        if (c.field === "evidenceType" && merged.evidenceType !== "unset") return false;
        if (c.field === "deadline" && merged.eventTime) return false;
        return true;
      });
      setNextQuestion(remaining[0] || null);

      // Update understanding
      const parts = [`**${merged.marketType.replace(/_/g, " ")}**`, `→ "${merged.proposition}"`];
      if (merged.stake > 0) parts.push(`| ${merged.stake} credits`);
      if (merged.eventTime) parts.push(`| by ${merged.eventTime}`);
      if (merged.evidenceType !== "unset") parts.push(`| ${merged.evidenceType.toLowerCase()}`);
      setUnderstanding(remaining.length === 0
        ? `Ready to publish: ${parts.join(" ")}`
        : `${parts.join(" ")} — still need: ${remaining.map(c => c.field).join(", ")}`
      );
    }
  }, [draft, userInput]);

  /* ── Publish ── */
  const handlePublish = useCallback(async (editedDraft?: ChallengeDraft) => {
    if (!user) { setShowAuth(true); return; }

    // Use the MarketDraft (draft state) as primary, editedDraft for title changes from DraftPanel
    const d = draft;
    if (!d) return;
    if (editedDraft) {
      d.title = editedDraft.title;
      d.stake = editedDraft.stake;
    }

    setAppState("publishing");
    setError(null);

    try {
      const evidence = d.evidenceType === "unset" ? "self_report" : d.evidenceType.toLowerCase().replace(/ /g, "_");
      const res = await api.createChallenge({
        title: d.title,
        type: d.type || "General",
        stake: d.stake || 0,
        deadline: d.deadline || "24 hours",
        rules: d.rules || d.title,
        evidenceType: evidence,
        aiReview: true,
        isPublic: d.isPublic || false,
      });
      // Redirect to the market's permanent home
      router.push(`/market/${res.challenge.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
      setAppState("drafting");
    }
  }, [draft, user]);

  const copyLink = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

  const reset = useCallback(() => {
    setAppState("idle"); setUserInput(""); setUnderstanding("");
    setDraft(null); setNextQuestion(null); setShareLink(null);
    setCopied(false); setError(null);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col" style={{ background: "#0A0A0B" }}
         onClick={() => showProfile && setShowProfile(false)}>
      {/* Ambient */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.03] blur-[150px]" style={{ background: "#D4AF37" }} />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full opacity-[0.02] blur-[120px]" style={{ background: "#005F6F" }} />
      </div>

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <button onClick={reset} className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>
          Lex Divina
        </button>
        <div className="flex items-center gap-3">
          {appState !== "idle" && (
            <button onClick={reset} className="text-[10px] font-mono tracking-wider uppercase" style={{ color: "#8b8b83" }}>New</button>
          )}
          {user ? (
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
                className="flex items-center gap-2 px-2.5 py-1.5 border"
                style={{ background: "rgba(212,175,55,0.04)", borderColor: "rgba(212,175,55,0.12)", borderRadius: "2px" }}>
                <span className="w-5 h-5 flex items-center justify-center text-[9px] font-serif font-bold"
                  style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37", borderRadius: "2px" }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-mono" style={{ color: "#8b8b83" }}>{user.username}</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: "#D4AF37" }}>{user.credits ?? 0}</span>
              </button>
              <AnimatePresence>
                {showProfile && (
                  <motion.div className="absolute top-full right-0 mt-1 w-48 z-50"
                    style={{ background: "#0E0E0C", border: "1px solid rgba(212,175,55,0.12)", borderRadius: "2px", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
                      <p className="text-xs font-serif font-bold" style={{ color: "#E5E0D8" }}>{user.username}</p>
                      <p className="text-[9px] font-mono" style={{ color: "#8b8b83" }}>{user.email || ""}</p>
                    </div>
                    <div className="p-2 space-y-1">
                      <button onClick={() => { setShowProfile(false); router.push("/markets"); }}
                        className="w-full text-left px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider hover:text-[#D4AF37] transition-colors"
                        style={{ color: "#8b8b83" }}>My Markets</button>
                      <button onClick={() => { setShowProfile(false); signOut(); reset(); }}
                        className="w-full text-left px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider hover:text-[#A31F34] transition-colors"
                        style={{ color: "#8b8b83" }}>Sign Out</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider"
              style={{ color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "2px" }}>Sign In</button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-lg">

          {/* ── IDLE ── */}
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <p className="text-center font-serif text-2xl mb-1" style={{ color: "#E5E0D8" }}>Say the bet.</p>
              <p className="text-center text-xs font-mono mb-4" style={{ color: "#8b8b83" }}>We&apos;ll compile it into a market.</p>
              {understanding && (
                <p className="text-center text-xs font-mono mb-4 px-4" style={{ color: "#D4AF37" }}>{understanding}</p>
              )}
              <CenteredComposer onSubmit={handleSubmit} isActive={false} initialValue={userInput} />
            </motion.div>
          )}

          {/* ── COMPILING ── */}
          {appState === "compiling" && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="w-6 h-6 mx-auto mb-4 rounded-full border border-t-transparent"
                style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Compiling market...</p>
              <p className="text-[10px] font-mono mt-2 max-w-sm mx-auto" style={{ color: "#D4AF37" }}>&ldquo;{userInput}&rdquo;</p>
            </motion.div>
          )}

          {/* ── DRAFTING ── */}
          {appState === "drafting" && draft && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              {/* Back controls */}
              <div className="flex items-center gap-3 mb-4">
                <button onClick={reset} className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#8b8b83" }}>&larr; Start over</button>
                <button onClick={() => { setAppState("idle"); setDraft(null); setUnderstanding("Edit your input and try again."); }}
                  className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "#D4AF37" }}>Edit input</button>
              </div>

              {/* System Understanding Card */}
              <div className="mb-4 p-3" style={{ background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.1)", borderRadius: "2px" }}>
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] mb-1.5" style={{ color: "#8b8b83" }}>System Understanding</p>
                <p className="text-xs font-mono" style={{ color: "#E5E0D8" }}
                   dangerouslySetInnerHTML={{ __html: understanding.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#D4AF37">$1</strong>') }} />
              </div>

              {/* Next Missing Field — ONE question at a time */}
              {nextQuestion && (
                <div className="mb-4 p-3" style={{ background: "rgba(0,95,111,0.04)", border: "1px solid rgba(0,95,111,0.12)", borderRadius: "2px" }}>
                  <p className="text-xs font-mono mb-2.5" style={{ color: "#005F6F" }}>{nextQuestion.question}</p>
                  <div className="flex gap-2 flex-wrap">
                    {nextQuestion.options.map(opt => (
                      <button
                        key={opt.label}
                        onClick={() => handleClarificationAnswer(opt.patch)}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-all active:scale-95"
                        style={{ border: "1px solid rgba(0,95,111,0.25)", color: "#E5E0D8", borderRadius: "2px", background: "rgba(0,95,111,0.06)" }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 px-3 py-2 text-xs font-mono" style={{ color: "#A31F34", borderLeft: "2px solid #A31F34" }}>{error}</div>
              )}

              {/* Live Draft Card */}
              <DraftPanel
                draft={{
                  title: draft.title,
                  playerA: "You",
                  playerB: null,
                  type: draft.type,
                  stake: draft.stake,
                  deadline: draft.deadline,
                  durationMinutes: 1440,
                  rules: draft.rules,
                  evidence: draft.evidenceType === "unset" ? "Not set" : draft.evidenceType,
                  aiReview: draft.aiReview,
                  isPublic: draft.isPublic,
                }}
                onPublish={handlePublish}
                onEdit={() => {}}
              />

              {/* Inline edit */}
              <div className="mt-4">
                <CenteredComposer
                  onSubmit={(input) => {
                    // Re-compile with the edit text to patch the draft
                    const editResult = compileMarket(input);
                    if (editResult.draft) {
                      const patched = { ...draft };
                      if (editResult.draft.stake > 0) patched.stake = editResult.draft.stake;
                      if (editResult.draft.evidenceType !== "unset") patched.evidenceType = editResult.draft.evidenceType;
                      if (editResult.draft.eventTime) {
                        patched.eventTime = editResult.draft.eventTime;
                        patched.deadline = editResult.draft.eventTime;
                      }
                      setDraft(patched);
                      setUnderstanding(`Updated: ${patched.title} | ${patched.stake > 0 ? `${patched.stake} credits` : "free"} | ${patched.evidenceType} | ${patched.deadline}`);
                    }
                  }}
                  isActive={true}
                  isParsing={false}
                />
              </div>
            </motion.div>
          )}

          {/* ── PUBLISHING ── */}
          {appState === "publishing" && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="w-6 h-6 mx-auto mb-4 rounded-full border border-t-transparent"
                style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Publishing market...</p>
            </motion.div>
          )}

          {/* ── LIVE ── */}
          {appState === "live" && shareLink && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="text-center mb-6">
                <p className="font-serif text-xl mb-1" style={{ color: "#E5E0D8" }}>Market published.</p>
                <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Send this link to your opponent.</p>
              </div>
              <div className="flex items-center gap-0 mb-6" style={{ border: "1px solid rgba(212,175,55,0.15)", borderRadius: "2px" }}>
                <input type="text" readOnly value={shareLink}
                  className="flex-1 bg-transparent px-3 py-3 text-xs font-mono focus:outline-none truncate"
                  style={{ color: "#E5E0D8" }} />
                <button onClick={copyLink}
                  className="flex-shrink-0 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                  style={{ background: copied ? "rgba(99,154,103,0.15)" : "rgba(212,175,55,0.1)", color: copied ? "#639A67" : "#D4AF37", borderLeft: "1px solid rgba(212,175,55,0.15)" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              {draft && (
                <div className="flex gap-3 mb-6 text-[10px] font-mono" style={{ color: "#8b8b83" }}>
                  <span>{draft.marketType.replace(/_/g, " ")}</span>
                  <span>·</span>
                  <span>{draft.stake > 0 ? `${draft.stake} credits` : "Free"}</span>
                  <span>·</span>
                  <span>{draft.evidenceType}</span>
                </div>
              )}
              <button onClick={reset} className="w-full py-3 text-xs font-mono uppercase tracking-wider transition-colors"
                style={{ color: "#8b8b83", border: "1px solid rgba(212,175,55,0.1)", borderRadius: "2px" }}>New Market</button>
            </motion.div>
          )}
        </div>
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
  );
}
