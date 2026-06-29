import JudgmentChamberEffects from "@/components/judgment/JudgmentChamberEffects";
import RitualButton from "@/components/scene/RitualButton";
import SceneShell from "@/components/scene/SceneShell";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const proofRows = [
  ["Proof Source", "Verified record", "01"],
  ["AI Model Output", "Reproducible inference", "02"],
  ["Data Provenance", "Source authenticity", "03"],
  ["Temporal Consistency", "Chronological alignment", "04"],
  ["Action Pattern", "Familiar review", "05"],
] as const;

const reasoningStats = [
  ["5/5", "Checks Passed"],
  ["98%", "Confidence"],
  ["12.4s", "Inference Time"],
] as const;

const resultRows = [
  ["Seal Integrity", "Valid"],
  ["Result Timestamp", "May 11, 2025 - 11:33 AM"],
] as const;

const chamberParticles = [
  [18, 72, 6, 0.2],
  [24, 34, 4, 1.4],
  [31, 58, 7, 2.6],
  [39, 22, 5, 0.8],
  [45, 76, 4, 3.1],
  [51, 28, 6, 1.7],
  [57, 64, 5, 0.4],
  [63, 40, 8, 2.2],
  [70, 70, 5, 1.1],
  [78, 31, 6, 2.9],
  [83, 56, 4, 0.6],
  [88, 78, 7, 1.9],
] as const;

export default function JudgmentDemoPage() {
  return (
    <SceneShell activePath="/judgment/demo" particleCount={88} tone="contract">
      <section className="relative mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-[1600px] flex-col gap-3 px-3 py-2 sm:px-5 lg:px-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 top-0 h-[68%] rounded-xl opacity-35 mix-blend-screen blur-[0.2px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(3,0,8,0), rgba(3,0,8,0.84) 82%), url('/scene/quixnova/judgment-reward-b.png') center top / cover no-repeat",
            maskImage: "radial-gradient(ellipse at 50% 36%, black 0%, transparent 72%)",
          }}
        />

        <header className="relative z-10 text-center">
          <div className="mx-auto flex max-w-[720px] items-center justify-center gap-3">
            <HeaderRule />
            <p className="text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: sceneTokens.color.gold }}>
              AI Judgment / Result
            </p>
            <HeaderRule />
          </div>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.textFaint }}>
            Page 05 of 05
          </p>
        </header>

        <div className="relative z-10 grid flex-1 gap-3 lg:h-[calc(100svh-126px)] lg:flex-none lg:grid-cols-[minmax(254px,0.78fr)_minmax(430px,1.28fr)_minmax(254px,0.78fr)] lg:grid-rows-[minmax(0,1fr)_156px]">
          <div className="order-3 lg:order-1 lg:col-start-1 lg:row-start-1">
            <EvidenceQualityPanel />
          </div>
          <div className="order-1 lg:order-2 lg:col-start-2 lg:row-start-1">
            <JudgmentOrbStage />
          </div>
          <div className="order-2 lg:order-4 lg:col-span-3 lg:row-start-2">
            <RewardChamberStrip />
          </div>
          <div className="order-4 lg:order-3 lg:col-start-3 lg:row-start-1">
            <AIReasoningPanel />
          </div>
        </div>
      </section>
    </SceneShell>
  );
}

function EvidenceQualityPanel() {
  return (
    <aside
      className="qx-award-surface relative isolate h-full min-h-[374px] overflow-hidden rounded-lg p-3.5 lg:min-h-0 min-[1500px]:p-4"
      data-testid="evidence-quality-panel"
      style={{
        background:
          "linear-gradient(180deg, rgba(24,5,36,0.84), rgba(5,0,10,0.88)), radial-gradient(circle at 34% 0%, rgba(255,79,189,0.2), transparent 34%)",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.panel,
      }}
    >
      <CornerLines />
      <PanelTitle eyebrow="Proof Quality" />

      <div className="mt-4 grid grid-cols-[1fr_90px] items-center gap-3">
        <div>
          <p className="text-[58px] font-semibold leading-none min-[1500px]:text-[68px]" style={{ color: sceneTokens.color.text, textShadow: "0 0 28px rgba(255,79,189,0.36)" }}>
            S+
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.gold }}>
            Exceptional
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.textMuted }}>
            Verified & coherent
          </p>
        </div>
        <div className="relative grid h-[86px] w-[86px] place-items-center">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full qx-verdict-spin-slow"
            style={{
              background: "conic-gradient(from 0deg, transparent 0 22deg, rgba(255,79,189,0.95) 22deg 352deg, transparent 352deg 360deg)",
              boxShadow: "0 0 26px rgba(255,79,189,0.26)",
            }}
          />
          <div className="relative grid h-[68px] w-[68px] place-items-center rounded-full" style={{ background: "rgba(5,0,10,0.9)", border: `1px solid ${sceneTokens.color.lineStrong}` }}>
            <span className="text-xl font-semibold" style={{ color: sceneTokens.color.text }}>
              98%
            </span>
            <span className="absolute bottom-3 text-[8px] font-semibold uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.textMuted }}>
              Integrity
            </span>
          </div>
        </div>
      </div>

      <Divider />
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.26em]" style={{ color: sceneTokens.color.gold }}>
        Proof Summary
      </p>
      <div className="mt-3 space-y-2">
        {proofRows.map(([label, detail, index]) => (
          <div
            key={label}
            className="group grid grid-cols-[32px_1fr_auto] items-center gap-2 rounded-md px-2.5 py-2"
            style={{
              background: "linear-gradient(90deg, rgba(255,79,189,0.065), rgba(244,239,255,0.025))",
              border: `1px solid ${sceneTokens.color.line}`,
            }}
          >
            <ProofStatusMark index={index} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold leading-tight" style={{ color: sceneTokens.color.text }}>
                {label}
              </span>
              <span className="block truncate text-[11px] leading-tight" style={{ color: sceneTokens.color.textMuted }}>
                {detail}
              </span>
            </span>
            <span className="text-[11px] font-semibold" style={{ color: sceneTokens.color.cyan }}>
              Verified
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 min-h-10 w-full rounded-md px-3 text-xs font-semibold"
        style={{
          color: sceneTokens.color.gold,
          background: "rgba(255,79,189,0.07)",
          border: `1px solid ${sceneTokens.color.line}`,
        }}
      >
        View Full Proof Details
      </button>
    </aside>
  );
}

function JudgmentOrbStage() {
  return (
    <section
      className="qx-award-surface relative isolate flex h-full min-h-[410px] overflow-hidden rounded-lg text-center sm:min-h-[430px] lg:min-h-0"
      data-testid="judgment-orb-stage"
      style={{
        background:
          "linear-gradient(180deg, rgba(3,0,8,0.08), rgba(3,0,8,0.24) 42%, rgba(3,0,8,0.94)), radial-gradient(circle at 50% 20%, rgba(255,79,189,0.24), transparent 35%), url('/scene/quixnova/rituals/verdict-orb.png') center center / cover no-repeat",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.seal,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <JudgmentChamberEffects className="z-[2] opacity-90" />
      <div
        aria-hidden
        className="absolute inset-0 z-[1] opacity-70"
        style={{
          background:
            "linear-gradient(90deg, rgba(255,79,189,0.18), transparent 18% 82%, rgba(139,61,255,0.18)), radial-gradient(ellipse at 50% 92%, rgba(255,79,189,0.32), transparent 44%)",
          mixBlendMode: "screen",
        }}
      />
      <div aria-hidden className="absolute inset-0 overflow-hidden">
        {chamberParticles.map(([left, top, size, delay]) => (
          <span
            key={`${left}-${top}`}
            className="qx-chamber-spark absolute rounded-full"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-[610px] flex-col items-center justify-center px-4 py-5">
        <div className="relative grid h-[280px] w-[280px] place-items-center sm:h-[324px] sm:w-[324px] min-[1500px]:h-[370px] min-[1500px]:w-[370px]" data-testid="verdict-core">
          <div aria-hidden className="absolute inset-0 rounded-full qx-verdict-halo" />
          <div aria-hidden className="absolute inset-4 rounded-full qx-verdict-spin-slow" style={{ border: `1px solid ${sceneTokens.color.lineStrong}` }} />
          <div aria-hidden className="absolute inset-10 rounded-full qx-verdict-spin-reverse" style={{ border: "1px dashed rgba(255,143,220,0.42)" }} />
          <div
            aria-hidden
            className="absolute inset-[22%] rotate-45"
            style={{
              border: `1px solid ${sceneTokens.color.lineStrong}`,
              boxShadow: "0 0 42px rgba(255,79,189,0.22)",
            }}
          />
          <div aria-hidden className="absolute left-1/2 top-[52%] h-[42%] w-px -translate-x-1/2" style={{ background: "linear-gradient(180deg, rgba(255,79,189,0.72), transparent)" }} />
          <div className="relative z-10 flex h-[64%] w-[64%] flex-col items-center justify-center rounded-full px-4" style={{ background: "radial-gradient(circle, rgba(15,0,24,0.72), rgba(3,0,8,0.28) 70%, transparent 72%)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.36em]" style={{ color: sceneTokens.color.gold }}>
              Result
            </p>
            <h1 className="mt-5 font-serif text-4xl font-semibold uppercase leading-none sm:text-5xl" style={{ color: sceneTokens.color.text, textShadow: "0 0 34px rgba(255,79,189,0.5)" }}>
              Quest Settled
            </h1>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: sceneTokens.color.text }}>
              Result Confirmed
            </p>
            <PhoenixSeal />
          </div>
        </div>

        <div className="relative -mt-2 max-w-[520px]">
          <div className="mx-auto mb-3 h-px w-52" style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.78), transparent)" }} />
          <p className="text-base font-medium leading-6 sm:text-lg" style={{ color: sceneTokens.color.text }}>
            &quot;The proof aligns. The result is clear.&quot;
          </p>
          <p className="mt-1 text-sm" style={{ color: sceneTokens.color.gold }}>
            Summoner.world
          </p>
        </div>
      </div>
    </section>
  );
}

function AIReasoningPanel() {
  return (
    <aside
      className="qx-award-surface relative isolate h-full min-h-[374px] overflow-hidden rounded-lg p-3.5 lg:min-h-0 min-[1500px]:p-4"
      data-testid="ai-reasoning-panel"
      style={{
        background:
          "linear-gradient(180deg, rgba(24,5,36,0.84), rgba(5,0,10,0.88)), radial-gradient(circle at 80% 4%, rgba(139,61,255,0.18), transparent 34%)",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.panel,
      }}
    >
      <CornerLines />
      <PanelTitle eyebrow="Familiar Reasoning" />
      <p className="mt-4 text-sm leading-6" style={{ color: sceneTokens.color.textMuted }}>
        The submitted proofs were evaluated across authenticity, consistency, and intent alignment. All critical checks passed with exceptional coherence.
      </p>
      <Divider />

      <div className="mt-3 grid grid-cols-3 gap-1 text-center">
        {reasoningStats.map(([value, label]) => (
          <div key={label} className="px-2 py-2">
            <p className="text-lg font-semibold" style={{ color: sceneTokens.color.text }}>
              {value}
            </p>
            <p className="mt-1 text-[10px] leading-tight" style={{ color: sceneTokens.color.textMuted }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md p-3" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
        <div className="flex items-end justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.gold }}>
            Confidence Score
          </p>
          <p className="text-3xl font-semibold leading-none" style={{ color: sceneTokens.color.text }}>
            98%
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "rgba(244,239,255,0.08)" }}>
          <div className="h-full w-[98%] rounded-full qx-confidence-bar" />
        </div>
        <p className="mt-2 text-right text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.textMuted }}>
          Very High
        </p>
      </div>

      <div className="mt-3 grid grid-cols-[42px_1fr] gap-3 rounded-md p-3" style={{ background: "rgba(255,79,189,0.1)", border: `1px solid ${sceneTokens.color.lineStrong}` }}>
        <GateGlyph />
        <div>
          <p className="text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
            Receipt Gate
          </p>
          <p className="mt-1 text-sm leading-5" style={{ color: sceneTokens.color.textMuted }}>
            All conditions met. The result receipt is ready to share.
          </p>
        </div>
      </div>

      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: sceneTokens.color.gold }}>
        Result Status
      </p>
      <div className="mt-2 space-y-2">
        {resultRows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 text-xs">
            <span style={{ color: sceneTokens.color.textMuted }}>{label}</span>
            <span className="max-w-[58%] break-words text-right font-semibold leading-tight" style={{ color: label === "Seal Integrity" ? sceneTokens.color.cyan : sceneTokens.color.text }}>
              {value}
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}

function RewardChamberStrip() {
  return (
    <section
      className="qx-award-surface relative isolate grid min-h-[156px] gap-2 overflow-hidden rounded-lg p-3 sm:gap-3 sm:p-4 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)_minmax(0,1fr)] lg:items-center"
      data-testid="reward-capsule-strip"
      style={{
        background:
          "linear-gradient(90deg, rgba(5,0,10,0.82), rgba(24,5,36,0.78), rgba(5,0,10,0.82)), radial-gradient(ellipse at 50% 8%, rgba(255,79,189,0.25), transparent 50%)",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: "0 18px 78px rgba(0,0,0,0.42)",
        backdropFilter: "blur(24px)",
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <div aria-hidden className="absolute inset-x-[18%] top-[42%] h-px qx-reward-orbit" />
      <div aria-hidden className="absolute inset-x-[24%] top-[50%] h-px qx-reward-orbit qx-reward-orbit-slow" />

      <div className="relative z-10 order-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: sceneTokens.color.gold }}>
          Receipt Ready
        </p>
        <h2 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: sceneTokens.color.text }}>
          Your Result Receipt is Ready
        </h2>
        <p className="mt-2 hidden max-w-[360px] text-sm leading-5 sm:block" style={{ color: sceneTokens.color.textMuted }}>
          A proof-backed result, ready to share.
        </p>
      </div>

      <div
        className="relative z-10 order-3 mx-auto grid h-24 w-full max-w-[320px] place-items-center overflow-hidden rounded-lg lg:order-2 lg:h-[92px]"
        data-testid="reward-relic"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,79,189,0.18), rgba(139,61,255,0.12)), radial-gradient(circle at 50% 42%, rgba(255,79,189,0.32), transparent 60%)",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: sceneTokens.shadow.gold,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{
            background: "url('/scene/quixnova/rituals/proof-crystal.png') center 38% / 160px auto no-repeat",
            mixBlendMode: "screen",
          }}
        />
        <div aria-hidden className="absolute inset-x-8 top-1/2 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.86), transparent)" }} />
        <div className="relative z-10 text-center">
          <p className="text-2xl font-semibold leading-none" style={{ color: sceneTokens.color.text }}>
            Epic
          </p>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: sceneTokens.color.gold }}>
            Quest Receipt
          </p>
        </div>
      </div>

      <div className="relative z-10 order-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:gap-3 lg:order-3 lg:grid-cols-1">
        <div className="rounded-md p-2.5 sm:p-3" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
          <p className="text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
            Result Receipt
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none" style={{ color: sceneTokens.color.gold }}>
            Epic <span className="align-middle text-xs" style={{ color: sceneTokens.color.textMuted }}>Tier 4</span>
          </p>
          <p className="mt-2 hidden text-xs leading-5 min-[1500px]:block" style={{ color: sceneTokens.color.textMuted }}>
            Contains the final quest result and proof-backed reasoning.
          </p>
        </div>
        <div className="grid min-w-[250px] grid-cols-2 gap-2">
          <RitualButton className="min-h-11 px-4 text-[11px]" data-testid="open-reward-button" type="button">
            Open Receipt
          </RitualButton>
          <RitualButton className="min-h-11 px-4 text-[11px]" type="button" variant="ghost">
            Return
          </RitualButton>
        </div>
      </div>
    </section>
  );
}

function PanelTitle({ eyebrow }: { eyebrow: string }) {
  return (
    <div className="relative z-10 flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: "rgba(255,79,189,0.1)", border: `1px solid ${sceneTokens.color.line}` }}>
        <span className="h-3 w-3 rotate-45" style={{ border: `1px solid ${sceneTokens.color.gold}` }} />
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: sceneTokens.color.gold }}>
        {eyebrow}
      </p>
    </div>
  );
}

function HeaderRule() {
  return <span aria-hidden className="hidden h-px w-24 sm:block" style={{ background: "linear-gradient(90deg, transparent, rgba(255,143,220,0.75))" }} />;
}

function Divider() {
  return <div className="mt-4 h-px" style={{ background: `linear-gradient(90deg, ${sceneTokens.color.lineStrong}, transparent)` }} />;
}

function PhoenixSeal() {
  return (
    <div className="relative mt-5 h-12 w-16" aria-hidden>
      <span className="absolute left-1/2 top-2 h-9 w-px -translate-x-1/2" style={{ background: "linear-gradient(180deg, rgba(255,143,220,0.8), transparent)" }} />
      <span className="absolute left-2 top-4 h-7 w-7 -rotate-[32deg] rounded-br-full border-b border-r" style={{ borderColor: "rgba(255,143,220,0.76)" }} />
      <span className="absolute right-2 top-4 h-7 w-7 rotate-[32deg] rounded-bl-full border-b border-l" style={{ borderColor: "rgba(255,143,220,0.76)" }} />
      <span className="absolute left-1/2 top-1 h-4 w-4 -translate-x-1/2 rotate-45" style={{ border: `1px solid ${sceneTokens.color.gold}`, boxShadow: sceneTokens.shadow.gold }} />
    </div>
  );
}

function GateGlyph() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full" aria-hidden style={{ background: "rgba(255,79,189,0.16)", border: `1px solid ${sceneTokens.color.lineStrong}`, boxShadow: sceneTokens.shadow.gold }}>
      <span className="relative h-5 w-4 rounded-sm border" style={{ borderColor: sceneTokens.color.gold }}>
        <span className="absolute -top-3 left-1/2 h-4 w-5 -translate-x-1/2 rounded-t-full border-l border-r border-t" style={{ borderColor: sceneTokens.color.gold }} />
      </span>
    </span>
  );
}

function ProofStatusMark({ index }: { index: string }) {
  return (
    <span
      aria-hidden
      className="relative grid h-8 w-8 place-items-center rounded-full text-[9px] font-semibold"
      style={{ background: "rgba(255,79,189,0.1)", border: `1px solid ${sceneTokens.color.line}` }}
    >
      <span style={{ color: sceneTokens.color.textMuted }}>{index}</span>
      <span className="absolute bottom-1 right-1 block h-2 w-1 rotate-45 border-b border-r" style={{ borderColor: sceneTokens.color.cyan }} />
    </span>
  );
}

function CornerLines() {
  return (
    <>
      <span aria-hidden className="absolute left-3 top-3 h-8 w-8 border-l border-t" style={{ borderColor: sceneTokens.color.lineStrong }} />
      <span aria-hidden className="absolute right-3 top-3 h-8 w-8 border-r border-t" style={{ borderColor: sceneTokens.color.lineStrong }} />
      <span aria-hidden className="absolute bottom-3 left-3 h-8 w-8 border-b border-l" style={{ borderColor: sceneTokens.color.lineStrong }} />
      <span aria-hidden className="absolute bottom-3 right-3 h-8 w-8 border-b border-r" style={{ borderColor: sceneTokens.color.lineStrong }} />
    </>
  );
}
