import Link from "next/link";
import ResultReceiptCard from "@/components/ResultReceiptCard";
import QuestGlyph from "@/components/world/QuestGlyph";
import type { ChallengeData } from "@/lib/api-client";

const demoReceiptChallenge = {
  id: "judgment-demo",
  title: "Sunrise 5K Quest",
  evidenceType: "verified_record",
  status: "settled",
  creator: { id: "summoner-mira", username: "Mira", image: null },
  participants: [
    {
      id: "participant-mira",
      role: "creator",
      status: "accepted",
      user: { id: "summoner-mira", username: "Mira", image: null },
    },
    {
      id: "participant-ren",
      role: "opponent",
      status: "accepted",
      user: { id: "summoner-ren", username: "Ren", image: null },
    },
  ],
} satisfies Pick<ChallengeData, "id" | "title" | "evidenceType" | "status" | "creator" | "participants">;

const demoReceiptJudgment = {
  id: "judgment-demo-receipt",
  winnerId: "summoner-mira",
  method: "ai",
  aiModel: "Summoner Familiar",
  reasoning:
    "Mira's verified record matches the quest distance and finished inside the time window. The timestamp aligns with the quest deadline. Ren's submitted proof was incomplete for the final kilometer.",
  confidence: 0.98,
  status: "completed",
  createdAt: "2025-05-11T18:33:00.000Z",
  winner: { id: "summoner-mira", username: "Mira" },
} satisfies NonNullable<ChallengeData["judgments"]>[number];

const proofChecks = [
  ["Proof source", "Verified running record"],
  ["Timing", "Finished inside the quest window"],
  ["Consistency", "Distance and timestamp match"],
  ["Receipt", "Ready to share"],
] as const;

const journey = [
  ["1", "Proof submitted", "Both Summoners added records for the quest."],
  ["2", "Familiar reviewed", "The AI Familiar checked proof against the rules."],
  ["3", "Receipt created", "The settled result is ready to share."],
] as const;

export default function JudgmentDemoPage() {
  return (
    <main className="sum-map-world min-h-screen overflow-hidden">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4">
        <Link href="/" className="text-base font-black tracking-tight" style={{ color: "var(--sum-ink)" }}>
          Summoner.world
        </Link>
        <Link
          href="/summons"
          className="rounded-full px-4 py-2 text-xs font-black active:scale-95 transition-transform"
          style={{
            background: "var(--sum-card)",
            border: "1px solid var(--sum-border)",
            color: "var(--sum-ink)",
            boxShadow: "var(--sum-shadow-soft)",
          }}
        >
          View Quests
        </Link>
      </header>

      <section className="relative mx-auto grid w-full max-w-6xl gap-6 px-4 pb-10 pt-4 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.68fr)] lg:items-start lg:pt-8">
        <div className="absolute left-6 top-24 h-16 w-16 rounded-full opacity-70" style={{ background: "var(--sum-peach)" }} aria-hidden="true" />
        <div className="absolute right-6 top-48 h-12 w-12 rounded-full opacity-70" style={{ background: "var(--sum-sun)" }} aria-hidden="true" />
        <div className="absolute bottom-24 left-1/3 h-14 w-14 rounded-full opacity-60" style={{ background: "var(--sum-mint)" }} aria-hidden="true" />

        <div className="relative z-10">
          <p className="sum-sticker-badge inline-flex text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "var(--sum-ink)" }}>
            Result demo
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-5xl" style={{ color: "var(--sum-ink)" }}>
            Quest settled. Receipt ready.
          </h1>
          <p className="mt-4 max-w-2xl text-base font-semibold leading-7 sm:text-lg" style={{ color: "var(--sum-muted)" }}>
            This is the final Summoner.world result surface: proof is checked, the AI Familiar explains the result, and the receipt is ready to share.
          </p>

          <div className="receipt-journey mt-6">
            {journey.map(([step, title, body], index) => (
              <div
                key={step}
                className="receipt-journey__step"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[1rem] text-xs font-black"
                >
                  <QuestGlyph className="h-4 w-4" kind={index === 0 ? "proof" : index === 1 ? "spark" : "receipt"} />
                </span>
                <div className="min-w-0"><p className="text-xs font-black" style={{ color: "var(--sum-ink)" }}>
                  {title}
                </p>
                <p className="mt-0.5 truncate text-[9px] font-bold" style={{ color: "var(--sum-muted)" }}>
                  {body}
                </p></div>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <ResultReceiptCard
              challenge={demoReceiptChallenge}
              judgment={demoReceiptJudgment}
              shareUrl="/judgment/demo"
            />
          </div>
        </div>

        <aside className="relative z-10 grid gap-4">
          <section
            className="rounded-[28px] p-5"
            style={{
              background: "rgba(255, 255, 255, 0.78)",
              border: "1px solid var(--sum-border)",
              boxShadow: "var(--sum-shadow-soft)",
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--sum-grass)" }}>
              Proof check
            </p>
            <h2 className="mt-2 text-2xl font-black leading-tight" style={{ color: "var(--sum-ink)" }}>
              Familiar review summary
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6" style={{ color: "var(--sum-muted)" }}>
              The demo keeps the receipt, proof notes, and share action in one bright challenge-game language.
            </p>

            <div className="mt-5 grid gap-2">
              {proofChecks.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 rounded-2xl px-4 py-3"
                  style={{ background: "var(--sum-card)", border: "1px solid var(--sum-border)" }}
                >
                  <span className="text-xs font-black uppercase tracking-[0.12em]" style={{ color: "var(--sum-muted)" }}>
                    {label}
                  </span>
                  <span className="max-w-[58%] text-right text-sm font-black leading-5" style={{ color: "var(--sum-ink)" }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-[28px] p-5"
            style={{
              background: "linear-gradient(145deg, rgba(255, 190, 146, 0.48), rgba(167, 243, 208, 0.42))",
              border: "1px solid var(--sum-border)",
              boxShadow: "var(--sum-shadow-soft)",
            }}
          >
            <p className="text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "var(--sum-grass)" }}>
              Shareable result
            </p>
            <h2 className="mt-2 text-xl font-black leading-tight" style={{ color: "var(--sum-ink)" }}>
              Screenshot-friendly by default
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6" style={{ color: "var(--sum-muted)" }}>
              The receipt is designed to stand alone in a screenshot: quest title, winner, proof reasons, confidence, and share CTA all stay visible.
            </p>
          </section>
        </aside>
      </section>
    </main>
  );
}
