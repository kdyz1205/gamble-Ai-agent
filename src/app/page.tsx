"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import CenteredComposer from "@/components/CenteredComposer";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import AuthModal from "@/components/AuthModal";
import * as api from "@/lib/api-client";
import { parseAmount, normalizeTranscript } from "@/lib/amount-parser";

type AppState = "idle" | "parsing" | "drafting" | "publishing" | "live";

export default function Home() {
  const { data: session, update: updateSession } = useSession();
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;
  const user = rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined;

  const [appState, setAppState] = useState<AppState>("idle");
  const [userInput, setUserInput] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [draft, setDraft] = useState<ChallengeDraft | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [amountConfirm, setAmountConfirm] = useState<{ prompt: string; options: { label: string; credits: number }[] } | null>(null);
  const [clarifications, setClarifications] = useState<Array<{ question: string; options: string[] }>>([]);

  const applyDraftEdit = useCallback((input: string) => {
    if (!draft) return;
    const normalized = normalizeTranscript(input);
    const updated = { ...draft };

    const amountResult = parseAmount(normalized);
    if (amountResult && !amountResult.needsConfirmation) {
      updated.stake = amountResult.credits;
    }
    if (/free|no.?stake|免费|不赌钱/i.test(normalized)) updated.stake = 0;
    if (/video|录像|视频/i.test(normalized)) updated.evidence = "Video proof";
    else if (/photo|照片|图片|截图/i.test(normalized)) updated.evidence = "Photo evidence";
    else if (/self.?report|自己报|口头/i.test(normalized)) updated.evidence = "Self-report";
    if (/1.?hour|1小时/i.test(normalized)) updated.deadline = "1 hour";
    if (/24.?h|24小时|一天/i.test(normalized)) updated.deadline = "24 hours";
    if (/48.?h|48小时|两天/i.test(normalized)) updated.deadline = "48 hours";
    if (/7.?day|7天|一周/i.test(normalized)) updated.deadline = "7 days";

    setDraft(updated);
    setAiMessage(`Updated — ${updated.stake > 0 ? `${updated.stake} credits` : "free"}, ${updated.evidence}, ${updated.deadline}.`);
  }, [draft]);

  /* ── Intent gate: is this a challenge/bet? ── */
  /* ── Intent classifier: scored, not binary ── */
  const looksLikeChallenge = useCallback((text: string): boolean => {
    const s = text.toLowerCase();
    let score = 0;

    // Strong signals (any one is enough)
    if (/\$\d|credit|stake|wager/i.test(s)) score += 3;
    if (/赌|打赌|对赌|下注/i.test(s)) score += 3;
    if (/bet\b|dare\b|challenge\b/i.test(s)) score += 3;

    // Medium signals
    if (/who can|i can|can't|i bet|你敢不敢|谁能|谁先|比谁/i.test(s)) score += 2;
    if (/能不能|会不会|输|赢|挑战|比赛/i.test(s)) score += 2;
    if (/pushup|squat|run|cook|code|chess|race|考试|跑步|俯卧撑/i.test(s)) score += 2;

    // Weak signals
    if (/先做完|before|deadline|by tomorrow|明天|今天/i.test(s)) score += 1;
    if (/video|photo|proof|证据|录像/i.test(s)) score += 1;
    if (s.length > 40) score += 1; // long = more likely descriptive

    // Anti-signals (likely not a challenge)
    if (/^(hi|hello|hey|你好|嗨|what|how|help|帮|怎么)\b/i.test(s)) score -= 2;
    if (s.length < 8) score -= 1;

    return score >= 2;
  }, []);

  /* ── Submit: normalize → intent gate → parse ── */
  const handleSubmit = useCallback(async (input: string) => {
    const normalized = normalizeTranscript(input);
    setUserInput(normalized);
    setError(null);
    setAmountConfirm(null);
    setClarifications([]);

    // Intent gate — don't force short non-challenge text into draft
    if (!looksLikeChallenge(normalized)) {
      setAiMessage("That doesn't look like a challenge. Try something like: \"I bet 10 credits I can do 50 pushups in 2 min\"");
      setAppState("idle");
      return;
    }

    setAppState("parsing");

    const amountResult = parseAmount(normalized);
    if (amountResult?.needsConfirmation && amountResult.confirmationPrompt) {
      const options = [{ label: `${amountResult.credits} credits`, credits: amountResult.credits }];
      if (amountResult.unit === "ambiguous" && amountResult.credits < 1000) {
        options.push({
          label: `$${amountResult.credits} = ${amountResult.credits * 100} credits`,
          credits: amountResult.credits * 100,
        });
      }
      setAmountConfirm({
        prompt: amountResult.confirmationPrompt,
        options,
      });
    }

    try {
      if (user) {
        const res = await api.parseChallenge(normalized);
        if (res.parsed) {
          const stake = amountResult && !amountResult.needsConfirmation
            ? amountResult.credits
            : res.parsed.suggestedStake || 0;

          setDraft({
            title: res.parsed.title || normalized,
            playerA: "You",
            playerB: null,
            type: res.parsed.type || "General",
            stake,
            deadline: res.parsed.deadline || "24 hours",
            durationMinutes: 1440,
            rules: res.parsed.rules || "",
            evidence: res.parsed.evidenceType || "Self-report",
            aiReview: true,
            isPublic: false,
          });

          if (res.clarifications?.length > 0) {
            setClarifications(res.clarifications);
          }

          setAiMessage(`${res.parsed.type} — ${stake > 0 ? `${stake} credits` : "free"}. Review and publish.`);
          setAppState("drafting");
          return;
        }
      }
    } catch {
      // fall through to local parse
    }

    const d = localParse(normalized);
    if (amountResult && !amountResult.needsConfirmation) {
      d.stake = amountResult.credits;
    }
    setDraft(d);
    setAiMessage(`${d.type} — ${d.stake > 0 ? `${d.stake} credits` : "free"} — ${d.evidence}. Publish when ready.`);
    setAppState("drafting");
  }, [user]);

  /* ── Publish ── */
  const handlePublish = useCallback(async (editedDraft?: ChallengeDraft) => {
    if (!user) { setShowAuth(true); return; }

    const d = editedDraft || draft;
    if (!d) return;
    setDraft(d);
    setAppState("publishing");
    setError(null);

    try {
      const res = await api.createChallenge({
        title: d.title,
        type: d.type,
        stake: d.stake,
        deadline: d.deadline,
        rules: d.rules,
        evidenceType: d.evidence.toLowerCase().replace(/ /g, "_"),
        aiReview: d.aiReview,
        isPublic: d.isPublic,
      });
      setShareLink(`${window.location.origin}/join/${res.challenge.id}`);
      setAppState("live");
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
    setAppState("idle");
    setUserInput("");
    setAiMessage("");
    setDraft(null);
    setShareLink(null);
    setCopied(false);
    setError(null);
    setAmountConfirm(null);
    setClarifications([]);
  }, []);

  return (
    <div
      className="relative min-h-screen flex flex-col"
      style={{ background: "#0A0A0B" }}
      onClick={() => showProfile && setShowProfile(false)}
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.03] blur-[150px]" style={{ background: "#D4AF37" }} />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] rounded-full opacity-[0.02] blur-[120px]" style={{ background: "#005F6F" }} />
      </div>

      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <button onClick={reset} className="flex items-center gap-2">
          <span className="text-sm font-serif font-bold" style={{ color: "#D4AF37" }}>Lex Divina</span>
        </button>

        <div className="flex items-center gap-3">
          {appState !== "idle" && (
            <button onClick={reset} className="text-[10px] font-mono tracking-wider uppercase" style={{ color: "#8b8b83" }}>
              New
            </button>
          )}

          {user ? (
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowProfile(!showProfile); }}
                className="flex items-center gap-2 px-2.5 py-1.5 border transition-colors"
                style={{ background: "rgba(212,175,55,0.04)", borderColor: "rgba(212,175,55,0.12)", borderRadius: "2px" }}
              >
                <span className="w-5 h-5 flex items-center justify-center text-[9px] font-serif font-bold" style={{ background: "rgba(212,175,55,0.12)", color: "#D4AF37", borderRadius: "2px" }}>
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span className="text-xs font-mono" style={{ color: "#8b8b83" }}>{user.username}</span>
                <span className="text-[9px] font-mono font-bold" style={{ color: "#D4AF37" }}>{user.credits ?? 0}</span>
              </button>

              <AnimatePresence>
                {showProfile && (
                  <motion.div
                    className="absolute top-full right-0 mt-1 w-48 z-50"
                    style={{ background: "#0E0E0C", border: "1px solid rgba(212,175,55,0.12)", borderRadius: "2px", boxShadow: "0 12px 40px rgba(0,0,0,0.6)" }}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-3 border-b" style={{ borderColor: "rgba(212,175,55,0.08)" }}>
                      <p className="text-xs font-serif font-bold" style={{ color: "#E5E0D8" }}>{user.username}</p>
                      <p className="text-[9px] font-mono" style={{ color: "#8b8b83" }}>{user.email || ""}</p>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => { setShowProfile(false); signOut(); reset(); }}
                        className="w-full text-left px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider hover:text-[#A31F34] transition-colors"
                        style={{ color: "#8b8b83" }}
                      >
                        Sign Out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              onClick={() => setShowAuth(true)}
              className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider"
              style={{ color: "#D4AF37", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "2px" }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 pb-20">
        <div className="w-full max-w-lg">
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="text-center font-serif text-2xl mb-1" style={{ color: "#E5E0D8" }}>Say the bet.</p>
              <p className="text-center text-xs font-mono mb-4" style={{ color: "#8b8b83" }}>We&apos;ll structure it.</p>
              {aiMessage && (
                <p className="text-center text-xs font-mono mb-4 px-4" style={{ color: "#D4AF37" }}>{aiMessage}</p>
              )}
              <CenteredComposer
                onSubmit={handleSubmit}
                isActive={false}
                isParsing={false}
                initialValue={userInput}
              />
            </motion.div>
          )}

          {appState === "parsing" && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div
                className="w-6 h-6 mx-auto mb-4 rounded-full border border-t-transparent"
                style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Structuring your challenge...</p>
              <p className="text-[10px] font-mono mt-2 max-w-sm mx-auto" style={{ color: "#D4AF37" }}>&ldquo;{userInput}&rdquo;</p>
            </motion.div>
          )}

          {appState === "drafting" && draft && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              {/* Back / Retry controls */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => { reset(); }}
                  className="text-[10px] font-mono uppercase tracking-wider transition-colors"
                  style={{ color: "#8b8b83" }}
                >
                  &larr; Start over
                </button>
                <button
                  onClick={() => { setAppState("idle"); setDraft(null); setAiMessage("Try again or edit your input."); }}
                  className="text-[10px] font-mono uppercase tracking-wider transition-colors"
                  style={{ color: "#D4AF37" }}
                >
                  Edit input
                </button>
              </div>

              <div className="mb-3 px-3 py-2" style={{ borderLeft: "2px solid rgba(212,175,55,0.2)" }}>
                <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>&ldquo;{userInput}&rdquo;</p>
              </div>

              {aiMessage && (
                <p className="text-xs font-mono mb-5 px-1" style={{ color: "#D4AF37" }}>{aiMessage}</p>
              )}

              {amountConfirm && draft && (
                <div className="mb-4 p-3" style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: "2px" }}>
                  <p className="text-xs font-mono mb-2" style={{ color: "#D4AF37" }}>{amountConfirm.prompt}</p>
                  <div className="flex gap-2 flex-wrap">
                    {amountConfirm.options.map(opt => (
                      <button
                        key={opt.credits}
                        onClick={() => {
                          setDraft({ ...draft, stake: opt.credits });
                          setAmountConfirm(null);
                          setAiMessage(`Stake set to ${opt.credits} credits.`);
                        }}
                        className="px-3 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider transition-colors"
                        style={{ border: "1px solid rgba(212,175,55,0.3)", color: "#D4AF37", borderRadius: "2px" }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {clarifications.length > 0 && (
                <div className="mb-4 space-y-3">
                  {clarifications.map((c, i) => (
                    <div key={i} className="p-3" style={{ background: "rgba(0,95,111,0.06)", border: "1px solid rgba(0,95,111,0.15)", borderRadius: "2px" }}>
                      <p className="text-xs font-mono mb-2" style={{ color: "#005F6F" }}>{c.question}</p>
                      <div className="flex gap-2 flex-wrap">
                        {c.options.map(opt => (
                          <button
                            key={opt}
                            onClick={() => {
                              setClarifications(prev => prev.filter((_, idx) => idx !== i));
                            }}
                            className="px-3 py-1.5 text-[10px] font-mono tracking-wider transition-colors"
                            style={{ border: "1px solid rgba(0,95,111,0.2)", color: "#E5E0D8", borderRadius: "2px" }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mb-4 px-3 py-2 text-xs font-mono" style={{ color: "#A31F34", borderLeft: "2px solid #A31F34" }}>
                  {error}
                </div>
              )}

              <DraftPanel draft={draft} onPublish={handlePublish} onEdit={() => {}} />

              <div className="mt-4">
                <CenteredComposer
                  onSubmit={applyDraftEdit}
                  isActive={true}
                  isParsing={false}
                />
              </div>
            </motion.div>
          )}

          {appState === "publishing" && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div
                className="w-6 h-6 mx-auto mb-4 rounded-full border border-t-transparent"
                style={{ borderColor: "#D4AF37", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Sealing the contract...</p>
            </motion.div>
          )}

          {appState === "live" && shareLink && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <div className="text-center mb-6">
                <p className="font-serif text-xl mb-1" style={{ color: "#E5E0D8" }}>Contract sealed.</p>
                <p className="text-xs font-mono" style={{ color: "#8b8b83" }}>Send this link to your opponent.</p>
              </div>

              <div className="flex items-center gap-0 mb-6" style={{ border: "1px solid rgba(212,175,55,0.15)", borderRadius: "2px" }}>
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="flex-1 bg-transparent px-3 py-3 text-xs font-mono focus:outline-none truncate"
                  style={{ color: "#E5E0D8" }}
                />
                <button
                  onClick={copyLink}
                  className="flex-shrink-0 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                  style={{
                    background: copied ? "rgba(99,154,103,0.15)" : "rgba(212,175,55,0.1)",
                    color: copied ? "#639A67" : "#D4AF37",
                    borderLeft: "1px solid rgba(212,175,55,0.15)",
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>

              {draft && (
                <div className="flex gap-3 mb-6 text-[10px] font-mono" style={{ color: "#8b8b83" }}>
                  <span>{draft.type}</span>
                  <span>·</span>
                  <span>{draft.stake > 0 ? `${draft.stake} credits` : "Free"}</span>
                  <span>·</span>
                  <span>{draft.evidence}</span>
                </div>
              )}

              <button
                onClick={reset}
                className="w-full py-3 text-xs font-mono uppercase tracking-wider transition-colors"
                style={{ color: "#8b8b83", border: "1px solid rgba(212,175,55,0.1)", borderRadius: "2px" }}
              >
                New Challenge
              </button>
            </motion.div>
          )}
        </div>
      </main>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} onSuccess={() => updateSession()} />
    </div>
  );
}

function localParse(input: string): ChallengeDraft {
  const s = input.toLowerCase();
  let type = "General";
  if (/pushup|run|fitness|exercise|plank|squat|gym|workout|俯卧撑|跑步|健身/i.test(s)) type = "Fitness";
  else if (/cook|bake|food|pasta|做饭|烘焙|料理/i.test(s)) type = "Cooking";
  else if (/code|coding|program|写代码|编程/i.test(s)) type = "Coding";
  else if (/read|book|study|learn|exam|阅读|学习|考试/i.test(s)) type = "Learning";
  else if (/chess|game|play|match|bet|游戏|比赛|赌/i.test(s)) type = "Games";

  const amountResult = parseAmount(input);
  const stake = amountResult && !amountResult.needsConfirmation ? amountResult.credits : 0;

  let evidence = "Self-report";
  if (/video|录像|视频/i.test(s)) evidence = "Video proof";
  else if (/photo|照片|图片|截图/i.test(s)) evidence = "Photo evidence";
  else if (type === "Fitness") evidence = "Video proof";

  let title = input.charAt(0).toUpperCase() + input.slice(1);
  if (title.length > 64) title = title.slice(0, 61) + "…";

  return {
    title,
    playerA: "You",
    playerB: null,
    type,
    stake,
    deadline: "24 hours",
    durationMinutes: 1440,
    rules: `${type} challenge — AI judges`,
    evidence,
    aiReview: true,
    isPublic: false,
  };
}
