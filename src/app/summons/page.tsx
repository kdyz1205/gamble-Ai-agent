import PactComposer from "@/components/summons/PactComposer";
import GatewayArrival from "@/components/summons/GatewayArrival";
import SceneShell from "@/components/scene/SceneShell";
import QuestGlyph from "@/components/world/QuestGlyph";

const questPath = [
  ["spark" as const, "Say it", "One sentence"],
  ["friends" as const, "Invite", "A friend accepts"],
  ["proof" as const, "Prove", "Each person uploads"],
  ["receipt" as const, "Settle", "Pico explains why"],
] as const;

export default function SummonsPage() {
  return (
    <SceneShell activePath="/summons" particleCount={8} showSidebar tone="world">
      <GatewayArrival />
      <section className="mx-auto w-full max-w-[960px] px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <h1 className="max-w-4xl text-3xl font-black leading-tight tracking-[-0.035em] text-[color:var(--sum-ink-deep)] sm:text-4xl">
              What&apos;s the challenge?
            </h1>
            <p className="mt-2 text-sm font-medium text-[color:var(--sum-muted)]">Agree on fair rules, invite a friend, and prove the result.</p>
          </div>
          <span className="hidden items-center gap-2 rounded-full border-2 border-white/80 bg-white/60 px-3 py-2 text-[10px] font-black text-[color:var(--sum-muted)] shadow-[0_5px_0_rgba(23,53,75,0.06)] md:inline-flex">
            <QuestGlyph className="h-4 w-4 text-[#157b58]" kind="friends" />
            Friends first · explainable results
          </span>
        </div>

        <div className="min-w-0">
          <PactComposer />
        </div>

        <nav aria-label="Quest flow" className="mx-auto mt-5 grid max-w-5xl grid-cols-2 gap-2 rounded-[2rem] border-2 border-white/80 bg-[rgba(255,253,244,0.72)] p-2 shadow-[0_8px_0_rgba(23,53,75,0.07),0_18px_32px_rgba(23,53,75,0.1)] backdrop-blur sm:grid-cols-4">
          {questPath.map(([icon, title, detail], index) => (
            <div className="flex min-w-0 items-center gap-2 rounded-[1.35rem] px-3 py-2.5" key={title}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[1rem] border-2 border-white bg-[color:var(--sum-mint)] text-[color:var(--sum-ink)] shadow-[0_4px_0_rgba(23,53,75,0.1)]">
                <QuestGlyph className="h-4 w-4" kind={icon} />
              </span>
              <span className="min-w-0">
                <strong className="block text-xs font-black text-[color:var(--sum-ink)]">{index + 1}. {title}</strong>
                <small className="mt-0.5 block truncate text-[9px] font-bold text-[color:var(--sum-muted)]">{detail}</small>
              </span>
            </div>
          ))}
        </nav>
      </section>
    </SceneShell>
  );
}
