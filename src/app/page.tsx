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

    // Try LLM-powered compile first (if logged in + API key set)
    if (user) {
      try {
        const res = await api.parseChallenge(input);
        const p = res.parsed;

        // LLM said it's ordinary chat → reject
        if (p.intent === "ordinary_chat") {
          setUnderstanding("That doesn't seem like a bet or challenge. Try describing what you want to wager on.");
          setAppState("idle");
          return;
        }

        // LLM compiled a market — use it directly
        const llmDraft: MarketDraft = {
          marketType: p.marketType || "challenge",
          proposition: p.proposition || p.title,
          title: p.title || input.slice(0, 64),
          subject: p.subject || null,
          stake: p.suggestedStake || 0,
          stakeUnit: p.suggestedStake > 0 ? "credits" : "unset",
          stakeToken: "credits",
          evidenceType: p.evidenceType || "unset",
          eventTime: null,
          joinWindow: null,
          proofWindow: null,
          proofSource: null,
          arbiter: null,
          fallbackRule: null,
          disputeWindow: p.suggestedStake > 0 ? "24 hours" : null,
          settlementMode: "mutual_confirmation",
          visibility: p.isPublic ? "public" : "private",
          type: p.type || "General",
          deadline: p.deadline || "24 hours",
          rules: p.rules || p.proposition || p.title,
          aiReview: true,
          isPublic: p.isPublic ?? false,
        };

        // Build understanding from LLM
        const parts = [];
        parts.push(`**${(p.marketType || "challenge").replace(/_/g, " ")}**`);
        if (p.proposition) parts.push(`→ "${p.proposition}"`);
        if (p.suggestedStake > 0) parts.push(`| ${p.suggestedStake} credits`);
        if (p.deadline && p.deadline !== "24 hours") parts.push(`| by ${p.deadline}`);

        const missing = p.missingFields || [];
        const understanding = missing.length === 0
          ? `Ready to publish: ${parts.join(" ")}`
          : `${parts.join(" ")} — need: ${missing.join(", ")}`;

        setDraft(llmDraft);
        setUnderstanding(understanding);

        // Use LLM's clarifying question or generate from missing fields
        if (p.clarifyingQuestion && missing.length > 0) {
          setNextQuestion({
            field: (missing[0] || "stake") as keyof MarketDraft,
            question: p.clarifyingQuestion,
            options: getDefaultOptions(missing[0] || "stake"),
          });
        } else {
          // Use local compiler to generate missing field questions
          const localResult = compileMarket(input);
          setNextQuestion(localResult.nextQuestion);
        }

        setAppState("drafting");
        return;
      } catch (parseErr) {
        // Show the user that AI failed, using local fallback
        const msg = parseErr instanceof Error ? parseErr.message : "AI parse failed";
        console.error("LLM parse error:", msg);
        setUnderstanding(`⚠ AI unavailable (${msg}) — using local analysis`);
      }
    }

    // Local fallback compile (no API key or not logged in)
    const result: CompileResult = compileMarket(input);

    if (result.level === "ordinary_chat") {
      setUnderstanding(result.understanding);
      setAppState("idle");
      return;
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

    // Use the MarketDraft (draft state) as primary, editedDraft for title/stake overrides from DraftPanel
    if (!draft) return;
    const d = editedDraft
      ? { ...draft, title: editedDraft.title, stake: editedDraft.stake }
      : draft;

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
  }, [draft, user, router]);

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
    <div className="relative min-h-screen flex flex-col"
         onClick={() => showProfile && setShowProfile(false)}>
      {/* Ambient orbs are now in <SoftBackground /> mounted globally in layout.tsx */}

      {/* ── Header ── */}
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <button onClick={reset} className="text-base font-bold tracking-tight" style={{ color: "#1E293B" }}>
          LuckyPlay
        </button>
        <div className="flex items-center gap-3">
          {appState !== "idle" && (
            <button onClick={reset} className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#64748B" }}>New</button>
          )}
          {user ? (
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
                className="flex items-center gap-2 px-3 py-1.5 border shadow-sm"
                style={{ background: "#FFFFFF", borderColor: "#E2E8F0", borderRadius: "999px" }}>
                <span className="w-6 h-6 flex items-center justify-center text-[11px] font-bold"
                  style={{ background: "#FED7AA", color: "#FFFFFF", borderRadius: "999px" }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-semibold" style={{ color: "#1E293B" }}>{user.username}</span>
                <span className="text-[11px] font-bold px-1.5 py-0.5" style={{ background: "#FFEDD5", color: "#9A3412", borderRadius: "999px" }}>{user.credits ?? 0}</span>
              </button>
              <AnimatePresence>
                {showProfile && (
                  <motion.div className="absolute top-full right-0 mt-2 w-52 z-50 lp-glass"
                    style={{ borderRadius: "24px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
                    initial={{ opacity: 0, y: -4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="p-3 border-b" style={{ borderColor: "#F1F5F9" }}>
                      <p className="text-sm font-bold" style={{ color: "#1E293B" }}>{user.username}</p>
                      <p className="text-xs truncate" style={{ color: "#64748B" }}>{user.email || ""}</p>
                    </div>
                    <div className="p-2 space-y-0.5">
                      <button onClick={() => { setShowProfile(false); router.push("/me"); }}
                        className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-[#FFEDD5]"
                        style={{ color: "#1E293B" }}>👤 Profile</button>
                      <button onClick={() => { setShowProfile(false); router.push("/markets"); }}
                        className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-[#FFEDD5]"
                        style={{ color: "#1E293B" }}>🎲 My Markets</button>
                      <button onClick={() => { setShowProfile(false); signOut(); reset(); }}
                        className="w-full text-left px-3 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-[#FFE5EA]"
                        style={{ color: "#991B1B" }}>👋 Sign Out</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button onClick={() => setShowAuth(true)}
              className="px-4 py-2 text-sm font-bold shadow-sm active:scale-95 transition-transform"
              style={{ color: "#7C2D12", background: "#FED7AA", borderRadius: "9999px", boxShadow: "0 4px 14px 0 rgba(251,146,60,0.39)" }}>Sign In ✨</button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-lg">

          {/* ── IDLE ── */}
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              {/* Cute mascot — animated cloud blob */}
              <motion.div
                className="mx-auto mb-4 relative"
                style={{ width: 96, height: 96 }}
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <svg viewBox="0 0 120 120" width="96" height="96" style={{ filter: "drop-shadow(0 6px 12px rgba(251,207,232,0.50))" }}>
                  {/* body */}
                  <ellipse cx="60" cy="68" rx="44" ry="38" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
                  <circle cx="28" cy="58" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
                  <circle cx="92" cy="58" r="14" fill="#FFFFFF" stroke="#1E293B" strokeWidth="2.5" />
                  {/* cheeks */}
                  <circle cx="36" cy="74" r="6" fill="#FFD1DC" opacity="0.85" />
                  <circle cx="84" cy="74" r="6" fill="#FFD1DC" opacity="0.85" />
                  {/* eyes */}
                  <circle cx="48" cy="64" r="4" fill="#1E293B" />
                  <circle cx="72" cy="64" r="4" fill="#1E293B" />
                  <circle cx="49" cy="63" r="1.4" fill="#FFFFFF" />
                  <circle cx="73" cy="63" r="1.4" fill="#FFFFFF" />
                  {/* mouth */}
                  <path d="M 52 78 Q 60 84 68 78" stroke="#1E293B" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                </svg>
                {/* sparkles */}
                <motion.span className="absolute" style={{ top: -4, right: -2, fontSize: 18 }}
                  animate={{ rotate: [0, 20, -20, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 2.5, repeat: Infinity }}>✨</motion.span>
                <motion.span className="absolute" style={{ bottom: 0, left: -8, fontSize: 14 }}
                  animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.15, 1] }}
                  transition={{ duration: 2.8, repeat: Infinity, delay: 0.5 }}>⭐</motion.span>
              </motion.div>

              <h1 className="text-center text-3xl md:text-4xl font-extrabold mb-2 tracking-tight" style={{ color: "#1E293B" }}>
                Say the bet! <span className="inline-block">🎲</span>
              </h1>
              <p className="text-center text-base font-medium mb-6" style={{ color: "#475569" }}>
                Tell me what you wanna call — I&apos;ll turn it into a fun market.
              </p>
              {understanding && (
                <motion.p
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-center text-sm font-semibold mb-5 px-5 py-2 mx-auto inline-block"
                  style={{ color: "#9A3412", background: "#FFEDD5", borderRadius: "999px", display: "block", maxWidth: "fit-content", margin: "0 auto 1.25rem" }}>
                  {understanding}
                </motion.p>
              )}
              <CenteredComposer onSubmit={handleSubmit} isActive={false} initialValue={userInput} />
            </motion.div>
          )}

          {/* ── COMPILING ── */}
          {appState === "compiling" && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="w-12 h-12 mx-auto mb-4 rounded-full border-[3px] border-t-transparent"
                style={{ borderColor: "#FED7AA", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <p className="text-base font-bold" style={{ color: "#1E293B" }}>Cooking up your market… 🍳</p>
              <p className="text-sm font-medium mt-2 max-w-sm mx-auto px-4 py-2" style={{ color: "#9A3412", background: "#FFEDD5", borderRadius: "999px", display: "inline-block" }}>&ldquo;{userInput}&rdquo;</p>
            </motion.div>
          )}

          {/* ── DRAFTING ── */}
          {appState === "drafting" && draft && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              {/* Back controls */}
              <div className="flex items-center gap-2 mb-4">
                <button onClick={reset} className="px-3 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95"
                  style={{ color: "#475569", background: "#FFFFFF", border: "1px solid #E2E8F0" }}>← Start over</button>
                <button onClick={() => { setAppState("idle"); setDraft(null); setUnderstanding("Edit your input and try again."); }}
                  className="px-3 py-1.5 text-xs font-bold rounded-full transition-all active:scale-95"
                  style={{ color: "#9A3412", background: "#FFEDD5", border: "1px solid #FFE0CC" }}>✏️ Edit input</button>
              </div>

              {/* System Understanding Card */}
              <div className="mb-4 p-4 shadow-sm" style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "20px" }}>
                <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: "#A7F3D0" }}>🧠 What I heard</p>
                <p className="text-sm font-medium leading-relaxed" style={{ color: "#1E293B" }}
                   dangerouslySetInnerHTML={{ __html: understanding.replace(/\*\*(.*?)\*\*/g, '<strong style="color:#9A3412">$1</strong>') }} />
              </div>

              {/* Next Missing Field — ONE question at a time */}
              {nextQuestion && (
                <div className="mb-4 p-4 lp-glass" style={{ borderRadius: "24px", boxShadow: "0 4px 14px 0 rgba(110,231,183,0.40)" }}>
                  <p className="text-base font-bold mb-3" style={{ color: "#1E293B" }}>💭 {nextQuestion.question}</p>
                  <div className="flex gap-2 flex-wrap">
                    {nextQuestion.options.map(opt => (
                      <motion.button
                        key={opt.label}
                        onClick={() => handleClarificationAnswer(opt.patch)}
                        whileTap={{ scale: 0.94 }}
                        className="px-4 py-2 text-sm font-bold transition-all"
                        transition={{ type: "spring", stiffness: 400, damping: 22 }}
                        style={{ background: "#A7F3D0", color: "#064E3B", borderRadius: "9999px", boxShadow: "0 4px 14px 0 rgba(110,231,183,0.40)" }}
                      >
                        {opt.label}
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mb-4 px-4 py-3 text-sm font-semibold" style={{ color: "#991B1B", background: "#FECACA", borderRadius: "16px", boxShadow: "0 4px 14px 0 rgba(254,202,202,0.60)" }}>⚠️ {error}</div>
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
              <motion.div className="w-12 h-12 mx-auto mb-4 rounded-full border-[3px] border-t-transparent"
                style={{ borderColor: "#FED7AA", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <p className="text-base font-bold" style={{ color: "#1E293B" }}>Publishing your market… 🚀</p>
            </motion.div>
          )}

          {/* ── LIVE ── */}
          {appState === "live" && shareLink && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", damping: 12 }}
                className="text-center mb-6">
                <div className="text-5xl mb-2">🎉</div>
                <h2 className="text-2xl font-extrabold mb-1" style={{ color: "#1E293B" }}>Market is live!</h2>
                <p className="text-sm font-medium" style={{ color: "#475569" }}>Send this link to your opponent 👇</p>
              </motion.div>
              <div className="flex items-center gap-2 mb-5 p-2 shadow-sm"
                style={{ background: "#FFFFFF", border: "2px solid #E2E8F0", borderRadius: "20px" }}>
                <input type="text" readOnly value={shareLink}
                  className="flex-1 bg-transparent px-3 py-2 text-sm font-semibold focus:outline-none truncate"
                  style={{ color: "#1E293B" }} />
                <motion.button onClick={copyLink}
                  whileTap={{ scale: 0.94 }}
                  className="flex-shrink-0 px-4 py-2 text-sm font-bold transition-all"
                  style={{
                    background: copied ? "#6BCF8E" : "linear-gradient(135deg, #FED7AA, #9A3412)",
                    color: "#FFFFFF",
                    borderRadius: "999px",
                    boxShadow: copied ? "0 4px 14px 0 rgba(110,231,183,0.40)" : "0 4px 14px 0 rgba(251,146,60,0.39)",
                  }}>
                  {copied ? "Copied! ✓" : "Copy 📋"}
                </motion.button>
              </div>
              {draft && (
                <div className="flex flex-wrap gap-2 mb-6 justify-center">
                  <span className="px-3 py-1 text-xs font-bold" style={{ background: "#A7F3D01A", color: "#3FA890", borderRadius: "999px" }}>{draft.marketType.replace(/_/g, " ")}</span>
                  <span className="px-3 py-1 text-xs font-bold" style={{ background: "#FED7AA1A", color: "#9A3412", borderRadius: "999px" }}>{draft.stake > 0 ? `${draft.stake} cr` : "Free"}</span>
                  <span className="px-3 py-1 text-xs font-bold" style={{ background: "#E9D5FF1A", color: "#9881C7", borderRadius: "999px" }}>{draft.evidenceType}</span>
                </div>
              )}
              <motion.button onClick={reset} whileTap={{ scale: 0.97 }}
                className="w-full py-3 text-sm font-bold transition-all"
                style={{ color: "#1E293B", background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "999px" }}>
                ✨ Make another market
              </motion.button>
            </motion.div>
          )}
        </div>
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
  );
}

/* ── Default options for clarification fields ── */
function getDefaultOptions(field: string): Clarification["options"] {
  switch (field) {
    case "stake":
      return [
        { label: "Free", value: 0, patch: { stake: 0, stakeUnit: "credits" } },
        { label: "5 credits", value: 5, patch: { stake: 5, stakeUnit: "credits" } },
        { label: "10 credits", value: 10, patch: { stake: 10, stakeUnit: "credits" } },
        { label: "25 credits", value: 25, patch: { stake: 25, stakeUnit: "credits" } },
      ];
    case "evidenceType":
      return [
        { label: "Video proof", value: "Video proof", patch: { evidenceType: "Video proof" } },
        { label: "Photo", value: "Photo evidence", patch: { evidenceType: "Photo evidence" } },
        { label: "Self-report", value: "Self-report", patch: { evidenceType: "Self-report" } },
      ];
    case "deadline":
      return [
        { label: "1 hour", value: "1 hour", patch: { deadline: "1 hour", eventTime: "1 hour" } },
        { label: "24 hours", value: "24 hours", patch: { deadline: "24 hours", eventTime: "24 hours" } },
        { label: "1 week", value: "7 days", patch: { deadline: "7 days", eventTime: "7 days" } },
      ];
    default:
      return [
        { label: "Yes", value: "yes", patch: {} },
        { label: "No", value: "no", patch: {} },
      ];
  }
}
