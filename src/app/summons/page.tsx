import type { CSSProperties } from "react";
import PactComposer from "@/components/summons/PactComposer";
import GatewayArrival from "@/components/summons/GatewayArrival";
import ChallengeCinematicStage from "@/components/summons/ChallengeCinematicStage";
import SceneShell from "@/components/scene/SceneShell";
import QuixMark from "@/components/scene/QuixMark";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const liveContracts = [
  {
    title: "Run 5km under 25 minutes by Friday",
    type: "Fitness Challenge",
    stake: "50 credits",
    proof: "GPS + video",
    verdict: "Familiar time-distance review",
    state: "Draft ready",
    progress: "72%",
    accent: "rgba(255,79,189,0.5)",
  },
  {
    title: "Beat Alex in chess before midnight",
    type: "Head-to-head",
    stake: "120 credits",
    proof: "Match link",
    verdict: "Winner from game record",
    state: "Opponent pending",
    progress: "48%",
    accent: "rgba(139,61,255,0.54)",
  },
  {
    title: "No sugar drinks for seven days",
    type: "Habit Quest",
    stake: "35 credits",
    proof: "Daily check-ins",
    verdict: "Proof streak review",
    state: "Proof window",
    progress: "61%",
    accent: "rgba(0,240,181,0.42)",
  },
] as const;

const pipelineSteps = [
  {
    phase: "01",
    label: "Intent",
    title: "Sentence becomes a quest",
    detail: "The Familiar extracts the measurable challenge before credits appear.",
  },
  {
    phase: "02",
    label: "Terms",
    title: "Credits stay clear",
    detail: "Credits, invite mode, and proof window are explicit before publish.",
  },
  {
    phase: "03",
    label: "Proof",
    title: "Proof has a deadline",
    detail: "The quest tells users what counts as proof and when it closes.",
  },
  {
    phase: "04",
    label: "Result",
    title: "Familiar explains outcome",
    detail: "Result, reasoning, and receipt path stay visible instead of magical.",
  },
] as const;

const worldStats = [
  ["Input", "1 line", "natural language"],
  ["Credits", "50", "optional entry"],
  ["Proof", "24h", "window ready"],
  ["Familiar", "AI", "result flow"],
] as const;

const settlementStats = [
  ["Quest Clarity", "Claim / credits / proof clear"],
  ["Credit Safety", "Internal-credit first"],
  ["Proof Window", "Deadline and source visible"],
  ["Familiar Trail", "Reasoning stays inspectable"],
] as const;

export default function SummonsPage() {
  return (
    <SceneShell activePath="/summons" particleCount={30} showSidebar={false} tone="world">
      <GatewayArrival />
      <section className="mx-auto flex w-full max-w-[1560px] flex-col gap-2.5 px-3 py-3 sm:px-5 lg:px-6">
        <div className="qx-stage-row order-1 grid items-stretch gap-2.5 xl:min-h-[calc(100svh-88px)] xl:grid-cols-[minmax(360px,0.68fr)_minmax(620px,1.32fr)]">
          <PactComposer />
          <ChallengeCinematicStage />
        </div>

        <div
          className="qx-award-surface qx-world-context-panel qx-world-status-rail relative isolate order-2 overflow-hidden rounded-lg px-4 py-3 sm:px-5"
          data-testid="summons-world-header"
          style={{
            background:
              "linear-gradient(90deg, rgba(5,0,10,0.78), rgba(18,4,28,0.52), rgba(5,0,10,0.72)), radial-gradient(circle at 18% 50%, rgba(255,79,189,0.18), transparent 34%)",
            border: `1px solid ${sceneTokens.color.line}`,
            boxShadow: "0 18px 70px rgba(0,0,0,0.3), inset 0 0 60px rgba(255,79,189,0.035)",
            backdropFilter: "blur(24px)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 bottom-4 -z-10 h-px opacity-45"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(255,79,189,0.46), rgba(139,61,255,0.3), transparent)",
              boxShadow: "0 0 60px rgba(255,79,189,0.38)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-[8%] top-[-72px] -z-10 h-52 w-52 rounded-full opacity-55"
            style={{
              background:
                "repeating-radial-gradient(circle, rgba(255,79,189,0.34) 0 1px, transparent 1px 18px), radial-gradient(circle, rgba(139,61,255,0.2), transparent 68%)",
              maskImage: "radial-gradient(circle, black 0%, transparent 72%)",
            }}
          />
          <span aria-hidden className="qx-corner-frame" />
          <div className="relative z-10 grid gap-4 lg:grid-cols-[minmax(280px,0.52fr)_minmax(540px,1fr)] lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full"
                style={{
                  background:
                    "radial-gradient(circle, rgba(255,79,189,0.36), rgba(139,61,255,0.1) 62%, transparent 74%)",
                  border: `1px solid ${sceneTokens.color.lineStrong}`,
                  boxShadow: sceneTokens.shadow.gold,
                  color: sceneTokens.color.gold,
                }}
              >
                <QuixMark className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: sceneTokens.color.gold }}>
                  Quest Hub
                </p>
                <h2 className="mt-1 text-2xl font-semibold leading-[1.12] sm:text-3xl" style={{ color: sceneTokens.color.text }}>
                  Summon the quest.
                </h2>
                <p className="mt-1 max-w-[560px] text-sm leading-6" style={{ color: sceneTokens.color.textMuted }}>
                  One sentence becomes rules, credits, invite, proof, and Familiar result.
                </p>
              </div>
            </div>

            <div className="qx-status-rail-grid grid grid-cols-2 gap-2 sm:grid-cols-4">
              {worldStats.map(([label, value, detail]) => {
                const stable = label === "Input";
                return (
                  <div
                    key={label}
                    className="qx-status-rail-item min-h-[58px] rounded-lg px-3 py-2"
                    style={{
                      background: stable ? "rgba(0,240,181,0.055)" : "rgba(244,239,255,0.035)",
                      border: `1px solid ${stable ? "rgba(0,240,181,0.22)" : sceneTokens.color.line}`,
                    }}
                  >
                    <p className="text-[10px] uppercase tracking-[0.16em]" style={{ color: sceneTokens.color.textFaint }}>
                      {label}
                    </p>
                    <p className="mt-2 text-lg font-semibold leading-tight" style={{ color: stable ? sceneTokens.color.cyan : sceneTokens.color.text }}>
                      {value}
                    </p>
                    <p className="mt-1 text-xs" style={{ color: sceneTokens.color.textMuted }}>
                      {detail}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="qx-world-secondary-grid order-3 grid gap-2.5 lg:grid-cols-[minmax(0,1.04fr)_minmax(360px,0.96fr)]">
          <section
            className="qx-award-surface qx-contract-market qx-contract-ticker relative isolate overflow-hidden rounded-lg p-3 sm:p-4"
            data-testid="challenge-contract-market"
            style={{
              background:
                "linear-gradient(135deg, rgba(18,4,28,0.72), rgba(3,0,8,0.66)), radial-gradient(circle at 18% 0%, rgba(255,79,189,0.22), transparent 34%)",
              border: `1px solid ${sceneTokens.color.line}`,
              boxShadow: "0 24px 96px rgba(0,0,0,0.38), inset 0 0 80px rgba(255,79,189,0.035)",
            }}
          >
            <span aria-hidden className="qx-market-orbit qx-market-orbit-a" />
            <span aria-hidden className="qx-market-orbit qx-market-orbit-b" />
            <span aria-hidden className="qx-corner-frame" />
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
                  Active Quest Cards
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-[1.05] sm:text-2xl" style={{ color: sceneTokens.color.text }}>
                  Quest logic, proof, and receipts.
                </h2>
              </div>
              <p className="max-w-[380px] text-xs leading-5" style={{ color: sceneTokens.color.textMuted }}>
                Every visible quest keeps credits, proof, Familiar result, and receipt path in the same language.
              </p>
            </div>

            <div className="relative z-10 mt-3 grid gap-2 md:grid-cols-3">
              {liveContracts.map((contract) => (
                <article
                  key={contract.title}
                  className="qx-contract-market-card qx-contract-ticker-card relative isolate min-h-[132px] overflow-hidden rounded-lg p-3"
                  data-testid="contract-market-card"
                  style={{
                    "--contract-accent": contract.accent,
                    "--contract-progress": contract.progress,
                    border: `1px solid ${sceneTokens.color.line}`,
                    background: "linear-gradient(180deg, rgba(244,239,255,0.06), rgba(3,0,8,0.46))",
                  } as CSSProperties}
                >
                  <span aria-hidden className="qx-contract-pulse" />
                  <div className="relative z-10 flex items-start justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.textFaint }}>
                      {contract.type}
                    </span>
                    <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">
                      {contract.state}
                    </span>
                  </div>
                  <h3 className="relative z-10 mt-3 text-base font-semibold leading-[1.12]" style={{ color: sceneTokens.color.text }}>
                    {contract.title}
                  </h3>
                  <div className="qx-contract-ticker-meta relative z-10 mt-3 grid grid-cols-3 gap-1.5 text-xs">
                    {[contract.stake, contract.proof, contract.verdict].map((value) => (
                      <span key={value} className="truncate font-semibold" style={{ color: sceneTokens.color.text }}>
                        {value}
                      </span>
                    ))}
                  </div>
                  <div className="qx-contract-progress relative z-10 mt-3 h-1 overflow-hidden rounded-full" />
                </article>
              ))}
            </div>
          </section>

          <section
            className="qx-award-surface qx-settlement-pipeline qx-pipeline-rail relative isolate overflow-hidden rounded-lg p-3 sm:p-4"
            data-testid="settlement-pipeline"
            style={{
              background:
                "linear-gradient(135deg, rgba(5,0,10,0.78), rgba(18,4,28,0.58)), radial-gradient(circle at 84% 12%, rgba(0,240,181,0.12), transparent 34%)",
              border: `1px solid ${sceneTokens.color.line}`,
              boxShadow: "0 24px 90px rgba(0,0,0,0.34), inset 0 0 70px rgba(0,240,181,0.025)",
            }}
            >
              <span aria-hidden className="qx-pipeline-thread" />
            <div className="relative z-10 flex items-center gap-3">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                style={{
                  border: `1px solid ${sceneTokens.color.lineStrong}`,
                  color: sceneTokens.color.gold,
                  background: "rgba(255,79,189,0.08)",
                }}
              >
                <QuixMark className="h-5 w-5" />
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
                  Quest Flow
                </p>
                <h2 className="mt-1 text-xl font-semibold leading-[1.08]" style={{ color: sceneTokens.color.text }}>
                  From sentence to receipt.
                </h2>
              </div>
            </div>

            <div className="relative z-10 mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {pipelineSteps.map((step, index) => (
                <article
                  key={step.phase}
                  className="qx-pipeline-step qx-pipeline-rail-step relative rounded-lg p-2.5"
                  style={{
                    "--pipeline-delay": `${index * 90}ms`,
                    border: `1px solid ${sceneTokens.color.line}`,
                    background: "rgba(244,239,255,0.035)",
                  } as CSSProperties}
                >
                  <div className="flex items-start gap-3">
                    <span className="qx-pipeline-index">{step.phase}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.cyan }}>
                        {step.label}
                      </p>
                      <h3 className="mt-1 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
                        {step.title}
                      </h3>
                      <p className="mt-1 text-xs leading-5" style={{ color: sceneTokens.color.textMuted }}>
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <div
          className="qx-settlement-strip order-4 grid gap-2 rounded-lg p-3 text-xs sm:grid-cols-4"
          style={{
            border: `1px solid ${sceneTokens.color.line}`,
            background: "linear-gradient(90deg, rgba(5,0,10,0.62), rgba(18,4,28,0.5), rgba(5,0,10,0.62))",
          }}
        >
          {settlementStats.map(([label, value]) => (
            <div key={label} className="rounded-md px-3 py-2" style={{ background: "rgba(244,239,255,0.025)" }}>
              <p className="uppercase tracking-[0.16em]" style={{ color: sceneTokens.color.textFaint }}>
                {label}
              </p>
              <p className="mt-1 font-semibold" style={{ color: sceneTokens.color.text }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>
    </SceneShell>
  );
}
