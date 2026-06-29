import RitualForgeEffects from "@/components/rituals/RitualForgeEffects";
import RitualButton from "@/components/scene/RitualButton";
import SceneShell from "@/components/scene/SceneShell";
import QuixMark from "@/components/scene/QuixMark";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const upgrades = [
  {
    name: "Edge Amplifier",
    effect: "+6 XP streak",
    status: "Ready",
    detail: "Sharpens Familiar prep before the next live quest.",
  },
  {
    name: "Oracle Lens",
    effect: "+12 proof clarity",
    status: "Charging",
    detail: "Filters noisy proof into review-ready signal.",
  },
  {
    name: "Seal Resonance",
    effect: "+3 rule checks",
    status: "Ready",
    detail: "Stabilizes quest language before commitment.",
  },
] as const;

const forgeQueue = [
  ["Primary Core", "OracleX resonance", "92%"],
  ["Trait Feed", "Edge Amplifier I", "68%"],
  ["Seal Memory", "Quest rules", "84%"],
] as const;

const telemetry = [
  ["Familiar Bias", "Proof clarity"],
  ["Stability", "System green"],
  ["Safety Gate", "No result move"],
] as const;

export default function RitualsPage() {
  return (
    <SceneShell activePath="/rituals" particleCount={44} tone="contract">
      <section className="mx-auto flex min-h-[calc(100svh-72px)] w-full max-w-[1500px] flex-col gap-3 px-3 py-3 sm:px-5 lg:px-6">
        <header className="relative z-10 flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.34em]" style={{ color: sceneTokens.color.gold }}>
              Familiars / Prep
            </p>
            <h1 className="mt-2 text-3xl font-semibold leading-[1.08] tracking-[0.02em] sm:text-4xl" style={{ color: sceneTokens.color.text }}>
              Prepare your Familiar.
            </h1>
          </div>
          <p className="max-w-xl text-sm leading-6 lg:text-right" style={{ color: sceneTokens.color.textMuted }}>
            Upgrade traits before the next quest. Every prep step strengthens proof quality, Familiar clarity, or quest integrity.
          </p>
        </header>

        <div className="grid flex-1 gap-3 lg:grid-cols-[minmax(230px,0.78fr)_minmax(420px,1.28fr)_minmax(230px,0.78fr)]">
          <RitualQueuePanel />
          <ForgeChamber />
          <TelemetryPanel />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {upgrades.map((upgrade) => (
            <UpgradeCard key={upgrade.name} {...upgrade} />
          ))}
        </div>
      </section>
    </SceneShell>
  );
}

function RitualQueuePanel() {
  return (
    <aside
      className="qx-award-surface relative isolate order-2 overflow-hidden rounded-lg p-3.5 lg:order-none"
      data-testid="ritual-queue-panel"
      style={{
        background: "linear-gradient(180deg, rgba(18,4,28,0.78), rgba(5,0,10,0.78))",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.panel,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
        Familiar Queue
      </p>
      <div className="mt-3 space-y-2.5">
        {forgeQueue.map(([label, value, progress]) => (
          <div
            className="rounded-lg p-3"
            key={label}
            style={{
              background: "rgba(244,239,255,0.035)",
              border: `1px solid ${sceneTokens.color.line}`,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: sceneTokens.color.text }}>
                  {label}
                </p>
                <p className="mt-1 text-xs" style={{ color: sceneTokens.color.textMuted }}>
                  {value}
                </p>
              </div>
              <p className="text-sm font-semibold tabular-nums" style={{ color: sceneTokens.color.gold }}>
                {progress}
              </p>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(244,239,255,0.08)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: progress,
                  background: `linear-gradient(90deg, ${sceneTokens.color.gold}, ${sceneTokens.color.violet}, ${sceneTokens.color.cyan})`,
                  boxShadow: sceneTokens.shadow.gold,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function ForgeChamber() {
  return (
    <section
      className="qx-award-surface relative isolate order-1 min-h-[360px] overflow-hidden rounded-lg lg:order-none lg:min-h-[430px]"
      data-testid="ritual-forge-chamber"
      style={{
        background:
          "linear-gradient(180deg, rgba(3,0,8,0.04), rgba(3,0,8,0.46) 58%, rgba(3,0,8,0.9)), url('/scene/quixnova/rituals/proof-crystal.png')",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.seal,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <RitualForgeEffects className="z-[2] hidden opacity-90 sm:block" />
      <div
        aria-hidden
        className="absolute left-1/2 top-[45%] z-[1] h-[62%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-80"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,79,189,0.28), rgba(139,61,255,0.18) 36%, transparent 70%)",
          filter: "blur(18px)",
          mixBlendMode: "screen",
        }}
      />
      <div className="absolute inset-0 z-10 grid place-items-center">
        <div
          className="grid h-28 w-28 place-items-center rounded-full sm:h-36 sm:w-36"
          style={{
            background: "radial-gradient(circle, rgba(255,79,189,0.18), rgba(5,0,10,0.24) 64%)",
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: "0 0 66px rgba(255,79,189,0.28), inset 0 0 42px rgba(139,61,255,0.16)",
            color: sceneTokens.color.gold,
          }}
        >
          <QuixMark className="h-14 w-14 sm:h-20 sm:w-20" />
        </div>
      </div>
      <div
        className="absolute inset-x-5 bottom-4 z-20 rounded-lg px-4 py-3 text-center sm:inset-x-[18%]"
        style={{
          background: "linear-gradient(180deg, rgba(255,79,189,0.12), rgba(5,0,10,0.78))",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: "0 0 48px rgba(255,79,189,0.2), inset 0 0 44px rgba(255,79,189,0.06)",
          backdropFilter: "blur(14px)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
          Familiar Prep
        </p>
        <RitualButton className="mt-2 min-h-11 w-full px-8 text-xs sm:w-auto" data-testid="begin-fusion-button" type="button">
          Begin Prep
        </RitualButton>
      </div>
    </section>
  );
}

function TelemetryPanel() {
  return (
    <aside
      className="qx-award-surface relative isolate order-3 overflow-hidden rounded-lg p-3.5 lg:order-none"
      data-testid="ritual-telemetry-panel"
      style={{
        background: "linear-gradient(180deg, rgba(18,4,28,0.78), rgba(5,0,10,0.78))",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: sceneTokens.shadow.panel,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.gold }}>
        Resonance
      </p>
      <div className="mt-3 grid gap-2.5">
        {telemetry.map(([label, value]) => (
          <div
            className="rounded-lg p-3"
            key={label}
            style={{
              background: "rgba(244,239,255,0.035)",
              border: `1px solid ${sceneTokens.color.line}`,
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: sceneTokens.color.textFaint }}>
              {label}
            </p>
            <p className="mt-2 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
              {value}
            </p>
          </div>
        ))}
      </div>
      <div
        className="mt-3 rounded-lg p-3"
        style={{
          background: "linear-gradient(135deg, rgba(0,240,181,0.08), rgba(255,79,189,0.07))",
          border: "1px solid rgba(0,240,181,0.22)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: sceneTokens.color.cyan }}>
          Output
        </p>
        <p className="mt-2 text-sm leading-5" style={{ color: sceneTokens.color.textMuted }}>
          Safer Familiar upgrades without moving credits, proof, or result state.
        </p>
      </div>
    </aside>
  );
}

function UpgradeCard({
  detail,
  effect,
  name,
  status,
}: {
  detail: string;
  effect: string;
  name: string;
  status: "Ready" | "Charging";
}) {
  const ready = status === "Ready";

  return (
    <article
      className="qx-award-card relative isolate overflow-hidden rounded-lg p-4"
      data-testid={`ritual-upgrade-${name.toLowerCase().replaceAll(" ", "-")}`}
      style={{
        background: "linear-gradient(180deg, rgba(18,4,28,0.84), rgba(5,0,10,0.74))",
        border: `1px solid ${ready ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
        boxShadow: ready ? "0 0 42px rgba(255,79,189,0.1)" : "none",
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em]" style={{ color: ready ? sceneTokens.color.gold : sceneTokens.color.textFaint }}>
        {status}
      </p>
      <div className="mt-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: sceneTokens.color.text }}>
            {name}
          </h2>
          <p className="mt-1 text-sm" style={{ color: sceneTokens.color.textMuted }}>
            {effect}
          </p>
        </div>
        <span
          aria-hidden
          className="h-9 w-9 rotate-45 rounded-md"
          style={{
            background: ready
              ? `linear-gradient(135deg, ${sceneTokens.color.gold}, ${sceneTokens.color.violet})`
              : "rgba(244,239,255,0.055)",
            border: `1px solid ${ready ? sceneTokens.color.lineStrong : sceneTokens.color.line}`,
            boxShadow: ready ? sceneTokens.shadow.gold : "none",
          }}
        />
      </div>
      <p className="mt-3 min-h-10 text-sm leading-5" style={{ color: sceneTokens.color.textMuted }}>
        {detail}
      </p>
      <RitualButton className="mt-4 min-h-11 w-full text-xs" disabled={!ready} type="button" variant={ready ? "primary" : "ghost"}>
        {ready ? "Begin Prep" : "Charging"}
      </RitualButton>
    </article>
  );
}
