import Link from "next/link";
import SceneShell from "@/components/scene/SceneShell";
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
    <SceneShell activePath="/judgment/demo" particleCount={16} tone="world">
      <section className="world-page" aria-labelledby="results-title">
        <header className="world-page__header">
          <div>
            <span className="world-eyebrow">
              <QuestGlyph className="h-4 w-4" kind="receipt" />
              The Judgment Observatory · Example result
            </span>
            <h1 id="results-title" className="world-page__title">
              A result you can actually understand.
            </h1>
            <p className="world-page__lead">
              Once a quest is settled, the receipt brings the outcome, evidence notes,
              and reasoning together. If something is unclear, the review stays open.
            </p>
          </div>
          <Link
            href="/summons"
            className="sum-world-button inline-flex min-h-11 items-center gap-2 px-5 py-3 text-sm font-extrabold"
          >
            <QuestGlyph className="h-4 w-4" kind="spark" />
            Create a quest
          </Link>
        </header>

        <div className="world-page__layout">
          <div className="min-w-0">
            <nav aria-label="Example result progress" className="receipt-journey">
              {journey.map(([step, title, description], index) => (
                <div className="receipt-journey__step" key={step}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[0.9rem]">
                    <QuestGlyph
                      className="h-4 w-4"
                      kind={index === 0 ? "proof" : index === 1 ? "spark" : "receipt"}
                    />
                  </span>
                  <div className="min-w-0">
                    <p className="font-black text-[color:var(--sum-ink)]">{title}</p>
                    <p className="font-semibold text-[color:var(--sum-muted)]">{description}</p>
                  </div>
                </div>
              ))}
            </nav>

            <ResultReceiptCard
              challenge={demoReceiptChallenge}
              judgment={demoReceiptJudgment}
              shareUrl="/judgment/demo"
            />
            <p className="world-page__demo-note">
              Illustrative demo, not a real participant&apos;s result. Live quests follow their
              confirmed evidence and review status before settlement.
            </p>
          </div>

          <aside className="world-page__aside" aria-label="Explanation of this example result">
            <section className="world-info-card">
              <p className="world-eyebrow">
                <QuestGlyph className="h-4 w-4" kind="proof" />
                What Pico checked
              </p>
              <h2>The proof, in plain language.</h2>
              <p>
                The example groups the evidence checks in one place so both participants
                can see what supported the receipt.
              </p>
              <dl>
                {proofChecks.map(([label, value]) => (
                  <div className="world-info-card__row" key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="world-info-card world-info-card--accent">
              <p className="world-eyebrow">
                <QuestGlyph className="h-4 w-4" kind="friends" />
                Made to share
              </p>
              <h2>A keepsake, not a black box.</h2>
              <p>
                Clear terms, evidence notes, and a readable explanation make a result
                easy to revisit. Uncertain evidence should be reviewed, not guessed.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </SceneShell>
  );
}
