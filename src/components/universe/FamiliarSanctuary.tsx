"use client";

import { useState } from "react";
import Link from "next/link";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";
import { Arrow, Eyebrow } from "./WorldUI";

const roles = [
  { label: "Guide", mood: "guide" as const, title: "An idea does not need to arrive fully formed.", detail: "Describe the challenge naturally. Pico helps turn it into a quest and asks for the missing details." },
  { label: "Clarify", mood: "guide" as const, title: "A good pact starts with the right questions.", detail: "Who is involved? What counts as completion? What proof will show it? Both Summoners review the terms." },
  { label: "Review", mood: "referee" as const, title: "A clearer explanation. Not a magical verdict.", detail: "Pico helps review submitted evidence against the agreed rules. Ambiguous proof stays open for review." },
];

export default function FamiliarSanctuary() {
  const [active, setActive] = useState(0);
  const role = roles[active];
  return <section className="sw-page"><div className="sw-sanctuary"><div className="sw-familiar-display" data-familiar-role={role.label}><span className="sw-familiar-display__star" aria-hidden="true">✧</span><PicoFamiliar mood={role.mood} /><div className="sw-familiar-display__base"><b>PICO</b><span>FAMILIAR / 001<br />YOUR QUEST COMPANION</span></div></div><div className="sw-sanctuary-copy"><Eyebrow>THE FAMILIAR SANCTUARY</Eyebrow><h1>Your idea.<br />Your adventure.<br /><span>Your Familiar.</span></h1><p>Not a sticker on the page. A companion in the process. Pico stays part of the journey from your first idea to an understandable result.</p><div className="sw-familiar-tabs" role="group" aria-label="Explore Pico’s role">{roles.map((item,index) => <button key={item.label} type="button" aria-pressed={active===index} onClick={() => setActive(index)}>{item.label}</button>)}</div><section className="sw-familiar-role" aria-live="polite"><h2>{role.title}</h2><p>{role.detail}</p></section><Link className="sw-button" href="/summons">Summon with Pico <Arrow /></Link><p className="sw-example-footnote">Meet the character and its role. This is not a personalized skill or progress dashboard.</p></div></div><section className="sw-sanctuary-promises" aria-label="A Familiar’s boundaries">{[["01 / YOUR AGENCY", "You are the Summoner.", "Your Familiar cannot accept a pact or change agreed terms for you."], ["02 / SHARED TRUTH", "The proof still matters.", "A character, skill, or appearance never makes uncertain evidence conclusive."], ["03 / CLEAR OUTCOMES", "The explanation stays.", "A result should show its reasoning and what may still need review."]].map(([tag,title,detail]) => <div key={title}><span className="sw-small-label">{tag}</span><h2>{title}</h2><p>{detail}</p></div>)}</section></section>;
}
