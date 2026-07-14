import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import QuestGlyph from "@/components/world/QuestGlyph";
import QuestWorldScene from "@/components/world/QuestWorldScene";

const rallyTrail = ["1–0", "1–1", "2–1", "2–2", "3–2"] as const;

export default function ChallengeCinematicStage() {
  return (
    <aside className="relative h-full min-h-[38rem]" data-testid="challenge-cinematic-stage">
      <QuestWorldScene className="h-full" compact />

      <section className="absolute inset-x-3 bottom-3 rounded-[1.8rem] border-2 border-white/90 bg-[rgba(255,253,244,0.94)] p-4 shadow-[0_9px_0_rgba(23,53,75,0.1),0_20px_38px_rgba(23,53,75,0.18)] backdrop-blur sm:inset-x-4 sm:bottom-4">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[1.25rem] bg-[#eafaff] shadow-[0_5px_0_rgba(23,53,75,0.08)]">
            <PicoFamiliar className="h-14 w-14" mood="referee" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#3a9b77]">Pico’s proof lesson</p>
            <h2 className="mt-1 text-xl font-black leading-tight tracking-[-0.03em] text-[color:var(--sum-ink)]">No scoreboard? Still judgeable.</h2>
            <p className="mt-1 text-[11px] font-bold leading-5 text-[color:var(--sum-muted)]">For five badminton rallies, Pico returns only each rally winner. The app derives the score.</p>
          </div>
        </div>

        <div className="sum-path-line relative mt-4 grid grid-cols-5 gap-1">
          {rallyTrail.map((score, index) => (
            <div className="relative z-10 text-center" key={score}>
              <span className="mx-auto grid h-9 w-9 place-items-center rounded-full border-2 border-white text-[10px] font-black text-[color:var(--sum-ink)] shadow-[0_5px_0_rgba(23,53,75,0.1)]" style={{ background: index % 2 === 0 ? "var(--sum-peach)" : "var(--sum-mint)" }}>
                {index + 1}
              </span>
              <p className="mt-1.5 text-[9px] font-black text-[color:var(--sum-ink)]">{score}</p>
            </div>
          ))}
        </div>

        <p className="mt-3 flex items-center gap-2 rounded-[1rem] bg-[rgba(112,214,165,0.16)] px-3 py-2 text-[10px] font-bold leading-4 text-[color:var(--sum-ink)]">
          <QuestGlyph className="h-4 w-4 shrink-0 text-[#157b58]" kind="proof" />
          If one rally is unclear, Pico leaves its winner blank and opens review instead of guessing.
        </p>
      </section>
    </aside>
  );
}
