"use client";
import { ArrowMark } from "@/components/world/EditorialMarks";

const ideas = [
  ["Meet me on the court", "Challenge my friend to a badminton match: first to win 3 rallies. Each person uploads a continuous video within 24 hours."],
  ["A week of showing up", "Challenge my friend to walk for 20 minutes every day for 7 days. We each upload our daily activity record."],
  ["One minute. Twenty pushups.", "Challenge my friend to do 20 pushups in 60 seconds, with one unedited video showing the full attempt."],
] as const;

export default function QuestIdeaDeck() {
  return <section aria-labelledby="idea-deck-title"><h2 className="ed-eyebrow" id="idea-deck-title">NEED A STARTING POINT?</h2>{ideas.map(([label, idea]) => <button type="button" key={label} className="ed-starter" onClick={() => window.dispatchEvent(new CustomEvent("summoner:choose-example", { detail: idea }))}>{label}<ArrowMark /></button>)}<p className="ed-note" style={{ marginTop: 14 }}>Examples only. Edit the details before creating your quest.</p></section>;
}
