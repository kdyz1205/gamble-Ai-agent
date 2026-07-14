import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import RitualButton from "@/components/scene/RitualButton";
import SceneShell from "@/components/scene/SceneShell";

const familiarSkills = [
  { name: "Proof Scout", effect: "Finds missing player and timing details", status: "Ready" as const, tone: "var(--sum-mint)" },
  { name: "Fair Rule Lens", effect: "Flags ambiguous win conditions before publish", status: "Learning" as const, tone: "var(--sum-sun)" },
  { name: "Receipt Spark", effect: "Turns a settled result into a shareable story", status: "Ready" as const, tone: "var(--sum-peach)" },
] as const;

const trainingPath = [
  ["Listen", "Understands a natural challenge"],
  ["Clarify", "Asks only for missing terms"],
  ["Review", "Checks proof without guessing"],
  ["Explain", "Creates a readable result receipt"],
] as const;

export default function RitualsPage() {
  return (
    <SceneShell activePath="/rituals" particleCount={24} tone="contract">
      <section className="mx-auto w-full max-w-[1240px] px-3 py-5 sm:px-5 lg:px-7 lg:py-7">
        <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
          <div>
            <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em]">Familiar grove</span>
            <h1 className="mt-3 text-3xl font-extrabold leading-none text-[color:var(--sum-ink)] sm:text-4xl">Grow a clearer, fairer Familiar.</h1>
          </div>
          <p className="max-w-xl text-sm font-semibold leading-6 text-[color:var(--sum-muted)] lg:text-right">
            Familiar skills improve how a quest is explained and reviewed. They never bypass consent, move credits, or invent a winner.
          </p>
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(420px,1.25fr)_minmax(260px,0.8fr)]">
          <TrainingPath />
          <FamiliarHome />
          <SafetyPanel />
        </div>

        <section className="mt-4" aria-labelledby="skills-title">
          <div className="mb-3 flex items-center justify-between gap-3 px-1">
            <h2 className="text-xl font-extrabold text-[color:var(--sum-ink)]" id="skills-title">Pico&apos;s skills</h2>
            <span className="text-xs font-semibold text-[color:var(--sum-muted)]">Presentation and judgment support only</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {familiarSkills.map((skill) => <SkillCard key={skill.name} {...skill} />)}
          </div>
        </section>
      </section>
    </SceneShell>
  );
}

function TrainingPath() {
  return (
    <aside className="sum-world-panel p-4" data-testid="ritual-queue-panel">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Training path</p>
      <div className="mt-3 space-y-2">
        {trainingPath.map(([label, detail], index) => (
          <div className="flex gap-3 rounded-[18px] border border-[color:var(--sum-border)] bg-white/72 p-3" key={label}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[color:var(--sum-mint)] text-xs font-extrabold text-[color:var(--sum-ink)]">{index + 1}</span>
            <div>
              <h2 className="text-sm font-extrabold text-[color:var(--sum-ink)]">{label}</h2>
              <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--sum-muted)]">{detail}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function FamiliarHome() {
  return (
    <section className="sum-world-panel relative isolate min-h-[430px] overflow-hidden p-5 text-center sm:p-6" data-testid="ritual-forge-chamber">
      <div className="absolute -right-14 -top-14 h-44 w-44 rounded-full bg-[color:var(--sum-sun)] opacity-30 blur-3xl" aria-hidden />
      <div className="absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-[color:var(--sum-mint)] opacity-35 blur-3xl" aria-hidden />
      <div className="relative">
        <span className="sum-sticker-badge px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em]">Pico · Level 1</span>
        <PicoFamiliar className="mx-auto mt-3 h-44 w-44" mood="celebrate" />
        <h2 className="mt-1 text-2xl font-extrabold text-[color:var(--sum-ink)]">Proof-ready companion</h2>
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-[color:var(--sum-muted)]">Pico learns how to make rules clearer, surface uncertainty, and explain a result in language friends can trust.</p>
        <div className="mx-auto mt-4 max-w-sm rounded-full bg-[rgba(96,117,138,0.12)] p-1">
          <div className="h-2 w-[72%] rounded-full bg-[color:var(--sum-mint)]" />
        </div>
        <p className="mt-2 text-[11px] font-extrabold text-[#2a9f84]">72% to next skill</p>
        <RitualButton className="mt-4 min-h-12 px-8 text-sm" data-testid="begin-fusion-button" type="button">Practice a sample quest</RitualButton>
      </div>
    </section>
  );
}

function SafetyPanel() {
  return (
    <aside className="sum-world-panel p-4" data-testid="ritual-telemetry-panel">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#2a9f84]">Familiar promises</p>
      <div className="mt-3 space-y-2">
        {[
          ["No guessing", "Unclear proof becomes review"],
          ["No hidden moves", "Credits update only through settlement"],
          ["No secret rules", "Both people see the same quest card"],
        ].map(([label, value]) => (
          <div className="rounded-[18px] border border-[color:var(--sum-border)] bg-white/72 p-3" key={label}>
            <h2 className="text-sm font-extrabold text-[color:var(--sum-ink)]">{label}</h2>
            <p className="mt-1 text-[11px] font-semibold leading-5 text-[color:var(--sum-muted)]">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-[18px] border border-[rgba(143,230,193,0.54)] bg-[rgba(143,230,193,0.18)] p-3 text-xs font-semibold leading-5 text-[color:var(--sum-ink)]">
        Familiar growth changes presentation and review quality—not challenge state, participant consent, or settlement authority.
      </p>
    </aside>
  );
}

function SkillCard({ effect, name, status, tone }: { effect: string; name: string; status: "Ready" | "Learning"; tone: string }) {
  const ready = status === "Ready";
  return (
    <article className="sum-world-panel p-4" data-testid={`ritual-upgrade-${name.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[color:var(--sum-ink)]" style={{ background: tone }}>{status}</span>
        <span className="sum-quest-orb" />
      </div>
      <h2 className="mt-4 text-xl font-extrabold text-[color:var(--sum-ink)]">{name}</h2>
      <p className="mt-2 min-h-10 text-sm font-semibold leading-5 text-[color:var(--sum-muted)]">{effect}</p>
      <RitualButton className="mt-4 min-h-11 w-full text-xs" disabled={!ready} type="button" variant={ready ? "primary" : "ghost"}>{ready ? "Practice" : "Learning"}</RitualButton>
    </article>
  );
}
