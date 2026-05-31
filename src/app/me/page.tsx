"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import Link from "next/link";
import * as api from "@/lib/api-client";
import type { ChallengeData } from "@/lib/api-client";
import { challengeUsesChineseCopy } from "@/lib/challenge-display";
import { formatChallengeDeadline } from "@/lib/challenge-time";
import { isAiReviewStatus, isEvidenceWindowStatus, isOpenForOpponentStatus, isTerminalStatus, statusLabel } from "@/lib/challenge-state-machine";

// stubborn status palette — canonical pastels
const STATUS_COLOR: Record<string, string> = {
  open:      "#FED7AA", // orange-200 — accepting joiners
  live:      "#A7F3D0", // mint-200 — in progress
  judging:   "#E9D5FF", // purple-200 — AI thinking
  settled:   "#A7F3D0", // mint-200 — done
  cancelled: "#FECACA", // red-200 — voided (soft, not alarming)
  disputed:  "#FECACA",
  draft:     "#E2E8F0", // slate-200 — neutral
};

// stubborn canonical palette — see project_luckyplay_design_system memory
const NAVY = "#1E293B";        // slate-800 headlines
const NAVY_DIM = "#64748B";    // slate-500 muted text
const NAVY_FAINT = "#E2E8F0";  // slate-200 hairline borders
const PEACH = "#FED7AA";       // orange-200 — primary CTA bg
const PEACH_DARK = "#FDBA74";  // orange-300 — hover
const PEACH_TEXT = "#7C2D12";  // orange-900 — text on peach
const ORANGE_GLOW = "rgba(251,146,60,0.39)"; // colored shadow
const CREAM = "#FFEDD5";       // orange-100 soft fill

type Tab = "all" | "open" | "live" | "settled";

const STATUS_LABEL_ZH: Record<string, string> = {
  draft: "草稿",
  generated_spec: "规则已生成",
  creator_confirmed: "已确认",
  waiting_for_opponent: "等对手",
  open: "等对手",
  opponent_accepted: "已接受",
  escrow_locked: "已托管",
  evidence_window_open: "交证据",
  creator_submitted: "创建者已交",
  opponent_submitted: "对手已交",
  ai_reviewing: "AI 复核",
  ai_verdict_ready: "待确认",
  dispute_window_open: "争议期",
  finalized: "已确认",
  settled: "已结算",
  refunded: "已退款",
  cancelled: "已取消",
  expired: "已过期",
  manual_review_required: "人工复核",
  disputed: "争议中",
  ai_inconclusive: "AI 未判定",
  evidence_invalid: "证据无效",
  evidence_missing: "缺证据",
  voided: "已作废",
};

export default function MePage() {
  const { data: session, status: sessionStatus } = useSession();
  const user = session?.user as { id?: string; username?: string; name?: string; email?: string; credits?: number } | undefined;

  const [markets, setMarkets] = useState<ChallengeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [browserZh, setBrowserZh] = useState(false);

  const loadMine = () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    api.listChallenges({ mine: true, limit: 50 })
      .then(res => { setMarkets(res.challenges); setLoading(false); })
      .catch(() => {
        setMessage("Could not load your challenge history. Refresh and try again.");
        setLoading(false);
      });
  };

  useEffect(() => {
    loadMine();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    setBrowserZh(/^zh/i.test(navigator.language));
  }, []);

  const zhCopy =
    markets.some((market) => challengeUsesChineseCopy(market)) ||
    browserZh;
  const labels = {
    refresh: zhCopy ? "刷新" : "Refresh",
    refreshing: zhCopy ? "刷新中" : "Refreshing",
    manager: zhCopy ? "管理" : "Manager",
    newChallenge: zhCopy ? "+ 新挑战" : "+ New",
    balance: zhCopy ? "余额" : "Balance",
    active: zhCopy ? "进行中" : "Active",
    settled: zhCopy ? "已结算" : "Settled",
    staked: zhCopy ? "托管" : "Staked",
    yourChallenges: zhCopy ? "我的挑战" : "Your challenges",
    total: zhCopy ? "个" : "total",
    noHistory: zhCopy ? "还没有挑战。从首页输入一句话创建。" : "No challenges yet. Create one from the composer.",
    createFirst: zhCopy ? "创建第一个挑战" : "Create your first challenge",
    checkingSession: zhCopy ? "正在恢复登录状态..." : "Checking your session...",
    signInProfile: zhCopy ? "登录后查看你的资料。" : "Sign in to view your profile.",
    goHome: zhCopy ? "回到首页" : "Go home",
  };

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <motion.div className="w-7 h-7 rounded-full border-[3px] border-t-transparent"
          style={{ borderColor: PEACH, borderTopColor: "transparent" }}
          animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
        <p className="text-sm font-semibold" style={{ color: NAVY_DIM }}>{labels.checkingSession}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-sm" style={{ color: NAVY_DIM }}>{labels.signInProfile}</p>
        <Link href="/" className="text-xs font-semibold underline" style={{ color: PEACH_DARK }}>{labels.goHome}</Link>
      </div>
    );
  }

  const username = user.username || user.name || user.email?.split("@")[0] || "User";
  const credits = user.credits ?? 0;

  const openCount = markets.filter(m => isOpenForOpponentStatus(m.status) || isEvidenceWindowStatus(m.status)).length;
  const settledCount = markets.filter(m => m.status === "settled").length;
  const totalStaked = markets.reduce((sum, m) => sum + (m.stake || 0), 0);

  const filtered = tab === "all" ? markets
    : tab === "open" ? markets.filter(m => isOpenForOpponentStatus(m.status))
    : tab === "live" ? markets.filter(m => isEvidenceWindowStatus(m.status) || isAiReviewStatus(m.status))
    : markets.filter(m => isTerminalStatus(m.status));

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>stubborn</Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadMine}
            disabled={loading}
            className="text-xs font-bold px-3 py-2 disabled:opacity-50"
            style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}
          >
            {loading ? labels.refreshing : labels.refresh}
          </button>
          <Link href="/markets" className="text-xs font-bold px-3 py-2"
            style={{ color: NAVY, background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "9999px" }}>
            {labels.manager}
          </Link>
          <Link href="/" className="text-xs font-bold px-4 py-2"
            style={{ background: PEACH, color: PEACH_TEXT, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
            {labels.newChallenge}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Profile card */}
        <div className="mb-6 p-5 lp-glass"
          style={{ borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}>
          <div className="flex items-center gap-4 mb-5">
            <div className="w-14 h-14 flex items-center justify-center text-xl font-bold"
              style={{ background: PEACH, color: PEACH_TEXT, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ color: NAVY }}>{username}</h1>
              <p className="text-xs truncate" style={{ color: NAVY_DIM }}>{user.email || ""}</p>
            </div>
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between py-3 px-4 mb-4"
            style={{ background: CREAM, borderRadius: "20px" }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: NAVY_DIM }}>{labels.balance}</span>
            <span className="text-2xl font-extrabold" style={{ color: PEACH_TEXT }}>
              {credits}
              <span className="text-xs font-bold ml-1" style={{ color: NAVY_DIM }}>cr</span>
            </span>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-2">
            <StatCard label={labels.active} value={openCount} tint="#5FC9B4" />
            <StatCard label={labels.settled} value={settledCount} tint="#6BCF8E" />
            <StatCard label={labels.staked} value={totalStaked} suffix="cr" tint="#B8A6E0" />
          </div>
        </div>

        {/* Markets section */}
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-bold" style={{ color: NAVY }}>{labels.yourChallenges}</h2>
          <span className="text-xs font-semibold" style={{ color: NAVY_DIM }}>{markets.length} {labels.total}</span>
        </div>
        {message && (
          <p className="mb-3 rounded-2xl border bg-white px-4 py-3 text-xs font-bold" style={{ color: NAVY_DIM, borderColor: NAVY_FAINT }}>
            {message}
          </p>
        )}

        {/* Tabs */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {(["all", "open", "live", "settled"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all flex-shrink-0"
              style={{
                color: tab === t ? PEACH_TEXT : NAVY_DIM,
                background: tab === t ? PEACH : "rgba(255,255,255,0.85)",
                border: `1px solid ${tab === t ? "transparent" : NAVY_FAINT}`,
                borderRadius: "9999px",
                boxShadow: tab === t ? `0 4px 14px 0 ${ORANGE_GLOW}` : "none",
                backdropFilter: tab === t ? undefined : "blur(8px)",
              }}>
              {zhCopy ? ({ all: "全部", open: "待加入", live: "进行中", settled: "已结束" } as Record<Tab, string>)[t] : t}
            </button>
          ))}
        </div>

        {/* Market list */}
        {loading ? (
          <div className="text-center py-12">
            <motion.div className="w-7 h-7 mx-auto rounded-full border-[3px] border-t-transparent"
              style={{ borderColor: PEACH, borderTopColor: "transparent" }}
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-6 shadow-sm"
            style={{ background: "#FFFFFF", border: `1px dashed ${NAVY_FAINT}`, borderRadius: "20px" }}>
            <p className="text-sm mb-4" style={{ color: NAVY_DIM }}>
              {tab === "all" ? labels.noHistory : zhCopy ? "这里暂时没有挑战。" : `No ${tab} challenges right now.`}
            </p>
            {tab === "all" && (
              <Link href="/" className="inline-block px-5 py-2.5 text-sm font-bold"
                style={{ background: PEACH, color: PEACH_TEXT, borderRadius: "9999px", boxShadow: `0 4px 14px 0 ${ORANGE_GLOW}` }}>
                {labels.createFirst}
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((m, i) => (
              <motion.div key={m.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}>
                <Link href={`/challenge/${m.id}`} className="block p-4 lp-glass transition-all hover:shadow-lg"
                  style={{ borderRadius: "24px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-bold truncate" style={{ color: NAVY }}>{m.title}</h3>
                      <div className="flex items-center gap-2 mt-1.5 text-xs font-medium" style={{ color: NAVY_DIM }}>
                        <span>{m.type}</span>
                        <span>/</span>
                        <span>{m.stake > 0 ? `${m.stake} ${zhCopy ? "积分" : "cr"}` : zhCopy ? "免费" : "Free"}</span>
                        <span>/</span>
                        <span>{m.participants?.length || 0} {zhCopy ? "人" : "joined"}</span>
                        <span>/</span>
                        <span>{formatChallengeDeadline(m.deadline, { includePrefix: !zhCopy }) ?? (zhCopy ? "无截止" : "No deadline")}</span>
                      </div>
                    </div>
                    <span className="flex-shrink-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                      style={{
                        color: NAVY,
                        background: STATUS_COLOR[m.status] || "#E2E8F0",
                        borderRadius: "9999px",
                      }}>
                      {zhCopy ? STATUS_LABEL_ZH[m.status] ?? m.status.replace(/_/g, " ") : statusLabel(m.status)}
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, suffix, tint }: { label: string; value: number; suffix?: string; tint: string }) {
  return (
    <div className="text-center py-3 px-2" style={{ background: `${tint}1A`, borderRadius: "14px" }}>
      <p className="text-xl font-bold" style={{ color: NAVY }}>
        {value}{suffix && <span className="text-xs font-semibold ml-0.5" style={{ color: NAVY_DIM }}>{suffix}</span>}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wider mt-0.5" style={{ color: NAVY_DIM }}>{label}</p>
    </div>
  );
}
