import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import SealContractButton from "@/components/contract/SealContractButton";
import { mockWorldData } from "@/lib/scene/mock-world-data";

const questChecks = [
  ["Players", "Both Summoners identified"],
  ["Win condition", "One measurable result"],
  ["Proof", "Shared before the deadline"],
  ["Credits", "Visible before acceptance"],
] as const;

export default function ContractStage() {
  const { challenger, opponent, pact } = mockWorldData.contract;

  return (
    <section className="mx-auto w-full max-w-[1280px] px-3 py-5 sm:px-5 lg:px-7 lg:py-7" data-testid="contract-stage">
      <header className="mx-auto max-w-3xl text-center">
        <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em]">Quest acceptance</span>
        <h1 className="mt-3 text-3xl font-extrabold leading-none text-[color:var(--sum-ink)] sm:text-4xl">Everyone sees the same quest.</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">
          Confirm the players, fair rules, proof, deadline, and credits before the quest begins.
        </p>
      </header>

      <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-[minmax(220px,0.72fr)_minmax(420px,1.35fr)_minmax(220px,0.72fr)]">
        <SummonerCard familiar={challenger.familiar} label={challenger.presence} name={challenger.name} tone="peach" />

        <article className="sum-world-panel relative isolate overflow-hidden p-5 sm:p-6">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[color:var(--sum-sun)] opacity-35 blur-2xl" aria-hidden />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#2a9f84]">Shared quest card</p>
              <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[color:var(--sum-ink)]">{pact.title}</h2>
            </div>
            <PicoFamiliar className="h-20 w-20 shrink-0" mood="referee" />
          </div>

          <dl className="mt-4 grid gap-2">
            {[
              ["Win condition", pact.condition.replace("Win condition: ", "")],
              ["Proof", pact.proof.replace("Proof requirement: ", "")],
              ["Credits", pact.stake.replace("Quest entry: ", "")],
            ].map(([label, value]) => (
              <div className="rounded-[18px] border border-[color:var(--sum-border)] bg-white/74 px-4 py-3" key={label}>
                <dt className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[color:var(--sum-muted)]">{label}</dt>
                <dd className="mt-1 text-sm font-bold leading-5 text-[color:var(--sum-ink)]">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 text-center">
            <SealContractButton />
            <p className="mt-2 text-[11px] font-semibold text-[color:var(--sum-muted)]">Acceptance confirms the same visible terms for both people.</p>
          </div>
        </article>

        <SummonerCard familiar={opponent.familiar} label={opponent.presence} name={opponent.name} tone="mint" />
      </div>

      <section className="sum-world-panel mt-4 p-4 sm:p-5" aria-label="Fair quest checklist">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {questChecks.map(([label, value], index) => (
            <div className="rounded-[18px] border border-[color:var(--sum-border)] bg-white/72 p-3" key={label}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--sum-mint)] text-xs font-extrabold text-[color:var(--sum-ink)]">{index + 1}</span>
              <p className="mt-2 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--sum-muted)]">{label}</p>
              <p className="mt-1 text-sm font-extrabold text-[color:var(--sum-ink)]">{value}</p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function SummonerCard({ familiar, label, name, tone }: { familiar: string; label: string; name: string; tone: "peach" | "mint" }) {
  return (
    <aside className="sum-world-panel flex flex-col items-center justify-center p-5 text-center">
      <span className="rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[color:var(--sum-ink)]" style={{ background: tone === "peach" ? "var(--sum-peach)" : "var(--sum-mint)" }}>
        {label}
      </span>
      <PicoFamiliar className="mt-4 h-28 w-28" mood={tone === "peach" ? "guide" : "referee"} />
      <h2 className="mt-2 text-xl font-extrabold text-[color:var(--sum-ink)]">{name}</h2>
      <p className="mt-1 text-xs font-semibold text-[color:var(--sum-muted)]">Familiar · {familiar}</p>
      <p className="mt-4 rounded-full border border-[color:var(--sum-border)] bg-white/76 px-3 py-2 text-[11px] font-extrabold text-[#2a9f84]">Ready to review</p>
    </aside>
  );
}
