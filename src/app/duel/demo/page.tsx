import RitualButton from "@/components/scene/RitualButton";
import SceneShell from "@/components/scene/SceneShell";
import DuelProofEffects from "@/components/duel/DuelProofEffects";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const participants = [
  {
    role: "Challenger",
    name: "OracleX",
    title: "Sentient Predictor",
    grade: "S+",
    image: "/scene/quixnova/familiars/oraclex.png",
    proof: "3 / 5",
    progress: "72%",
    accent: "rgba(255,79,189,0.44)",
  },
  {
    role: "Challenger",
    name: "EdgeHound",
    title: "Momentum Hunter",
    grade: "A+",
    image: "/scene/quixnova/familiars/edgehound.png",
    proof: "2 / 5",
    progress: "58%",
    accent: "rgba(139,61,255,0.46)",
  },
] as const;

const proofTablets = [
  ["Chart", "Fragment"],
  ["Activity", "Log"],
  ["Photo", "Proof"],
  ["Link", "Proof"],
] as const;

const proofTabletPositions = [
  { left: "14%", top: "27%", rotate: -12 },
  { right: "14%", top: "27%", rotate: 12 },
  { left: "18%", top: "45%", rotate: -13 },
  { right: "18%", top: "45%", rotate: 13 },
] as const;

const evidenceEvents = [
  ["Quest Accepted", "10:12 AM", "done"],
  ["OracleX Submitted", "10:15 AM", "done"],
  ["EdgeHound Submitted", "10:17 AM", "done"],
  ["Photo Proof", "10:21 AM", "done"],
  ["Next Window", "11:10 AM", "active"],
  ["Familiar Review", "11:30 AM", "pending"],
] as const;

const conditions = [
  ["Proof Window", "Open"],
  ["Minimum Proof", "Not yet met by both sides"],
  ["Result Type", "Familiar Referee"],
] as const;

export default function DuelDemoPage() {
  return (
    <SceneShell activePath="/duel/demo" particleCount={42} tone="contract">
      <section className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-[1560px] flex-col gap-2.5 px-3 py-3 sm:px-5 lg:px-6">
        <header className="relative z-10 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: sceneTokens.color.gold }}>
            Proof Arena
          </p>
          <h1 className="mt-1.5 text-3xl font-semibold uppercase leading-[1.12] tracking-[0.28em] sm:text-4xl" style={{ color: sceneTokens.color.text }}>
            Proof Portal
          </h1>
          <p className="mt-2 text-sm" style={{ color: sceneTokens.color.textMuted }}>
            Submit clear proof. Ask the Familiar for a result.
          </p>
        </header>

        <div className="grid flex-1 gap-2.5 lg:grid-cols-[minmax(248px,0.78fr)_minmax(430px,1.24fr)_minmax(248px,0.78fr)]">
          <div className="order-2 lg:order-1">
            <ParticipantProofCard {...participants[0]} />
          </div>
          <div className="order-1 lg:order-2">
            <ProofAltarStage />
          </div>
          <div className="order-3">
            <ParticipantProofCard {...participants[1]} align="right" />
          </div>
        </div>

        <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_292px]">
          <EvidenceTimeline />
          <JudgmentConditions />
        </div>
      </section>
    </SceneShell>
  );
}

function ParticipantProofCard({
  accent,
  align = "left",
  grade,
  image,
  name,
  progress,
  proof,
  role,
  title,
}: {
  accent: string;
  align?: "left" | "right";
  grade: string;
  image: string;
  name: string;
  progress: string;
  proof: string;
  role: string;
  title: string;
}) {
  const right = align === "right";

  return (
    <aside
      className="qx-award-surface relative isolate h-full min-h-[360px] overflow-hidden rounded-lg p-3.5 min-[1500px]:p-4"
      data-testid={`duel-proof-panel-${align}`}
      style={{
        background: "linear-gradient(180deg, rgba(18,4,28,0.78), rgba(5,0,10,0.84))",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: `0 24px 90px rgba(0,0,0,0.36), 0 0 54px ${accent}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-35"
        style={{
          background:
            "linear-gradient(rgba(255,79,189,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(139,61,255,0.12) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at 50% 18%, black 0%, transparent 68%)",
        }}
      />
      <span aria-hidden className="qx-corner-frame" />
      <div className={`flex items-start justify-between gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em]" style={{ color: right ? "#caa6ff" : sceneTokens.color.gold }}>
          {role}
        </p>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{ background: "rgba(244,239,255,0.045)", border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.text }}
        >
          {grade}
        </span>
      </div>

      <div className={`mt-3 flex items-center gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
        <div
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full min-[1500px]:h-28 min-[1500px]:w-28"
          style={{
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: `0 0 46px ${accent}`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 scale-110"
            style={{
              backgroundImage: `linear-gradient(180deg, rgba(3,0,8,0.04), rgba(3,0,8,0.36)), url('${image}')`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold leading-[1.12] xl:text-xl" style={{ color: sceneTokens.color.text }}>
            {name}
          </h2>
          <p className="mt-2 text-sm" style={{ color: sceneTokens.color.textMuted }}>
            {title}
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: sceneTokens.color.textFaint }}>
            Quest Status
          </p>
          <p className="rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: sceneTokens.color.cyan, background: "rgba(0,240,181,0.08)", border: "1px solid rgba(0,240,181,0.22)" }}>
            Active
          </p>
        </div>
        <div className="mt-3 rounded-lg p-3" style={{ background: "rgba(5,0,10,0.38)", border: `1px solid ${sceneTokens.color.line}` }}>
          <p className="text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
            Edge Amplifier I
          </p>
          <p className="mt-1 text-xs" style={{ color: sceneTokens.color.textMuted }}>
            Quest clarity +6 XP
          </p>
        </div>
      </div>

      <div className="mt-2.5 rounded-lg p-3" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: sceneTokens.color.textFaint }}>
          Time Remaining
        </p>
        <p className="mt-2 text-2xl font-semibold tabular-nums" style={{ color: sceneTokens.color.gold }}>
          22:47:19
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(244,239,255,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: progress, background: `linear-gradient(90deg, ${sceneTokens.color.gold}, ${sceneTokens.color.violet})`, boxShadow: sceneTokens.shadow.gold }} />
        </div>
      </div>

      <div className="mt-2.5 rounded-lg p-3" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: sceneTokens.color.textFaint }}>
          Proof Submitted
          </p>
          <p className="text-lg font-semibold" style={{ color: sceneTokens.color.text }}>
            {proof}
          </p>
        </div>
        <div className="mt-3 flex items-center gap-3">
          {Array.from({ length: 5 }).map((_, index) => {
            const active = index < Number(proof.slice(0, 1));
            return (
              <span
                aria-hidden
                className="relative h-6 w-6 rotate-45 rounded-[5px]"
                key={index}
                style={{
                  background: active
                    ? `linear-gradient(135deg, ${sceneTokens.color.gold}, ${sceneTokens.color.violet})`
                    : "rgba(244,239,255,0.055)",
                  border: `1px solid ${active ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
                  boxShadow: active ? sceneTokens.shadow.gold : "none",
                }}
              />
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ProofAltarStage() {
  return (
    <section
      className="qx-award-surface relative isolate min-h-[420px] overflow-hidden rounded-lg min-[1500px]:min-h-[452px]"
      data-testid="proof-altar-stage"
      style={{
        background:
          "linear-gradient(180deg, rgba(3,0,8,0.03), rgba(3,0,8,0.38) 58%, rgba(3,0,8,0.88)), url('/scene/quixnova/rituals/proof-crystal.png')",
        backgroundPosition: "center center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.seal,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <DuelProofEffects className="z-[2] hidden opacity-90 sm:block" />
      <div
        aria-hidden
        className="absolute left-1/2 top-[15%] z-[1] h-[52%] w-[46%] -translate-x-1/2 rounded-full opacity-70"
        style={{
          background: "radial-gradient(ellipse at 50% 56%, rgba(255,79,189,0.28), rgba(139,61,255,0.18) 34%, transparent 68%)",
          filter: "blur(18px)",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-12 bottom-16 z-[1] h-28 rounded-[50%]"
        style={{
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: "0 0 76px rgba(255,79,189,0.24), inset 0 0 44px rgba(139,61,255,0.14)",
          transform: "perspective(620px) rotateX(64deg)",
        }}
      />
      {proofTablets.map(([label, sublabel], index) => {
        const position = proofTabletPositions[index];
        return (
        <div
          aria-hidden
          className="absolute z-10 hidden w-24 rounded-lg px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] sm:block"
          key={label}
          style={{
            left: "left" in position ? position.left : undefined,
            right: "right" in position ? position.right : undefined,
            top: position.top,
            background: "linear-gradient(180deg, rgba(255,79,189,0.18), rgba(139,61,255,0.12))",
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: `0 0 44px ${index % 2 ? "rgba(139,61,255,0.3)" : "rgba(255,79,189,0.28)"}`,
            color: sceneTokens.color.text,
            transform: `rotate(${position.rotate}deg)`,
          }}
        >
          <span className="block">{label}</span>
          <span className="mt-1 block text-[9px]" style={{ color: sceneTokens.color.textMuted }}>
            {sublabel}
          </span>
        </div>
        );
      })}

      <div
        aria-hidden
        className="absolute inset-x-[16%] top-[48%] z-10 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,79,189,0.7), rgba(139,61,255,0.5), transparent)", boxShadow: sceneTokens.shadow.gold }}
      />
      <div
        className="absolute inset-x-5 bottom-4 z-20 rounded-lg px-4 py-3 text-center sm:inset-x-[17%]"
        style={{
          background: "linear-gradient(180deg, rgba(255,79,189,0.12), rgba(5,0,10,0.74))",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: "0 0 48px rgba(255,79,189,0.2), inset 0 0 44px rgba(255,79,189,0.06)",
          backdropFilter: "blur(14px)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: sceneTokens.color.gold }}>
          Submit Proof
        </p>
        <RitualButton className="mt-2 min-h-12 w-full px-8 text-sm sm:w-auto" data-testid="present-evidence-button" type="button">
          Submit Proof
        </RitualButton>
        <p className="mt-2 text-xs" style={{ color: sceneTokens.color.textMuted }}>
          Both sides may submit proof before the Familiar reviews the quest.
        </p>
      </div>
    </section>
  );
}

function EvidenceTimeline() {
  return (
    <section className="qx-award-surface relative overflow-hidden rounded-lg p-2.5" data-testid="evidence-timeline" style={{ background: "rgba(5,0,10,0.66)", border: `1px solid ${sceneTokens.color.line}`, boxShadow: sceneTokens.shadow.panel }}>
      <span aria-hidden className="qx-corner-frame" />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
            Proof Timeline
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.textFaint }}>
            6 events
          </p>
        </div>
        <p className="hidden text-xs sm:block" style={{ color: sceneTokens.color.textMuted }}>
          Familiar review opens after both proof sets resolve.
        </p>
      </div>
      <div className="mt-2.5 grid gap-2 md:grid-cols-6">
        {evidenceEvents.map(([label, time, status], index) => {
          const active = status !== "pending";
          return (
            <div key={label} className="relative rounded-lg px-2 py-2 text-center" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${active ? sceneTokens.color.lineStrong : sceneTokens.color.line}` }}>
              <span
                aria-hidden
                className="mx-auto block h-6 w-6 rounded-full"
                style={{
                  background: active ? `radial-gradient(circle, ${sceneTokens.color.gold}, rgba(139,61,255,0.38), rgba(5,0,10,0.78))` : "rgba(244,239,255,0.06)",
                  border: `1px solid ${active ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
                  boxShadow: active ? sceneTokens.shadow.gold : "none",
                }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-[20px] h-9 w-9 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[6px] opacity-35"
                style={{
                  border: `1px solid ${active ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
                  boxShadow: active ? "0 0 28px rgba(255,79,189,0.18)" : "none",
                }}
              />
              {index < evidenceEvents.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[calc(50%+14px)] right-[-18px] top-[20px] hidden h-px md:block"
                  style={{ background: active ? "linear-gradient(90deg, rgba(255,79,189,0.58), rgba(139,61,255,0.22))" : sceneTokens.color.line }}
                />
              )}
              <p className="mt-2 text-[11px] font-semibold leading-tight" style={{ color: sceneTokens.color.text }}>
                {label}
              </p>
              <p className="mt-0.5 text-[11px]" style={{ color: sceneTokens.color.textMuted }}>
                {time}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function JudgmentConditions() {
  return (
    <aside className="qx-award-surface relative overflow-hidden rounded-lg p-3" style={{ background: "rgba(5,0,10,0.66)", border: `1px solid ${sceneTokens.color.line}`, boxShadow: sceneTokens.shadow.panel }}>
      <span aria-hidden className="qx-corner-frame" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
        Result Conditions
      </p>
      <div className="mt-3 space-y-2">
        {conditions.map(([label, value]) => (
          <div key={label} className="rounded-lg p-2.5" style={{ background: "rgba(244,239,255,0.035)", border: `1px solid ${sceneTokens.color.line}` }}>
            <p className="text-xs font-semibold" style={{ color: sceneTokens.color.text }}>
              {label}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: sceneTokens.color.textMuted }}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
