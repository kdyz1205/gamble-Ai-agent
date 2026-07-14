import GatewayDoorHold from "@/components/gateway/GatewayDoorHold";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

const gatewaySteps = [
  {
    title: "Summon a Quest",
    body: "Describe a real-world challenge and let Summoner.world shape it.",
    marker: "01",
  },
  {
    title: "Submit Proof",
    body: "Invite friends, complete the quest, and upload the proof that shows it.",
    marker: "02",
  },
  {
    title: "Share the Result",
    body: "Your AI familiar judges the proof and turns the result into a receipt.",
    marker: "03",
  },
];

export default function EnterPage() {
  return (
    <main
      className="ios-entry-shell sum-map-world relative min-h-[100dvh] w-full overflow-hidden px-4 sm:px-6"
      style={{
        width: "100vw",
        color: "var(--sum-ink)",
        fontFamily: "'Plus Jakarta Sans', 'Nunito', sans-serif",
      }}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <span
          className="sum-quest-orb absolute left-[8%] top-[18%] opacity-70"
          style={{ width: "3rem", height: "3rem", animationDelay: "-1.2s" }}
        />
        <span
          className="sum-quest-orb absolute right-[10%] top-[12%] opacity-80"
          style={{ width: "4.5rem", height: "4.5rem", animationDelay: "-2.4s" }}
        />
        <span
          className="sum-quest-orb absolute bottom-[18%] left-[12%] hidden opacity-60 sm:block"
          style={{ width: "5.25rem", height: "5.25rem", animationDelay: "-0.6s" }}
        />
      </div>

      <section className="relative z-10 mx-auto flex min-h-[100dvh] max-w-5xl flex-col justify-center gap-6 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <div className="grid items-center gap-6 lg:grid-cols-[1.06fr_0.94fr]">
          <div className="space-y-5">
            <div className="sum-sticker-badge px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.14em]">
              <span className="sum-quest-orb" aria-hidden />
              Summoner.world
            </div>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-balance text-5xl font-extrabold leading-[0.96] sm:text-6xl lg:text-7xl">
                Summon real-world challenges.
              </h1>
              <p className="max-w-2xl text-pretty text-lg font-semibold leading-7 sm:text-xl" style={{ color: "var(--sum-muted)" }}>
                Invite friends. Submit proof. Let your AI familiar judge.
              </p>
            </div>

            <GatewayDoorHold />
          </div>

          <div className="sum-quest-card relative overflow-hidden p-4 sm:p-5">
            <div className="absolute right-4 top-4 h-16 w-16 rounded-full bg-[color:var(--sum-sun)] opacity-30 blur-2xl" aria-hidden />
            <div className="relative flex items-center gap-3">
              <div className="grid h-16 w-16 place-items-center rounded-3xl border border-white/80 bg-white shadow-[0_10px_24px_rgba(40,102,133,0.12)]">
                <PicoFamiliar className="h-16 w-16" />
              </div>
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--sum-muted)" }}>
                  Meet Pico
                </p>
                <p className="text-xl font-extrabold">Your proof-ready Familiar</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {gatewaySteps.map((step) => (
                <article
                  className="rounded-[20px] border border-[color:var(--sum-border)] bg-white/72 p-4 shadow-[0_10px_24px_rgba(40,102,133,0.08)]"
                  key={step.title}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--sum-peach)] text-sm font-extrabold text-white shadow-[0_8px_18px_rgba(255,164,96,0.26)]">
                      {step.marker}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-lg font-extrabold leading-tight">{step.title}</h2>
                      <p className="mt-1 text-sm font-semibold leading-5" style={{ color: "var(--sum-muted)" }}>
                        {step.body}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
