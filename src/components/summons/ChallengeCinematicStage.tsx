import type { CSSProperties } from "react";
import QuixMark from "@/components/scene/QuixMark";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const telemetry = [
  ["Input", "Natural language"],
  ["Credits", "Internal only"],
  ["Proof", "Proof timed"],
] as const;

const contractRows = [
  ["Quest", "measurable challenge"],
  ["Credits", "internal credits + invite mode"],
  ["Proof", "proof source + deadline"],
  ["Familiar", "AI reasoning + receipt"],
] as const;

const engineHud = [
  ["Parse", "intent becomes terms"],
  ["Compile", "credits attach to rules"],
  ["Referee", "proof becomes result"],
  ["Receipt", "share trail remains"],
] as const;

const engineParticles = Array.from({ length: 10 }, (_, index) => index);

export default function ChallengeCinematicStage() {
  return (
    <aside
      className="qx-award-surface qx-cinematic-stage relative isolate hidden h-full min-h-[640px] overflow-hidden rounded-lg p-5 xl:block"
      data-testid="challenge-cinematic-stage"
      style={{
        background:
          "linear-gradient(135deg, rgba(10,0,18,0.86), rgba(3,0,8,0.76)), radial-gradient(circle at 52% 18%, rgba(255,79,189,0.22), transparent 34%)",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: "0 34px 140px rgba(0,0,0,0.58), inset 0 0 96px rgba(255,79,189,0.045)",
        backdropFilter: "blur(24px)",
      }}
    >
      <span aria-hidden className="qx-stage-reference" />
      <span aria-hidden className="qx-stage-depth" />
      <span aria-hidden className="qx-stage-bloom" />
      <span aria-hidden className="qx-stage-ring qx-stage-ring-a" />
      <span aria-hidden className="qx-stage-ring qx-stage-ring-b" />
      <span aria-hidden className="qx-stage-scan" />
      <span aria-hidden className="qx-corner-frame" />

      <div className="qx-engine-header relative z-10 flex items-start justify-between gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
            Quest Engine
          </p>
          <h2 className="mt-3 text-4xl font-semibold leading-[0.96] min-[1440px]:text-5xl" style={{ color: sceneTokens.color.text }}>
            Summon
            <span className="block" style={{ color: sceneTokens.color.gold }}>
              the quest.
            </span>
          </h2>
          <p className="mt-3 max-w-[360px] text-sm leading-6" style={{ color: sceneTokens.color.textMuted }}>
            A single sentence becomes rules, credits, proof, invite, and receipt path.
          </p>
        </div>
        <div className="grid shrink-0 gap-1.5 text-right">
          {telemetry.map(([label, value]) => (
            <div key={label} className="qx-engine-telemetry rounded-md px-3 py-2">
              <p>{label}</p>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="qx-engine-theater relative z-10 mt-4 min-[1440px]:mt-5">
        <span aria-hidden className="qx-engine-grid" />
        <span aria-hidden className="qx-engine-horizon" />
        <span aria-hidden className="qx-engine-halo qx-engine-halo-main" />
        <span aria-hidden className="qx-engine-halo qx-engine-halo-secondary" />
        <span aria-hidden className="qx-engine-beam qx-engine-beam-a" />
        <span aria-hidden className="qx-engine-beam qx-engine-beam-b" />
        {engineParticles.map((index) => (
          <span
            key={index}
            aria-hidden
            className="qx-engine-particle"
            style={{
              "--particle-index": index,
              "--particle-left": `${12 + ((index * 17) % 76)}%`,
              "--particle-top": `${18 + ((index * 23) % 62)}%`,
              "--particle-delay": `${index * 180}ms`,
            } as CSSProperties}
          />
        ))}

        <div className="qx-engine-core">
          <span aria-hidden className="qx-engine-core-glow" />
          <QuixMark className="h-10 w-10" />
        </div>

        <div className="qx-engine-contract-slab">
          <p>AI Quest Core</p>
          <h3>Sentence to proof to receipt</h3>
          <dl>
            {contractRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="qx-engine-hud relative z-10 mt-3 grid grid-cols-4 gap-2">
        {engineHud.map(([label, value], index) => (
          <div
            key={label}
            className="qx-engine-hud-item rounded-lg p-2.5"
            style={{ "--hud-delay": `${index * 90}ms` } as CSSProperties}
          >
            <p>{label}</p>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
