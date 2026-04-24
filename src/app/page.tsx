"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import CenteredComposer from "@/components/CenteredComposer";
import DraftPanel from "@/components/DraftPanel";
import type { ChallengeDraft } from "@/components/DraftPanel";
import AuthModal from "@/components/AuthModal";
import ChatConversation, { type Turn } from "@/components/ChatConversation";
import * as api from "@/lib/api-client";
import type { ParsedChallenge, AgentDraftState, AgentTurn } from "@/lib/api-client";
import { emptyAgentDraftState } from "@/lib/api-client";
import { compileMarket, type MarketDraft, type Clarification } from "@/lib/market-compiler";
void compileMarket; // reserved for future legacy-fallback path; silence lint
import { useAmbientMotionAllowed } from "@/lib/use-motion-policy";

/**
 * Conversation memory — localStorage-backed so "再来一个 / another one / make
 * it bigger" references the most-recent draft instead of cold-starting. Keyed
 * by user id; we only keep the last 5 entries so context stays focused.
 */
const DRAFT_HISTORY_KEY_PREFIX = "luckyplay.draftHistory.v1.";
const DRAFT_HISTORY_LIMIT = 5;
const DRAFT_HISTORY_MAX_BYTES = 128 * 1024; // 128KB per user — bounds localStorage pressure
function loadDraftHistory(userId: string | undefined): ParsedChallenge[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DRAFT_HISTORY_KEY_PREFIX + userId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.slice(-DRAFT_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}
/**
 * Compact a draft down to just the fields we actually reference as
 * "prior context" — drops the heavy stakeOptions / evidenceOptions /
 * deadlineOptions arrays and the full oracles payloads. These can be
 * 5-10 KB per draft and we keep 5 of them. Slimming to the 8 fields the
 * AI actually needs cuts per-user localStorage from ~40KB → ~4KB.
 */
function slimDraftForHistory(d: ParsedChallenge): ParsedChallenge {
  return {
    title: d.title,
    type: d.type,
    suggestedStake: d.suggestedStake,
    evidenceType: d.evidenceType,
    rules: d.rules,
    deadline: d.deadline,
    isPublic: d.isPublic,
    intent: d.intent,
    marketType: d.marketType,
    proposition: d.proposition,
    recommendationSummary: d.recommendationSummary,
  } as ParsedChallenge;
}
function _saveDraftHistory(userId: string | undefined, list: ParsedChallenge[]) {
  if (!userId || typeof window === "undefined") return;
  try {
    let trimmed = list.slice(-DRAFT_HISTORY_LIMIT).map(slimDraftForHistory);
    let serialized = JSON.stringify(trimmed);
    // Enforce a hard byte cap — if somehow a caller passes a monster draft,
    // drop oldest entries until we fit.
    while (serialized.length > DRAFT_HISTORY_MAX_BYTES && trimmed.length > 1) {
      trimmed = trimmed.slice(1);
      serialized = JSON.stringify(trimmed);
    }
    window.localStorage.setItem(DRAFT_HISTORY_KEY_PREFIX + userId, serialized);
  } catch { /* quota exceeded is fine — just drop */ }
}

type AppState = "idle" | "compiling" | "drafting" | "publishing" | "live";
type WorkflowPhase = "understanding" | "drafting" | "validating" | "publishing" | "published" | "failed";

const WORKFLOW_STEPS: Array<{ key: WorkflowPhase; label: string }> = [
  { key: "understanding", label: "Understanding request" },
  { key: "drafting", label: "Drafting challenge" },
  { key: "validating", label: "Validating stake and rules" },
  { key: "publishing", label: "Publishing" },
  { key: "published", label: "Published" },
];

export default function Home() {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const rawUser = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;
  const user = rawUser ? { ...rawUser, username: rawUser.username || rawUser.name || rawUser.email?.split("@")[0] || "User" } : undefined;

  const [appState, setAppState] = useState<AppState>("idle");
  const [userInput, setUserInput] = useState("");
  const [understanding, setUnderstanding] = useState("");
  const [draft, setDraft] = useState<MarketDraft | null>(null);
  const [richDraft, setRichDraft] = useState<ParsedChallenge | null>(null); // AI's rich output with per-field options + reasoning
  const [nextQuestion, setNextQuestion] = useState<Clarification | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [publishedMarketId, setPublishedMarketId] = useState<string | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState<WorkflowPhase | null>(null);
  const [assistantNote, setAssistantNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTweaking, setIsTweaking] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  // Legacy draft history (pre-agent). Kept only so load/save effect below can
  // still read localStorage without erroring; not actually used in the agent flow.
  const [, setDraftHistory] = useState<ParsedChallenge[]>([]);
  // Chat-style conversation turns. Each user submit + AI reply becomes two turns.
  // An AI turn may carry an inline card (the live draft) rendered below the bubble.
  const [conversation, setConversation] = useState<Turn[]>([]);
  const conversationIdRef = useCallback(() => Math.random().toString(36).slice(2, 10), []);
  const allowAmbient = useAmbientMotionAllowed();

  // Hidden agent draft state — persisted across turns of the conversation.
  // The server merges draftPatch into this each turn and returns it back so
  // React state always matches what the LLM sees next turn.
  const [agentDraft, setAgentDraft] = useState<AgentDraftState>(emptyAgentDraftState);
  const [agentHistory, setAgentHistory] = useState<AgentTurn[]>([]);

  // Rehydrate draft history from localStorage once the user session is known.
  useEffect(() => {
    setDraftHistory(loadDraftHistory(user?.id));
  }, [user?.id]);

  /* ── Agent turn: one conversational round with GambleAI Orchestrator.
   * Replaces the legacy parseChallenge / adjust-draft path. Every user
   * submit (text input OR Publish button on the draft card OR opponent
   * accept etc.) becomes a turn through /api/agent/respond — the agent
   * decides whether to ask back, show a draft, or call a tool.
   */
  const runAgentTurn = useCallback(async (input: string): Promise<void> => {
    setUserInput(input);
    setError(null);

    // Push user bubble immediately so UI feels responsive.
    setConversation((prev) => [
      ...prev,
      { id: conversationIdRef(), role: "user", text: input },
    ]);
    // Tell the server what the user said + all prior turns + current draft.
    const historyForServer: AgentTurn[] = [
      ...agentHistory,
      { role: "user", content: input },
    ];
    setAppState("compiling");
    setWorkflowPhase("understanding");
    setAssistantNote("AI is thinking...");

    let res: Awaited<ReturnType<typeof api.agentRespond>>;
    try {
      res = await api.agentRespond(input, historyForServer, agentDraft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent request failed");
      setAppState("idle");
      return;
    }

    // Append AI bubble
    setConversation((prev) => [
      ...prev,
      { id: conversationIdRef(), role: "ai", text: res.userVisibleReply },
    ]);
    setAgentHistory([...historyForServer, { role: "ai", content: res.userVisibleReply }]);
    setAgentDraft(res.draftState);

    switch (res.agentAction) {
      case "ask_followup":
      case "refuse_or_redirect":
        // stay on idle screen — composer remains, waiting for next reply
        setAppState("idle");
        setWorkflowPhase(null);
        setAssistantNote("");
        return;
      case "show_draft": {
        // Map hidden agent draft → the MarketDraft shape the existing
        // DraftPanel renders. No option chips — chat IS the refinement UI now.
        const ad = res.draftState;
        const md: MarketDraft = {
          marketType: "challenge",
          proposition: ad.proposition || ad.title || input,
          title: ad.title || input.slice(0, 64),
          subject: null,
          stake: ad.stake ?? 0,
          stakeUnit: (ad.stake ?? 0) > 0 ? "credits" : "unset",
          stakeToken: "credits",
          evidenceType: ad.evidenceType || "unset",
          eventTime: ad.timeWindow,
          joinWindow: null,
          proofWindow: null,
          proofSource: null,
          arbiter: null,
          fallbackRule: null,
          disputeWindow: (ad.stake ?? 0) > 0 ? "24 hours" : null,
          settlementMode: "mutual_confirmation",
          visibility: "private",
          type: "General",
          deadline: ad.timeWindow || "24 hours",
          rules: ad.judgeRule || ad.proposition || ad.title || "",
          aiReview: true,
          isPublic: false,
        };
        setDraft(md);
        // Synthesize a minimal ParsedChallenge so existing DraftPanel code
        // (rich.recommendationSummary etc.) has something to read.
        setRichDraft({
          title: md.title, type: md.type,
          suggestedStake: md.stake, evidenceType: md.evidenceType,
          rules: md.rules || "", deadline: md.deadline, isPublic: false,
          intent: "candidate_market",
          marketType: "challenge",
          proposition: md.proposition,
          recommendationSummary: res.userVisibleReply,
          redFlags: ad.safetyNotes,
          missingFields: [],
        });
        setWorkflowPhase("validating");
        setAppState("drafting");
        return;
      }
      case "call_tool": {
        // The agent asked the server to do something. For createChallenge
        // the tool result carries challengeId + shareUrl — we surface the
        // live challenge screen immediately so the user can share it.
        const tr = res.toolResult as { challengeId?: string; shareUrl?: string; marketUrl?: string } | undefined;
        if (res.toolName === "createChallenge" && tr?.challengeId) {
          setPublishedMarketId(tr.challengeId);
          setShareLink(tr.shareUrl || tr.marketUrl || null);
          setAppState("live");
          setWorkflowPhase("published");
          await updateSession(); // refresh credits in header
          return;
        }
        // Other tools: just stay on current screen + surface any error
        if (res.toolError) setError(res.toolError);
        setAppState("drafting");
        return;
      }
      case "judge":
      case "confirm":
        // Not used from the home flow yet (judge/confirm happen on /market/[id]).
        // Fall back to idle.
        setAppState("idle");
        return;
    }
  }, [agentHistory, agentDraft, conversationIdRef, updateSession]);

  // (legacy parseChallenge flow removed — agent orchestrator at runAgentTurn() is the sole intake.)

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
    setWorkflowPhase("publishing");
    setAssistantNote("Creating the challenge, locking any stake, and preparing the market page.");
    setError(null);

    try {
      const evidence = d.evidenceType === "unset" ? "self_report" : d.evidenceType.toLowerCase().replace(/ /g, "_");
      const res = await api.createChallenge({
        title: d.title,
        description: d.proposition,
        marketType: d.marketType,
        proposition: d.proposition,
        type: d.type || "General",
        stake: d.stake || 0,
        stakeToken: d.stakeToken,
        deadline: d.deadline || "24 hours",
        eventTime: d.eventTime || d.deadline || undefined,
        joinWindow: d.joinWindow,
        proofWindow: d.proofWindow,
        rules: d.rules || d.title,
        evidenceType: evidence,
        settlementMode: d.settlementMode,
        proofSource: d.proofSource,
        arbiter: d.arbiter,
        fallbackRule: d.fallbackRule,
        disputeWindow: d.disputeWindow,
        aiReview: true,
        isPublic: d.isPublic || false,
        visibility: d.visibility,
      });
      const link = `${window.location.origin}/market/${res.challenge.id}`;
      setPublishedMarketId(res.challenge.id);
      setShareLink(link);
      setWorkflowPhase("published");
      setAssistantNote("Published. The market now has a permanent page and invite link.");
      setAppState("live");
      await updateSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish");
      setWorkflowPhase("failed");
      setAssistantNote("Publishing failed. The draft is still intact, so you can edit and retry.");
      setAppState("drafting");
    }
  }, [draft, user, updateSession]);

  const copyLink = useCallback(() => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [shareLink]);

  const reset = useCallback(() => {
    setAppState("idle"); setUserInput(""); setUnderstanding("");
    setDraft(null); setRichDraft(null); setNextQuestion(null); setShareLink(null);
    setPublishedMarketId(null); setWorkflowPhase(null); setAssistantNote("");
    setCopied(false); setError(null); setIsTweaking(false);
    setConversation([]); // clear the chat thread on explicit "Start over"
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
          {appState !== "idle" && (
            <ConversationProgress
              prompt={userInput}
              phase={workflowPhase}
              note={assistantNote}
            />
          )}

          {/* Chat thread when idle — shown when user got an ordinary_chat rejection
              so the AI's reply lives in the chat instead of a floating tag. */}
          {appState === "idle" && conversation.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <ChatConversation turns={conversation} isAiThinking={false} />
            </motion.div>
          )}

          {/* ── IDLE ── */}
          {appState === "idle" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              {/* Cute mascot — cloud blob. Animations gated by useAmbientMotionAllowed
                  so that prefers-reduced-motion / hidden-tab / low-end devices get a
                  still mascot (addresses the "phone gets hot" user report). */}
              <motion.div
                className="mx-auto mb-4 relative"
                style={{ width: 96, height: 96 }}
                animate={allowAmbient ? { y: [0, -6, 0] } : { y: 0 }}
                transition={allowAmbient ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
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
                {/* sparkles — also gated on motion policy */}
                {allowAmbient && (
                  <>
                    <motion.span className="absolute" style={{ top: -4, right: -2, fontSize: 18 }}
                      animate={{ rotate: [0, 20, -20, 0], scale: [1, 1.2, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity }}>✨</motion.span>
                    <motion.span className="absolute" style={{ bottom: 0, left: -8, fontSize: 14 }}
                      animate={{ rotate: [0, -15, 15, 0], scale: [1, 1.15, 1] }}
                      transition={{ duration: 2.8, repeat: Infinity, delay: 0.5 }}>⭐</motion.span>
                  </>
                )}
                {!allowAmbient && (
                  <>
                    <span className="absolute" style={{ top: -4, right: -2, fontSize: 18 }}>✨</span>
                    <span className="absolute" style={{ bottom: 0, left: -8, fontSize: 14 }}>⭐</span>
                  </>
                )}
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
              <CenteredComposer onSubmit={runAgentTurn} isActive={false} initialValue={userInput} />
            </motion.div>
          )}

          {/* ── COMPILING ── show thread so far + typing indicator; replaces the
              empty-spinner screen that felt like the app froze. */}
          {appState === "compiling" && conversation.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ChatConversation turns={conversation} isAiThinking={true} />
            </motion.div>
          )}
          {appState === "compiling" && conversation.length === 0 && (
            <motion.div className="text-center py-16" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <motion.div className="w-12 h-12 mx-auto mb-4 rounded-full border-[3px] border-t-transparent"
                style={{ borderColor: "#FED7AA", borderTopColor: "transparent" }}
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <p className="text-base font-bold" style={{ color: "#1E293B" }}>Cooking up your market… 🍳</p>
              <p className="text-sm font-medium mt-2 max-w-sm mx-auto px-4 py-2" style={{ color: "#9A3412", background: "#FFEDD5", borderRadius: "999px", display: "inline-block" }}>&ldquo;{userInput}&rdquo;</p>
            </motion.div>
          )}

          {/* ── DRAFTING but no draft (shouldn't happen but guards against
              a blank screen if parse raced to `drafting` state without
              setting draft — surfaces the real reason to the user).  ── */}
          {appState === "drafting" && !draft && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-center py-12 px-6">
              <div className="text-4xl mb-3">🤔</div>
              <p className="text-sm font-bold mb-1" style={{ color: "#991B1B" }}>
                Couldn&apos;t turn that into a challenge.
              </p>
              <p className="text-xs mb-4" style={{ color: "#64748B" }}>
                {understanding || "The AI didn\u2019t return a structured draft — could be a recognition issue. Try again or type directly."}
              </p>
              <button onClick={reset}
                className="px-5 py-2.5 text-sm font-bold rounded-full active:scale-95 transition-transform"
                style={{ background: "#FED7AA", color: "#7C2D12", boxShadow: "0 4px 14px 0 rgba(251,146,60,0.39)" }}>
                Try again
              </button>
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

              {/* Chat thread — every user submit + AI reply lives here. The draft
                  card itself (DraftPanel) sits below as the single "active canvas";
                  the thread is the conversation ABOUT it. This is what makes the
                  product feel like talking to ChatGPT instead of filling a form. */}
              {conversation.length > 0 && (
                <div className="mb-5">
                  <ChatConversation turns={conversation} isAiThinking={isTweaking} />
                </div>
              )}

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

              {/* Live Draft Card — now shows AI's full reasoning + clickable option chips */}
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
                rich={richDraft}
                onPublish={handlePublish}
                onEdit={() => {}}
                onFieldChange={(patch) => {
                  // User picked an alternative chip from AI's options — cascade into MarketDraft.
                  const updated = { ...draft };
                  if (patch.stake !== undefined) {
                    updated.stake = patch.stake;
                    updated.stakeUnit = patch.stake > 0 ? "credits" : "unset";
                  }
                  if (patch.deadline !== undefined) {
                    updated.deadline = patch.deadline;
                    updated.eventTime = patch.deadline;
                  }
                  if (patch.evidence !== undefined) {
                    // evidence label → type slug (e.g. "Full video" → "video")
                    const matched = richDraft?.evidenceOptions?.find(o => o.label === patch.evidence);
                    updated.evidenceType = matched?.type || patch.evidence.toLowerCase();
                  }
                  setDraft(updated);
                  // Mirror into richDraft so UI chip reflects the new active selection.
                  if (richDraft) {
                    setRichDraft({
                      ...richDraft,
                      suggestedStake: patch.stake ?? richDraft.suggestedStake,
                      evidenceType: (richDraft.evidenceOptions?.find(o => o.label === patch.evidence)?.type) ?? richDraft.evidenceType,
                      deadline: patch.deadline ?? richDraft.deadline,
                    });
                  }
                }}
                onActionItem={(a) => {
                  // AI proposed a next-step — wire each type to the right handler.
                  if (a.type === "adjust_stake") {
                    const newAmount = Number(a.payload?.newAmount ?? 0);
                    if (draft) {
                      const updated = { ...draft, stake: newAmount, stakeUnit: (newAmount > 0 ? "credits" : "unset") as typeof draft.stakeUnit };
                      setDraft(updated);
                      if (richDraft) setRichDraft({ ...richDraft, suggestedStake: newAmount });
                    }
                  } else if (a.type === "topup") {
                    // Route to profile / top-up drawer. For now: open profile.
                    setShowProfile(true);
                  } else if (a.type === "reduce_scope") {
                    // Ask AI to re-draft more conservatively via adjust-draft.
                    (async () => {
                      if (!richDraft) return;
                      setIsTweaking(true);
                      try {
                        const res = await api.adjustDraft("reduce scope and stakes — make it safer and smaller", richDraft);
                        setRichDraft(res.draft);
                        if (draft) setDraft({ ...draft, stake: res.draft.suggestedStake ?? 0, deadline: res.draft.deadline ?? draft.deadline });
                        setAssistantNote(res.message);
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "Could not reduce scope");
                      } finally {
                        setIsTweaking(false);
                      }
                    })();
                  } else {
                    // "add_opponent" / "other" — just surface the AI's suggestion as a note for now.
                    setAssistantNote(a.reasoning);
                  }
                }}
              />

              {/* Inline AI-powered tweak — natural language re-runs the full AI reasoning,
                  not just a field edit. "raise stake to 500" will also update recommendations
                  (higher stakes may trigger witness evidence suggestion, longer deadline, etc.) */}
              <div className="mt-4">
                <CenteredComposer
                  onSubmit={async (input) => {
                    // The in-drafting composer now routes through the same
                    // Agent Orchestrator as the initial compose — every user
                    // message (including "create it", "加 10 credits", "换成
                    // photo") becomes another conversational turn. No special-
                    // cased adjustDraft. The agent decides whether to ask back,
                    // re-render the card, or call createChallenge.
                    setIsTweaking(true);
                    try {
                      await runAgentTurn(input);
                    } finally {
                      setIsTweaking(false);
                    }
                  }}
                  isActive={true}
                  isParsing={isTweaking}
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
              {publishedMarketId && (
                <motion.button onClick={() => router.push(`/market/${publishedMarketId}`)} whileTap={{ scale: 0.97 }}
                  className="w-full py-3 text-sm font-bold transition-all mb-3"
                  style={{ color: "#7C2D12", background: "#FED7AA", borderRadius: "999px", boxShadow: "0 4px 14px 0 rgba(251,146,60,0.39)" }}>
                  Open market page
                </motion.button>
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
function ConversationProgress({
  prompt,
  phase,
  note,
}: {
  prompt: string;
  phase: WorkflowPhase | null;
  note: string;
}) {
  const activeIndex = phase
    ? WORKFLOW_STEPS.findIndex((s) => s.key === phase)
    : -1;
  const failed = phase === "failed";

  return (
    <motion.div
      className="mb-5 space-y-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {prompt && (
        <div className="ml-auto max-w-[88%] px-4 py-3 text-sm font-semibold"
          style={{ background: "#FFFFFF", color: "#1E293B", border: "1px solid #E2E8F0", borderRadius: "20px 20px 6px 20px" }}>
          {prompt}
        </div>
      )}
      <div className="px-4 py-3"
        style={{ background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: "20px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}>
        <p className="text-xs font-bold mb-2" style={{ color: failed ? "#991B1B" : "#7C2D12" }}>
          {failed ? "Action needs attention" : "AI workflow"}
        </p>
        <div className="space-y-2">
          {WORKFLOW_STEPS.map((step, index) => {
            const done = activeIndex >= 0 && index < activeIndex;
            const active = activeIndex === index && !failed;
            return (
              <div key={step.key} className="flex items-center gap-2">
                <span className="w-5 h-5 flex items-center justify-center text-[10px] font-black"
                  style={{
                    background: done ? "#A7F3D0" : active ? "#FED7AA" : "#F8FAFC",
                    color: done ? "#065F46" : active ? "#7C2D12" : "#64748B",
                    border: "1px solid #E2E8F0",
                    borderRadius: "999px",
                  }}>
                  {done ? "✓" : index + 1}
                </span>
                <span className="text-xs font-bold" style={{ color: active || done ? "#1E293B" : "#64748B" }}>
                  {step.label}
                </span>
                {active && (
                  <motion.span
                    className="ml-auto w-2 h-2 rounded-full"
                    style={{ background: "#FDBA74" }}
                    animate={{ scale: [1, 1.35, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            );
          })}
        </div>
        {note && <p className="mt-3 text-xs font-medium leading-relaxed" style={{ color: "#64748B" }}>{note}</p>}
      </div>
    </motion.div>
  );
}

// getDefaultOptions removed with legacy flow
