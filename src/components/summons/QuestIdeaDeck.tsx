"use client";
import { Arrow, WorldGlyph } from "@/components/universe/WorldUI";
import { questSeeds } from "@/components/universe/quest-seeds";

export default function QuestIdeaDeck() {
  return <section className="sw-seeds" aria-labelledby="quest-seeds-title"><h2 id="quest-seeds-title">CHOOSE A STARTING SPARK</h2>{questSeeds.map(quest => <button key={quest.id} type="button" onClick={() => window.dispatchEvent(new CustomEvent("summoner:choose-example", { detail: quest.prompt }))}><WorldGlyph kind={quest.kind} /><span><strong>{quest.name}</strong><small>{quest.realm} · Example quest</small></span><Arrow /></button>)}</section>;
}
