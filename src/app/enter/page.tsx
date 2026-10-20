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
      <a className="sum-skip-link" href="#world-introduction">Skip to main content</a>
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

      <section id="world-introduction" tabIndex={-1} className="relative z-10 mx-auto grid min-h-[calc(100dvh-88px)] w-full max-w-[1440px] items-center gap-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(480px,1.1fr)] lg:gap-12 lg:pb-16">
        <div className="gateway-copy order-1">
          <span className="sum-sticker-badge px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.18em]">
            <QuestGlyph className="h-4 w-4" kind="spark" />
            Your world of real challenges
          </span>
          <h1 className="mt-7">
            Say it.
            <em>Make it a quest.</em>
          </h1>
          <p className="gateway-copy__lead mt-6 text-pretty text-[color:var(--sum-muted)]">
            Challenge a friend in one sentence. Pico helps you agree on clear rules, bring your proof together, and understand the result.
          </p>

          <div className="mt-7">
            <GatewayDoorHold />
          </div>

          <div className="gateway-promise mt-5" aria-label="How Summoner.world works">
            {promises.map((item) => (
              <article key={item.title}>
                <span><QuestGlyph className="h-4 w-4" kind={item.icon} /></span>
                <span className="min-w-0">
                  <strong className="block">{item.title}</strong>
                  <small className="mt-0.5 block text-[color:var(--sum-muted)]">{item.body}</small>
                </span>
              </article>
            ))}
          </div>
        </div>

        <div className="order-2">
          <QuestWorldScene />
          <div className="gateway-sample-card mx-auto -mt-4 flex w-[88%] flex-wrap items-center justify-between gap-3 rounded-[1.35rem] px-4 py-3 backdrop-blur">
            <div className="min-w-0">
              <p className="gateway-sample-card__label font-black uppercase text-[#267a66]">Example quest</p>
              <p className="mt-1 truncate text-sm font-black text-[color:var(--sum-ink)]">First to win 3 badminton rallies</p>
            </div>
            <span className="shrink-0 rounded-full bg-[rgba(112,214,165,0.2)] px-3 py-1.5 text-[10px] font-black text-[#157b58]">No scoreboard needed</span>
          </div>
        </div>
      </section>

      <section className="gateway-story" aria-labelledby="gateway-story-title">
        <div className="gateway-story__inner">
          <div>
            <span className="world-eyebrow">
              <QuestGlyph className="h-4 w-4" kind="spark" />
              Four moments. One shared story.
            </span>
            <h2 id="gateway-story-title">From a friendly dare to a clear result.</h2>
            <p className="gateway-story__intro">
              Bring the idea. Pico helps make the rules understandable, keeps everyone&apos;s evidence together,
              and leaves room for review when something isn&apos;t clear.
            </p>
          </div>
          <div>
            <ol className="gateway-story__steps">
              {[
                ["01", "Say it your way", "Start with an everyday challenge. You don't need to write a rulebook."],
                ["02", "Agree together", "Both friends see the objective, deadline and proof requirements before accepting."],
                ["03", "Show what happened", "Each person can add their own evidence. Unclear moments stay open for review."],
                ["04", "Understand the result", "Get a readable receipt explaining the outcome and what supported it."],
              ].map(([number, title, description]) => (
                <li className="gateway-story__step" key={number}>
                  <span className="gateway-story__number" aria-hidden="true">{number}</span>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
            <p className="gateway-story__footnote">
              A quest is only as clear as its rules and evidence. Pico does not invent a winner when proof is inconclusive.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
