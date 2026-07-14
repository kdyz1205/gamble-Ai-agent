import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import RitualButton from "@/components/scene/RitualButton";
import SceneShell from "@/components/scene/SceneShell";

const participants = [
  { name: "Mira", role: "Quest creator", proof: "3 items", tone: "peach" as const },
  { name: "Ren", role: "Challenger", proof: "2 items", tone: "mint" as const },
] as const;

const proofEvents = [
  ["Quest accepted", "Both players"],
  ["Mira submitted", "Continuous video"],
  ["Ren submitted", "Match record"],
  ["Familiar review", "Opens when ready"],
] as const;

export default function DuelDemoPage() {
  return (
    <SceneShell activePath="/duel/demo" particleCount={24} tone="contract">
      <section className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
        <header className="mx-auto max-w-3xl text-center">
          <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em]">Proof portal</span>
          <h1 className="mt-3 text-3xl font-extrabold leading-none text-[color:var(--sum-ink)] sm:text-4xl">Bring the quest proof together.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">
            Each Summoner uploads their own record. Pico keeps the files attributed, ordered, and ready for a fair result.
          </p>
        </header>

        <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(440px,1.35fr)_minmax(220px,0.7fr)]">
          <ParticipantProofCard {...participants[0]} align="left" />
          <ProofPortalStage />
          <ParticipantProofCard {...participants[1]} align="right" />
        </div>

        <EvidenceTimeline />
      </section>
    </SceneShell>
  );
}

function ParticipantProofCard({ align, name, proof, role, tone }: { align: "left" | "right"; name: string; proof: string; role: string; tone: "peach" | "mint" }) {
  return (
    <aside className="sum-world-panel flex flex-col items-center justify-center p-5 text-center" data-testid={`duel-proof-panel-${align}`}>
      <span className="rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--sum-ink)]" style={{ background: tone === "peach" ? "var(--sum-peach)" : "var(--sum-mint)" }}>{role}</span>
      <PicoFamiliar className="mt-4 h-28 w-28" mood={tone === "peach" ? "guide" : "referee"} />
      <h2 className="mt-2 text-xl font-extrabold text-[color:var(--sum-ink)]">{name}</h2>
      <p className="mt-1 text-xs font-semibold text-[color:var(--sum-muted)]">{proof} submitted</p>
      <div className="mt-4 flex gap-1.5" aria-label={`${proof} submitted`}>
        {Array.from({ length: 3 }).map((_, index) => (
          <span className="h-3 w-3 rounded-full" key={index} style={{ background: index < Number(proof[0]) ? "var(--sum-mint)" : "rgba(96,117,138,0.18)" }} />
        ))}
      </div>
    </aside>
  );
}

function ProofPortalStage() {
  return (
    <section className="sum-world-panel relative isolate min-h-[430px] overflow-hidden p-5 sm:p-6" data-testid="proof-altar-stage">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[color:var(--sum-sun)] opacity-30 blur-3xl" aria-hidden />
      <div className="absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-[color:var(--sum-mint)] opacity-30 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Shared proof bundle</p>
          <h2 className="mt-2 text-2xl font-extrabold text-[color:var(--sum-ink)]">First to 3 badminton rallies</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">No scoreboard required · one continuous clip recommended</p>
        </div>
        <PicoFamiliar className="h-20 w-20 shrink-0" mood="referee" />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {[
          ["Video", "Mira · 01:42"],
          ["Player ID", "Blue / white shirts"],
          ["Match note", "First to 3 rallies"],
          ["Deadline", "Today · 8:00 PM"],
        ].map(([label, value], index) => (
          <article className="rounded-[18px] border border-[color:var(--sum-border)] bg-white/76 p-3" key={label}>
            <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-extrabold text-[color:var(--sum-ink)]" style={{ background: index % 2 ? "var(--sum-mint)" : "var(--sum-peach)" }}>{index + 1}</span>
            <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--sum-muted)]">{label}</p>
            <p className="mt-1 text-sm font-extrabold text-[color:var(--sum-ink)]">{value}</p>
          </article>
        ))}
      </div>

      <div className="mt-4 rounded-[20px] border border-[rgba(143,230,193,0.54)] bg-[rgba(143,230,193,0.18)] p-4 text-center">
        <p className="text-xs font-semibold leading-5 text-[color:var(--sum-muted)]">Pico will return rally winners only. The app derives the running score and routes unclear moments to review.</p>
        <RitualButton className="mt-3 min-h-12 w-full px-8 text-sm sm:w-auto" data-testid="present-evidence-button" type="button">Submit proof</RitualButton>
      </div>
    </section>
  );
}

function EvidenceTimeline() {
  return (
    <section className="sum-world-panel mt-4 p-4 sm:p-5" data-testid="evidence-timeline">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Proof timeline</p>
          <h2 className="mt-1 text-xl font-extrabold text-[color:var(--sum-ink)]">Every record stays attributed</h2>
        </div>
        <p className="text-xs font-semibold text-[color:var(--sum-muted)]">Familiar review opens after required proof arrives.</p>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {proofEvents.map(([label, detail], index) => (
          <article className="rounded-[18px] border border-[color:var(--sum-border)] bg-white/72 p-3" key={label}>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--sum-mint)] text-xs font-extrabold text-[color:var(--sum-ink)]">{index + 1}</span>
            <h3 className="mt-2 text-sm font-extrabold text-[color:var(--sum-ink)]">{label}</h3>
            <p className="mt-1 text-[11px] font-semibold text-[color:var(--sum-muted)]">{detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
