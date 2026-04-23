"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

// LuckyPlay palette (canonical)
const NAVY = "#1E293B";
const NAVY_DIM = "#64748B";
const NAVY_FAINT = "#E2E8F0";
const NAVY_HAIR = "#F1F5F9";
const NAVY_VERY_MUTED = "#94A3B8";
const PEACH = "#FED7AA";
const PEACH_DARK = "#FDBA74";
const PEACH_TEXT = "#7C2D12";
const ORANGE_GLOW = "rgba(251,146,60,0.39)";
const MINT = "#A7F3D0";
const MINT_TEXT = "#065F46";
const LAVENDER = "#E9D5FF";
const LAVENDER_TEXT = "#6B21A8";
const CREAM = "#FFEDD5";
const ROSE_BG = "#FECACA";
const ROSE_TEXT = "#991B1B";

// ────────────────────────────────────────────────────────────
// Model — what the numbers mean (plain English)
// ────────────────────────────────────────────────────────────
//
// Revenue sources:
//   1. SUBSCRIPTIONS: % of users pay $X/month for unlimited play.
//   2. RAKE (platform cut): we take N% of every stake that settles.
//   3. CREDIT PACKS: users buy credits, we sell them slightly above cost.
//
// Costs:
//   1. AI INFERENCE: every judge call costs us (frames + GPT-4o or mini).
//   2. STORAGE + BANDWIDTH: videos/photos on Vercel Blob.
//   3. INFRA: hosting, DB, monitoring.
//   4. TEAM (future): salaries.

interface Inputs {
  mau: number;                      // monthly active users
  payingPct: number;                // % who pay subscription
  subPrice: number;                 // $/month
  challengesPerUserMo: number;      // avg challenges/user/mo
  avgStakeUsd: number;              // avg stake $ per challenge
  rakePct: number;                  // platform cut on stakes
  aiCostPerJudgment: number;        // $ per judge (mixed gpt-4o/mini)
  judgmentsPerChallenge: number;    // avg number of AI calls per challenge
  storagePerUserGb: number;         // avg storage per user
  blobCostPerGb: number;            // storage $/GB/mo
  infraMonthly: number;             // fixed infra
  teamMonthly: number;              // fixed team
}

const PRESETS: Record<string, Inputs> = {
  Launch: {
    mau: 1_000,
    payingPct: 2,
    subPrice: 9,
    challengesPerUserMo: 4,
    avgStakeUsd: 5,
    rakePct: 3,
    aiCostPerJudgment: 0.04,
    judgmentsPerChallenge: 1,
    storagePerUserGb: 0.5,
    blobCostPerGb: 0.15,
    infraMonthly: 100,
    teamMonthly: 0,
  },
  Growth: {
    mau: 50_000,
    payingPct: 4,
    subPrice: 9,
    challengesPerUserMo: 6,
    avgStakeUsd: 8,
    rakePct: 3,
    aiCostPerJudgment: 0.025,
    judgmentsPerChallenge: 1,
    storagePerUserGb: 0.4,
    blobCostPerGb: 0.15,
    infraMonthly: 600,
    teamMonthly: 12_000,
  },
  Scale: {
    mau: 500_000,
    payingPct: 6,
    subPrice: 12,
    challengesPerUserMo: 10,
    avgStakeUsd: 10,
    rakePct: 3,
    aiCostPerJudgment: 0.015,
    judgmentsPerChallenge: 1.1,
    storagePerUserGb: 0.3,
    blobCostPerGb: 0.12,
    infraMonthly: 4_000,
    teamMonthly: 80_000,
  },
  Empire: {
    mau: 5_000_000,
    payingPct: 8,
    subPrice: 15,
    challengesPerUserMo: 14,
    avgStakeUsd: 15,
    rakePct: 3,
    aiCostPerJudgment: 0.01,
    judgmentsPerChallenge: 1.15,
    storagePerUserGb: 0.25,
    blobCostPerGb: 0.1,
    infraMonthly: 25_000,
    teamMonthly: 400_000,
  },
};

function calc(i: Inputs) {
  // Revenue
  const subs = i.mau * (i.payingPct / 100) * i.subPrice;
  const totalChallenges = i.mau * i.challengesPerUserMo;
  const totalStakes = totalChallenges * i.avgStakeUsd;
  const rake = totalStakes * (i.rakePct / 100);
  const revenue = subs + rake;

  // Costs
  const totalJudgments = totalChallenges * i.judgmentsPerChallenge;
  const aiCost = totalJudgments * i.aiCostPerJudgment;
  const storageCost = i.mau * i.storagePerUserGb * i.blobCostPerGb;
  const infra = i.infraMonthly;
  const team = i.teamMonthly;
  const costs = aiCost + storageCost + infra + team;

  // Bottom line
  const profit = revenue - costs;
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
  const arpu = i.mau > 0 ? revenue / i.mau : 0;
  const costPerUser = i.mau > 0 ? costs / i.mau : 0;

  return {
    revenue, costs, profit, margin, arpu, costPerUser,
    breakdown: {
      subs, rake,
      aiCost, storageCost, infra, team,
    },
    volumes: {
      totalChallenges, totalJudgments, totalStakes,
      payingUsers: i.mau * (i.payingPct / 100),
    },
  };
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}
function fmtInt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}K`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n).toLocaleString()}`;
}

export default function CalculatorPage() {
  const [inputs, setInputs] = useState<Inputs>(PRESETS.Growth);
  const [activePreset, setActivePreset] = useState<string>("Growth");
  const r = useMemo(() => calc(inputs), [inputs]);

  const set = <K extends keyof Inputs>(key: K, v: Inputs[K]) => {
    setInputs(prev => ({ ...prev, [key]: v }));
    setActivePreset("Custom");
  };

  const applyPreset = (name: keyof typeof PRESETS) => {
    setInputs(PRESETS[name]);
    setActivePreset(name);
  };

  const profitable = r.profit > 0;
  const breakEvenShortfall = profitable ? 0 : -r.profit;

  return (
    <div className="relative min-h-screen">
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-bold tracking-tight" style={{ color: NAVY }}>
          LuckyPlay
        </Link>
        <span className="text-xs font-semibold px-3 py-1.5"
          style={{ color: NAVY_DIM, background: NAVY_HAIR, borderRadius: "9999px" }}>
          Founder math
        </span>
      </header>

      <main className="relative z-10 max-w-3xl mx-auto px-4 py-4 pb-24 space-y-6">
        {/* Intro — plain language explainer */}
        <section>
          <h1 className="text-3xl font-extrabold mb-2 tracking-tight" style={{ color: NAVY }}>
            Will LuckyPlay make money?
          </h1>
          <p className="text-base font-medium leading-relaxed" style={{ color: NAVY_DIM }}>
            Play with the sliders below to model LuckyPlay&apos;s economics.
            The calculator tells you if the business is profitable at those numbers,
            and breaks down exactly where revenue comes from and where money is spent.
          </p>
        </section>

        {/* Preset chips */}
        <section className="flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as Array<keyof typeof PRESETS>).map((name) => {
            const selected = activePreset === name;
            return (
              <motion.button
                key={name}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }}
                onClick={() => applyPreset(name)}
                className="px-4 py-2 text-sm font-bold transition-colors"
                style={{
                  background: selected ? PEACH : "#FFFFFF",
                  color: selected ? PEACH_TEXT : NAVY_DIM,
                  border: `1px solid ${selected ? PEACH_DARK : NAVY_FAINT}`,
                  borderRadius: "9999px",
                  boxShadow: selected ? `0 4px 14px 0 ${ORANGE_GLOW}` : "none",
                }}
              >
                {name}
              </motion.button>
            );
          })}
          {activePreset === "Custom" && (
            <span className="px-4 py-2 text-sm font-bold"
              style={{ background: LAVENDER, color: LAVENDER_TEXT, borderRadius: "9999px" }}>
              Custom
            </span>
          )}
        </section>

        {/* Bottom line card — first so user sees impact of sliders immediately */}
        <section
          className="p-6"
          style={{
            background: profitable ? "#F0FDF4" : "#FEF2F2",
            border: `1px solid ${profitable ? "#BBF7D0" : "#FECACA"}`,
            borderRadius: "24px",
            boxShadow: "0 8px 30px rgba(15,23,42,0.04)",
          }}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: profitable ? MINT_TEXT : ROSE_TEXT }}>
                Bottom line · per month
              </p>
              <p className="text-5xl font-extrabold leading-none" style={{ color: NAVY }}>
                {fmtMoney(r.profit)}
              </p>
              <p className="text-sm font-semibold mt-2" style={{ color: profitable ? MINT_TEXT : ROSE_TEXT }}>
                {profitable
                  ? `Profitable · ${r.margin.toFixed(0)}% margin`
                  : `Losing money · need ${fmtMoney(breakEvenShortfall)} more/mo to break even`}
              </p>
            </div>
            <div className="space-y-1 text-right">
              <Row label="Revenue" value={fmtMoney(r.revenue)} color={NAVY} />
              <Row label="Costs" value={`−${fmtMoney(r.costs)}`} color={NAVY_DIM} />
            </div>
          </div>
        </section>

        {/* Inputs card */}
        <section
          className="p-6 space-y-6"
          style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>Growth</p>
            <Slider
              label="Monthly active users"
              explain="How many unique people play LuckyPlay in a month."
              value={inputs.mau}
              min={100} max={10_000_000} step={100}
              format={fmtInt}
              log
              onChange={(v) => set("mau", v)}
            />
            <Slider
              label="% paying subscription"
              explain="Of the users above, what share pay the monthly subscription. Typical consumer app: 2–8%."
              value={inputs.payingPct}
              min={0} max={30} step={0.5}
              format={(v) => `${v.toFixed(1)}%`}
              onChange={(v) => set("payingPct", v)}
            />
            <Slider
              label="Avg challenges per user per month"
              explain="How active is a typical user. Casual: 2–5. Engaged: 10+."
              value={inputs.challengesPerUserMo}
              min={0.5} max={40} step={0.5}
              format={(v) => v.toFixed(1)}
              onChange={(v) => set("challengesPerUserMo", v)}
            />
          </div>

          <Divider />

          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>Pricing</p>
            <Slider
              label="Subscription price"
              explain="Monthly fee for Pro users. Must feel worth it — not too expensive, not too cheap."
              value={inputs.subPrice}
              min={0} max={50} step={1}
              format={(v) => `$${v.toFixed(0)}`}
              onChange={(v) => set("subPrice", v)}
            />
            <Slider
              label="Avg stake per challenge"
              explain="When users bet real money, how much on average. Small-casual: $1–3. Serious: $10+."
              value={inputs.avgStakeUsd}
              min={0} max={100} step={1}
              format={(v) => `$${v.toFixed(0)}`}
              onChange={(v) => set("avgStakeUsd", v)}
            />
            <Slider
              label="Platform rake on stakes"
              explain="What % LuckyPlay keeps from each settled stake. Poker sites: ~5%. DraftKings: ~10%."
              value={inputs.rakePct}
              min={0} max={15} step={0.25}
              format={(v) => `${v.toFixed(2)}%`}
              onChange={(v) => set("rakePct", v)}
            />
          </div>

          <Divider />

          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>Costs</p>
            <Slider
              label="AI cost per judgment"
              explain="OpenAI GPT-4o vision: ~$0.30. gpt-4o-mini: ~$0.02. Hybrid with frame pre-extraction: ~$0.01."
              value={inputs.aiCostPerJudgment}
              min={0} max={0.5} step={0.005}
              format={(v) => `$${v.toFixed(3)}`}
              onChange={(v) => set("aiCostPerJudgment", v)}
            />
            <Slider
              label="Storage per user"
              explain="Video evidence saved on Vercel Blob. Casual users: 0.1 GB. Heavy video users: 1+ GB."
              value={inputs.storagePerUserGb}
              min={0} max={5} step={0.05}
              format={(v) => `${v.toFixed(2)} GB`}
              onChange={(v) => set("storagePerUserGb", v)}
            />
            <Slider
              label="Monthly infra baseline"
              explain="DB, hosting, monitoring. Launch: ~$100. Scale: $5K+."
              value={inputs.infraMonthly}
              min={0} max={50_000} step={100}
              format={fmtMoney}
              log
              onChange={(v) => set("infraMonthly", v)}
            />
            <Slider
              label="Monthly team cost"
              explain="Founder-only: $0. Small team: $15–30K. Scaled: $100K+."
              value={inputs.teamMonthly}
              min={0} max={500_000} step={1_000}
              format={fmtMoney}
              log
              onChange={(v) => set("teamMonthly", v)}
            />
          </div>
        </section>

        {/* Detailed breakdown */}
        <section
          className="p-6"
          style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: NAVY_DIM }}>Where the numbers come from</p>

          {/* Revenue side */}
          <div className="mb-6">
            <BreakdownHeader label="Revenue" total={fmtMoney(r.revenue)} tint={MINT} textColor={MINT_TEXT} />
            <BreakdownLine
              label="Subscriptions"
              detail={`${fmtInt(r.volumes.payingUsers)} users × $${inputs.subPrice}/mo`}
              value={fmtMoney(r.breakdown.subs)}
            />
            <BreakdownLine
              label="Rake on stakes"
              detail={`${fmtInt(r.volumes.totalChallenges)} challenges × $${inputs.avgStakeUsd} stake × ${inputs.rakePct}%`}
              value={fmtMoney(r.breakdown.rake)}
            />
          </div>

          {/* Cost side */}
          <div>
            <BreakdownHeader label="Costs" total={`−${fmtMoney(r.costs)}`} tint={ROSE_BG} textColor={ROSE_TEXT} />
            <BreakdownLine
              label="AI inference"
              detail={`${fmtInt(r.volumes.totalJudgments)} judgments × $${inputs.aiCostPerJudgment.toFixed(3)}`}
              value={`−${fmtMoney(r.breakdown.aiCost)}`}
            />
            <BreakdownLine
              label="Storage + bandwidth"
              detail={`${fmtInt(inputs.mau)} users × ${inputs.storagePerUserGb} GB × $${inputs.blobCostPerGb}/GB`}
              value={`−${fmtMoney(r.breakdown.storageCost)}`}
            />
            <BreakdownLine
              label="Infra"
              detail="DB, hosting, monitoring"
              value={`−${fmtMoney(r.breakdown.infra)}`}
            />
            <BreakdownLine
              label="Team"
              detail="Salaries, contractors"
              value={`−${fmtMoney(r.breakdown.team)}`}
            />
          </div>
        </section>

        {/* Per-user economics */}
        <section
          className="p-6 grid grid-cols-2 gap-4"
          style={{ background: "#FFFFFF", border: `1px solid ${NAVY_FAINT}`, borderRadius: "28px", boxShadow: "0 8px 30px rgba(15,23,42,0.04)" }}
        >
          <Stat label="Revenue per user" value={`$${r.arpu.toFixed(2)}`} sub="ARPU · monthly" tint={PEACH} />
          <Stat label="Cost per user" value={`$${r.costPerUser.toFixed(2)}`} sub="all-in" tint={LAVENDER} />
          <Stat label="Challenges/mo" value={fmtInt(r.volumes.totalChallenges)} sub="across all users" tint={MINT} />
          <Stat label="Paying users" value={fmtInt(r.volumes.payingUsers)} sub={`${inputs.payingPct}% of MAU`} tint={CREAM} />
        </section>

        {/* Plain English guide */}
        <section
          className="p-6 space-y-4"
          style={{ background: CREAM, border: `1px solid #FFE0CC`, borderRadius: "28px" }}
        >
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: PEACH_TEXT }}>The math in plain english</p>
          <Explain
            title="How we make money"
            body={"Two streams. (1) Subscriptions — a slice of your users pay $X/mo for Pro. (2) Rake — we keep a small cut of every stake that settles. Bigger stakes or more active users = more rake."}
          />
          <Explain
            title="How money is spent"
            body={"Every time AI judges a challenge, we pay OpenAI. That cost scales with how many users and how active they are. Videos also cost storage. Team and infra are fixed — they don't grow with one extra user."}
          />
          <Explain
            title="What makes us profitable"
            body={"Two levers. Either get more users and charge each of them more (revenue ↑), or drive per-judgment AI cost down with smarter frame extraction and cheaper models (cost ↓). Usually both, in that order."}
          />
          <Explain
            title="The break-even insight"
            body={"Once monthly recurring revenue covers fixed costs (team + infra), every additional paying user is nearly pure profit — because AI + storage cost is tiny relative to what they pay. That's the flywheel."}
          />
        </section>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Small pieces
// ────────────────────────────────────────────────────────────

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-3 justify-end">
      <span className="text-xs font-semibold" style={{ color: NAVY_DIM }}>{label}</span>
      <span className="text-lg font-extrabold tabular-nums" style={{ color }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="h-px" style={{ background: NAVY_HAIR }} />;
}

function Slider({
  label, explain, value, min, max, step, format, onChange, log,
}: {
  label: string;
  explain: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  log?: boolean;
}) {
  // Optional log scale: the slider is 0..1000, mapped to min..max exponentially.
  const LOG_STEPS = 1000;
  const toRaw = (slider: number) => {
    if (!log) return slider;
    const t = slider / LOG_STEPS;
    const a = Math.max(min, 1);
    return Math.round(a * Math.pow(max / a, t));
  };
  const toSlider = (raw: number) => {
    if (!log) return raw;
    const a = Math.max(min, 1);
    const t = Math.log(raw / a) / Math.log(max / a);
    return Math.round(Math.max(0, Math.min(1, t)) * LOG_STEPS);
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label className="text-sm font-bold" style={{ color: NAVY }}>{label}</label>
        <span className="text-base font-extrabold tabular-nums" style={{ color: PEACH_TEXT }}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : step}
        value={log ? toSlider(value) : value}
        onChange={(e) => onChange(log ? toRaw(Number(e.target.value)) : Number(e.target.value))}
        className="w-full"
        style={{ accentColor: PEACH_DARK }}
      />
      <p className="text-xs font-medium mt-1.5" style={{ color: NAVY_DIM, lineHeight: 1.5 }}>{explain}</p>
    </div>
  );
}

function BreakdownHeader({ label, total, tint, textColor }: { label: string; total: string; tint: string; textColor: string }) {
  return (
    <div className="flex items-center justify-between mb-2 px-3 py-2" style={{ background: tint, borderRadius: "12px" }}>
      <span className="text-sm font-bold" style={{ color: textColor }}>{label}</span>
      <span className="text-sm font-extrabold tabular-nums" style={{ color: textColor }}>{total}</span>
    </div>
  );
}

function BreakdownLine({ label, detail, value }: { label: string; detail: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: NAVY_HAIR }}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: NAVY }}>{label}</p>
        <p className="text-xs font-medium mt-0.5" style={{ color: NAVY_VERY_MUTED }}>{detail}</p>
      </div>
      <span className="text-sm font-bold tabular-nums flex-shrink-0" style={{ color: NAVY }}>{value}</span>
    </div>
  );
}

function Stat({ label, value, sub, tint }: { label: string; value: string; sub: string; tint: string }) {
  return (
    <div className="p-4" style={{ background: `${tint}24`, border: `1px solid ${tint}66`, borderRadius: "18px" }}>
      <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: NAVY_DIM }}>{label}</p>
      <p className="text-xl font-extrabold tabular-nums" style={{ color: NAVY }}>{value}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: NAVY_VERY_MUTED }}>{sub}</p>
    </div>
  );
}

function Explain({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-sm font-extrabold mb-1" style={{ color: PEACH_TEXT }}>{title}</p>
      <p className="text-sm font-medium leading-relaxed" style={{ color: NAVY }}>{body}</p>
    </div>
  );
}
