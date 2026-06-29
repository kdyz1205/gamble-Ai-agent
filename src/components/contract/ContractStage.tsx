import ContractBindingEffects from "@/components/contract/ContractBindingEffects";
import ContractObject from "@/components/contract/ContractObject";
import EnergyThread from "@/components/contract/EnergyThread";
import ParticipantPresence from "@/components/contract/ParticipantPresence";
import SealContractButton from "@/components/contract/SealContractButton";
import { mockWorldData } from "@/lib/scene/mock-world-data";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const ritualMetrics = [
  ["Seal Integrity", "100%", "Untouched"],
  ["Bound Terms", "4", "Immutable"],
  ["Proof Requirement", "Uploaded + Dual Proof", "Verifiable"],
  ["Time Limit", "7 Days", "Expires May 23"],
] as const;

export default function ContractStage() {
  const { challenger, opponent, pact } = mockWorldData.contract;

  return (
    <div
      className="relative mx-auto flex min-h-[calc(100vh-72px)] max-w-[1560px] flex-col px-3 py-3 sm:px-5 lg:px-7"
      data-testid="contract-stage"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-12 bottom-20 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 48%, rgba(255,79,189,0.22), transparent 28%), url('/scene/premium/portal-depth.png')",
          backgroundPosition: "center center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "min(980px, 78vw) auto",
          mixBlendMode: "screen",
          maskImage: "radial-gradient(ellipse at center, black 0%, transparent 72%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-16 bottom-20 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse at 50% 48%, rgba(255,79,189,0.24), transparent 25%), radial-gradient(ellipse at 50% 60%, rgba(139,61,255,0.17), transparent 48%), linear-gradient(90deg, transparent 0%, rgba(255,79,189,0.14) 47%, rgba(139,61,255,0.16) 53%, transparent 100%)",
          maskImage: "radial-gradient(ellipse at center, black 0%, black 46%, transparent 76%)",
        }}
        aria-hidden
      />
      <ContractBindingEffects
        className="contract-webgl-layer z-[2] hidden opacity-80 lg:block"
        style={{ left: "22%", right: "22%", top: "18%", bottom: "17%" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[57%] h-64 w-[52%] -translate-x-1/2 rounded-[50%] opacity-55"
        style={{
          border: `1px solid ${sceneTokens.color.line}`,
          boxShadow: "0 0 86px rgba(255,79,189,0.16), inset 0 0 60px rgba(139,61,255,0.08)",
          transform: "translateX(-50%) perspective(620px) rotateX(64deg)",
        }}
      />

      <header className="contract-ritual-header relative z-10 mx-auto mb-2 max-w-[920px] text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.42em]" style={{ color: sceneTokens.color.gold }}>
          When everyone accepts, this quest becomes clear.
        </p>
        <h1 className="mt-1.5 text-lg font-semibold uppercase tracking-[0.2em] sm:text-2xl sm:tracking-[0.36em]" style={{ color: sceneTokens.color.text }}>
          Quest Acceptance
        </h1>
      </header>

      <EnergyThread side="left" />
      <EnergyThread side="right" />

      <div className="contract-ritual-grid relative z-10 grid flex-1 items-center gap-3 lg:grid-cols-[minmax(240px,0.82fr)_minmax(390px,1.16fr)_minmax(240px,0.82fr)] lg:grid-rows-[minmax(0,1fr)_auto]">
        <div className="order-3 lg:order-1">
          <ParticipantPresence {...challenger} align="left" />
        </div>
        <div className="order-1 lg:order-2">
          <ContractObject {...pact} />
        </div>
        <div className="order-4 lg:order-3">
          <ParticipantPresence {...opponent} align="right" />
        </div>

        <footer
          className="contract-ritual-footer qx-award-surface order-2 z-30 grid gap-3 overflow-hidden rounded-lg p-2.5 lg:order-4 lg:col-span-3 lg:grid-cols-[1fr_auto_1fr]"
          style={{
            background: "linear-gradient(90deg, rgba(5,0,10,0.74), rgba(18,4,28,0.72), rgba(5,0,10,0.74))",
            border: `1px solid ${sceneTokens.color.line}`,
            boxShadow: "0 18px 70px rgba(0,0,0,0.36)",
            backdropFilter: "blur(22px)",
          }}
        >
          <span aria-hidden className="qx-corner-frame" />
          <div className="order-2 grid gap-2 sm:grid-cols-2 lg:order-none">
            {ritualMetrics.slice(0, 2).map(([label, value, detail]) => (
              <Metric key={label} label={label} value={value} detail={detail} />
            ))}
          </div>
          <div className="order-1 flex flex-col items-center justify-center lg:order-none">
            <SealContractButton />
            <p className="contract-seal-note mt-2 hidden text-center text-xs min-[1400px]:block" style={{ color: sceneTokens.color.textMuted }}>
              Accepting locks the quest terms for this preview.
            </p>
          </div>
          <div className="order-3 grid gap-2 sm:grid-cols-2 lg:order-none">
            {ritualMetrics.slice(2).map(([label, value, detail]) => (
              <Metric key={label} label={label} value={value} detail={detail} />
            ))}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Metric({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <div className="contract-metric rounded-lg px-3 py-2" style={{ background: "rgba(244,239,255,0.03)", border: `1px solid ${sceneTokens.color.line}` }}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.gold }}>
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
        {value}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: sceneTokens.color.textMuted }}>
        {detail}
      </p>
    </div>
  );
}
