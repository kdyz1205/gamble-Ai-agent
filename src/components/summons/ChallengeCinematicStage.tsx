import PicoFamiliar from "@/components/familiar/PicoFamiliar";

const rallyTrail = ["1–0", "1–1", "2–1", "2–2", "3–2"] as const;

export default function ChallengeCinematicStage() {
  return (
    <aside className="sum-world-panel relative isolate h-full min-h-[420px] overflow-hidden p-5 sm:p-6 xl:min-h-[640px]" data-testid="challenge-cinematic-stage">
      <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--sum-sun)] opacity-30 blur-3xl" aria-hidden />
      <div className="absolute -bottom-14 -left-12 h-44 w-44 rounded-full bg-[color:var(--sum-mint)] opacity-35 blur-3xl" aria-hidden />

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[0.24em] text-[color:var(--sum-muted)]">Meet your proof scout</p>
          <h2 className="mt-2 text-3xl font-extrabold leading-[1.02] text-[color:var(--sum-ink)] sm:text-4xl">
            Pico makes friend challenges clear.
          </h2>
          <p className="mt-3 max-w-[32rem] text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">
            No scoreboard is required. Upload continuous proof, identify the players, and Pico checks each decisive moment before your app derives the score.
          </p>
        </div>
        <PicoFamiliar className="h-24 w-24 shrink-0 sm:h-28 sm:w-28" mood="referee" />
      </div>

      <section className="mt-5 rounded-[24px] border border-[color:var(--sum-border)] bg-[rgba(223,245,255,0.7)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Example quest</p>
            <h3 className="mt-1 text-lg font-extrabold text-[color:var(--sum-ink)]">First to 3 badminton rallies</h3>
          </div>
          <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold">No scoreboard</span>
        </div>

        <div className="sum-path-line relative mt-5 grid grid-cols-5 gap-1">
          {rallyTrail.map((score, index) => (
            <div className="relative z-10 text-center" key={score}>
              <span
                className="mx-auto grid h-11 w-11 place-items-center rounded-full border-2 border-white text-xs font-extrabold text-[color:var(--sum-ink)] shadow-[0_8px_18px_rgba(40,102,133,0.12)]"
                style={{ background: index % 2 === 0 ? "var(--sum-peach)" : "var(--sum-mint)" }}
              >
                {index + 1}
              </span>
              <p className="mt-2 text-[11px] font-extrabold text-[color:var(--sum-ink)]">{score}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {[
          ["01", "Describe", "Who, what, and the win condition."],
          ["02", "Prove", "One continuous clip or clear photos."],
          ["03", "Receive", "Reasoned result and shareable receipt."],
        ].map(([number, title, body]) => (
          <article className="rounded-[20px] border border-[color:var(--sum-border)] bg-white/76 p-3" key={number}>
            <span className="text-[10px] font-extrabold text-[#e98648]">{number}</span>
            <h3 className="mt-1 text-sm font-extrabold text-[color:var(--sum-ink)]">{title}</h3>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--sum-muted)]">{body}</p>
          </article>
        ))}
      </div>

      <p className="mt-4 rounded-[18px] border border-[rgba(143,230,193,0.52)] bg-[rgba(143,230,193,0.2)] px-4 py-3 text-xs font-semibold leading-5 text-[color:var(--sum-ink)]">
        If a rally is unclear, Pico leaves the winner blank and sends it for review instead of guessing.
      </p>
    </aside>
  );
}
