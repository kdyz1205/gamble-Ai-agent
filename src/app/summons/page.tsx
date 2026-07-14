import PactComposer from "@/components/summons/PactComposer";
import GatewayArrival from "@/components/summons/GatewayArrival";
import ChallengeCinematicStage from "@/components/summons/ChallengeCinematicStage";
import SceneShell from "@/components/scene/SceneShell";

const questIdeas = [
  ["Friendly match", "First to 3 badminton rallies", "Continuous video"],
  ["Habit streak", "No sugary drinks for 7 days", "Daily check-in"],
  ["Skill quest", "Solve a chess puzzle in under 2 min", "Screen recording"],
] as const;

const questPath = [
  ["1", "Say it naturally", "Tell Pico the challenge as you would tell a friend."],
  ["2", "Confirm fair terms", "Choose credits, opponent, proof, and deadline."],
  ["3", "Complete together", "Both people can see the same quest rules."],
  ["4", "Submit proof", "Upload one clear, traceable record of what happened."],
  ["5", "Get a receipt", "Pico explains the result before credits update."],
] as const;

export default function SummonsPage() {
  return (
    <SceneShell activePath="/summons" particleCount={24} showSidebar={false} tone="world">
      <GatewayArrival />
      <section className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 px-3 py-4 sm:px-5 lg:px-6 lg:py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em]">Quest Meadow</span>
            <h1 className="mt-3 text-3xl font-extrabold leading-none text-[color:var(--sum-ink)] sm:text-4xl">What do you want to challenge?</h1>
            <p className="mt-2 text-sm font-semibold text-[color:var(--sum-muted)]">One sentence is enough. Pico will ask only what is missing.</p>
          </div>
          <p className="rounded-full border border-[color:var(--sum-border)] bg-white/72 px-3 py-2 text-xs font-bold text-[color:var(--sum-muted)]">
            Friends first · internal credits · explainable results
          </p>
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]">
          <PactComposer />
          <ChallengeCinematicStage />
        </div>

        <section className="sum-world-panel p-4 sm:p-5" aria-labelledby="quest-path-title">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#2a9f84]">Your quest path</p>
              <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--sum-ink)]" id="quest-path-title">Sentence → fair result</h2>
            </div>
            <p className="max-w-md text-xs font-semibold leading-5 text-[color:var(--sum-muted)]">Every step stays visible, so a friend challenge never turns into unexplained AI magic.</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {questPath.map(([number, title, body]) => (
              <article className="rounded-[20px] border border-[color:var(--sum-border)] bg-white/72 p-3" key={number}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--sum-mint)] text-xs font-extrabold text-[color:var(--sum-ink)]">{number}</span>
                <h3 className="mt-3 text-sm font-extrabold text-[color:var(--sum-ink)]">{title}</h3>
                <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--sum-muted)]">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="quest-ideas-title">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-lg font-extrabold text-[color:var(--sum-ink)]" id="quest-ideas-title">Quest ideas for friends</h2>
            <span className="text-xs font-semibold text-[color:var(--sum-muted)]">Use these as inspiration</span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {questIdeas.map(([type, title, proof], index) => (
              <article className="sum-world-panel p-4" key={title}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[color:var(--sum-muted)]">{type}</span>
                  <span className="sum-quest-orb" style={{ animationDelay: `${index * -0.7}s` }} />
                </div>
                <h3 className="mt-3 text-base font-extrabold leading-tight text-[color:var(--sum-ink)]">{title}</h3>
                <p className="mt-2 text-xs font-semibold text-[color:var(--sum-muted)]">Suggested proof · {proof}</p>
              </article>
            ))}
          </div>
        </section>
      </section>
    </SceneShell>
  );
}
