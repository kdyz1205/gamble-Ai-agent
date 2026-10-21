import { Suspense } from "react";
import QuestList from "@/components/quests/QuestList";

export default function QuestsPage() {
  return <Suspense fallback={<p role="status" className="p-8">Loading your quests…</p>}><QuestList /></Suspense>;
}
