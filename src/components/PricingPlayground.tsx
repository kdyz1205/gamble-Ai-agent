"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  type PricingInputs,
  computePricingSnapshot,
  defaultPricingInputs,
} from "@/lib/pricing-model";

function NumInput({
  label,
  value,
  onChange,
  step = 1,
  min,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  min?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{label}</span>
      <input
        type="number"
        step={step}
        min={min}
        value={Number.isNaN(value) ? "" : value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-text-primary bg-bg-input border border-border-subtle focus:border-accent focus:outline-none"
      />
    </label>
  );
}

export default function PricingPlayground() {
  const [i, setI] = useState<PricingInputs>(() => defaultPricingInputs());
  const snap = useMemo(() => computePricingSnapshot(i), [i]);

  const set = <K extends keyof PricingInputs>(key: K, v: PricingInputs[K]) => {
    setI((prev) => ({ ...prev, [key]: v }));
  };

  return (
    <div className="min-h-screen text-text-primary" style={{ background: "#06060f" }}>
      <div className="max-w-4xl mx-auto px-4 py-10 pb-20">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-accent mb-1">Internal</p>
            <h1 className="text-2xl font-black">Pricing & margin lab</h1>
            <p className="text-sm text-text-muted mt-1 max-w-xl">
              Adjust API rates and token assumptions — see gross margin per tier and a simple “cover fixed cost” scenario.
              Not financial advice; calibrate against{" "}
              <a
                href="https://docs.anthropic.com/en/about-claude/pricing"
                className="text-teal underline underline-offset-2"
                target="_blank"
                rel="noreferrer"
              >
                Anthropic pricing
              </a>
              .
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="px-4 py-2 rounded-xl text-xs font-bold border border-border-subtle hover:bg-white/5"
            >
              ← Home
            </Link>
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setI(defaultPricingInputs())}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7c5cfc, #5b3fd9)" }}
            >
              Reset defaults
            </motion.button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "rgba(13,13,30,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider text-teal">Credits & tiers</h2>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Credits per 1 USDC" value={i.creditsPerUsdc} onChange={(v) => set("creditsPerUsdc", Math.max(1, v))} min={1} />
              <NumInput label="Signup bonus (credits)" value={i.signupBonusCredits} onChange={(v) => set("signupBonusCredits", Math.max(0, v))} min={0} />
              <NumInput label="Tier 1 credits / call" value={i.tier1Credits} onChange={(v) => set("tier1Credits", Math.max(1, v))} min={1} />
              <NumInput label="Tier 2 credits / call" value={i.tier2Credits} onChange={(v) => set("tier2Credits", Math.max(1, v))} min={1} />
              <NumInput label="Tier 3 credits / call" value={i.tier3Credits} onChange={(v) => set("tier3Credits", Math.max(1, v))} min={1} />
            </div>
            <p className="text-xs text-text-muted">
              List-implied <strong className="text-text-secondary">${snap.usdPerCredit.toFixed(4)}</strong> / credit · Bonus
              list value <strong className="text-text-secondary">${snap.signupBonusListUsd.toFixed(2)}</strong> · If all bonus were Haiku
              parses: <strong className="text-text-secondary">${snap.signupBurnHaikuParseUsd.toFixed(3)}</strong> API (upper bound).
            </p>
          </section>

          <section
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "rgba(13,13,30,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider text-gold">Tokens / call (est.)</h2>
            <div className="grid grid-cols-2 gap-3">
              <NumInput label="Parse input tokens" value={i.parseIn} onChange={(v) => set("parseIn", Math.max(0, v))} min={0} />
              <NumInput label="Parse output tokens" value={i.parseOut} onChange={(v) => set("parseOut", Math.max(0, v))} min={0} />
              <NumInput label="Judge input tokens" value={i.judgeIn} onChange={(v) => set("judgeIn", Math.max(0, v))} min={0} />
              <NumInput label="Judge output tokens" value={i.judgeOut} onChange={(v) => set("judgeOut", Math.max(0, v))} min={0} />
            </div>
          </section>

          <section
            className="rounded-2xl p-5 space-y-4 lg:col-span-2"
            style={{
              background: "rgba(13,13,30,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider text-accent">Anthropic $ / 1M tokens</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <NumInput label="Haiku input" value={i.haikuInPerM} onChange={(v) => set("haikuInPerM", Math.max(0, v))} step={0.1} min={0} />
              <NumInput label="Haiku output" value={i.haikuOutPerM} onChange={(v) => set("haikuOutPerM", Math.max(0, v))} step={0.1} min={0} />
              <NumInput label="Sonnet input" value={i.sonnetInPerM} onChange={(v) => set("sonnetInPerM", Math.max(0, v))} step={0.1} min={0} />
              <NumInput label="Sonnet output" value={i.sonnetOutPerM} onChange={(v) => set("sonnetOutPerM", Math.max(0, v))} step={0.1} min={0} />
            </div>
            <p className="text-xs text-text-muted">
              Tier 1 product → Haiku rates · Tier 2/3 → Sonnet rates (matches app routing).
            </p>
          </section>

          <section
            className="rounded-2xl p-5 space-y-4 lg:col-span-2"
            style={{
              background: "rgba(13,13,30,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider" style={{ color: "#00e87a" }}>
              Scenario → cover fixed cost
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <NumInput label="Monthly fixed ($)" value={i.monthlyFixedUsd} onChange={(v) => set("monthlyFixedUsd", Math.max(0, v))} step={10} min={0} />
              <NumInput label="Active users / mo" value={i.scenarioUsers} onChange={(v) => set("scenarioUsers", Math.max(0, v))} min={0} />
              <NumInput label="Parses / user / mo" value={i.scenarioParsesPerUser} onChange={(v) => set("scenarioParsesPerUser", Math.max(0, v))} min={0} />
              <NumInput label="Judges / user / mo" value={i.scenarioJudgesPerUser} onChange={(v) => set("scenarioJudgesPerUser", Math.max(0, v))} min={0} />
            </div>
            <label className="flex flex-col gap-1 max-w-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Product tier for scenario</span>
              <select
                value={i.scenarioProductTier}
                onChange={(e) => set("scenarioProductTier", Number(e.target.value) as 1 | 2 | 3)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-text-primary bg-bg-input border border-border-subtle focus:border-accent focus:outline-none"
              >
                <option value={1}>Tier 1 — Haiku API</option>
                <option value={2}>Tier 2 — Sonnet API</option>
                <option value={3}>Tier 3 — Sonnet API</option>
              </select>
            </label>

            <div
              className="grid sm:grid-cols-2 gap-3 text-sm rounded-xl p-4"
              style={{ background: "rgba(0,232,122,0.06)", border: "1px solid rgba(0,232,122,0.15)" }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted">Total API COGS</p>
                <p className="text-xl font-black text-text-primary">${snap.scenario.totalCogsUsd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted">List revenue (if all credits sold)</p>
                <p className="text-xl font-black text-teal">${snap.scenario.totalListRevUsd.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted">Contribution (vs API)</p>
                <p className={`text-xl font-black ${snap.scenario.contributionUsd >= 0 ? "text-[#00e87a]" : "text-[#ff4757]"}`}>
                  ${snap.scenario.contributionUsd.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-text-muted">After fixed</p>
                <p className={`text-xl font-black ${snap.scenario.profitAfterFixedUsd >= 0 ? "text-[#00e87a]" : "text-[#ff4757]"}`}>
                  ${snap.scenario.profitAfterFixedUsd.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="rounded-xl p-4" style={{ background: "rgba(124,92,252,0.08)", border: "1px solid rgba(124,92,252,0.2)" }}>
              <p className="text-xs font-bold text-text-secondary">
                Break-even users (cover monthly fixed only, at this usage pattern):{" "}
                <span className="text-lg font-black text-accent">
                  {snap.scenario.breakEvenUsers === null
                    ? "— (no margin per user)"
                    : snap.scenario.breakEvenUsers}
                </span>
              </p>
              <p className="text-[11px] text-text-muted mt-2">
                Assumes every credit consumed was bought at your list rate (1 USDC = {i.creditsPerUsdc} cr). Free bonus / unpaid
                usage makes real break-even higher.
              </p>
            </div>
          </section>

          <section
            className="rounded-2xl overflow-hidden lg:col-span-2"
            style={{
              background: "rgba(13,13,30,0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <h2 className="text-sm font-black uppercase tracking-wider px-5 pt-5 text-text-primary">Per-tier economics</h2>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-text-muted border-b border-border-subtle">
                    <th className="px-5 py-3">Tier</th>
                    <th className="px-3 py-3">API</th>
                    <th className="px-3 py-3">Cr</th>
                    <th className="px-3 py-3">Parse COGS</th>
                    <th className="px-3 py-3">Judge COGS</th>
                    <th className="px-3 py-3">Parse margin</th>
                    <th className="px-3 py-3 pr-5">Judge margin</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.tiers.map((row) => (
                    <tr key={row.productTier} className="border-b border-border-subtle/50">
                      <td className="px-5 py-3 font-bold">{row.productTier}</td>
                      <td className="px-3 py-3 text-text-muted">{row.apiTier}</td>
                      <td className="px-3 py-3">{row.creditsCharged}</td>
                      <td className="px-3 py-3 font-mono text-xs">${row.parseCogsUsd.toFixed(4)}</td>
                      <td className="px-3 py-3 font-mono text-xs">${row.judgeCogsUsd.toFixed(4)}</td>
                      <td className="px-3 py-3">{row.parseMarginPct.toFixed(0)}%</td>
                      <td className="px-3 py-3 pr-5">{row.judgeMarginPct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
