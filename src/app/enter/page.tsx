import GatewayDoorHold from "@/components/gateway/GatewayDoorHold";
import QuestGlyph from "@/components/world/QuestGlyph";
import QuestWorldScene from "@/components/world/QuestWorldScene";

const promises = [
  { icon: "friends" as const, title: "Challenge friends", body: "Private by default" },
  { icon: "proof" as const, title: "Show what happened", body: "Video, photo, or check-in" },
  { icon: "receipt" as const, title: "Get a clear result", body: "Explainable, reviewable" },
] as const;

export default function EnterPage() {
  return (
    <main className="ios-entry-shell summoner-gateway px-4 sm:px-6 lg:px-8">
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-[calc(1rem+env(safe-area-inset-top))]">
        <span className="summoner-wordmark text-lg sm:text-xl">
          <span className="summoner-wordmark__crest" aria-hidden>
            <QuestGlyph className="h-5 w-5" kind="spark" />
          </span>
          Summoner<span className="ml-[-0.65rem] text-[#e85f4e]">.world</span>
        </span>
        <span className="hidden items-center gap-2 rounded-full border-2 border-white/80 bg-white/60 px-3 py-2 text-[11px] font-extrabold text-[color:var(--sum-muted)] shadow-[0_6px_0_rgba(23,53,75,0.06)] backdrop-blur sm:inline-flex">
          <span className="h-2 w-2 rounded-full bg-[color:var(--sum-mint)] shadow-[0_0_0_4px_rgba(112,214,165,0.18)]" />
          Built for challenges between friends
        </span>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-[1440px] items-center gap-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:gap-12 lg:pb-16">
        <div className="gateway-copy order-1">
          <span className="sum-sticker-badge px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em]">
            <QuestGlyph className="h-4 w-4" kind="spark" />
            Your world of real challenges
          </span>
          <h1 className="mt-7">
            Say it.
            <em>Make it a quest.</em>
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base font-bold leading-7 text-[color:var(--sum-muted)] sm:text-lg">
            Challenge a friend in one sentence. Pico turns it into fair rules, checks the proof, and gives both of you a result receipt.
          </p>

          <div className="mt-7">
            <GatewayDoorHold />
          </div>

          <div className="gateway-promise mt-5" aria-label="How Summoner.world works">
            {promises.map((item) => (
              <article key={item.title}>
                <span><QuestGlyph className="h-4 w-4" kind={item.icon} /></span>
                <span className="min-w-0">
                  <strong className="block truncate">{item.title}</strong>
                  <small className="mt-0.5 block truncate text-[9px] text-[color:var(--sum-muted)]">{item.body}</small>
                </span>
              </article>
            ))}
          </div>
        </div>

        <div className="order-2">
          <QuestWorldScene />
          <div className="mx-auto -mt-4 flex w-[88%] items-center justify-between gap-3 rounded-[1.35rem] border-2 border-white/80 bg-[rgba(255,253,244,0.88)] px-4 py-3 shadow-[0_8px_0_rgba(23,53,75,0.09),0_16px_28px_rgba(23,53,75,0.12)] backdrop-blur">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#3a9b77]">Today&apos;s starter quest</p>
              <p className="mt-1 truncate text-sm font-black text-[color:var(--sum-ink)]">First to win 3 badminton rallies</p>
            </div>
            <span className="shrink-0 rounded-full bg-[rgba(112,214,165,0.2)] px-3 py-1.5 text-[10px] font-black text-[#157b58]">No scoreboard needed</span>
          </div>
        </div>
      </section>
    </main>
  );
}
