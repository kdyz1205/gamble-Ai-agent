import type { CSSProperties } from "react";

/** One canonical Pico silhouette, with event-specific emotions and no decorative fake progress. */
export type PicoMood =
  | "guide" | "listening" | "thinking" | "clarify"
  | "referee" | "uncertain" | "celebrate" | "error" | "waiting" | "confirm";

interface PicoFamiliarProps {
  className?: string;
  mood?: PicoMood;
  label?: string;
}

const expressions: Record<PicoMood,{
  blush:string;star:string;mouth:string;eyes:"happy"|"open"|"thoughtful"|"soft";pose:string;
}> = {
  guide: { blush:"#ffbcaa", star:"#f4d77b", mouth:"M45 64Q52 69 59 64", eyes:"happy", pose:"guide" },
  listening: { blush:"#f9bbad", star:"#b3e9e2", mouth:"M49 63Q52 65 55 63", eyes:"open",pose:"attentive" },
  thinking: { blush:"#e1c9ca", star:"#c5c0eb", mouth:"M48 66Q53 63 57 65", eyes:"thoughtful",pose:"thinking" },
  clarify: { blush:"#f4c49c", star:"#e8c989", mouth:"M47 65Q52 62 57 65", eyes:"open",pose:"thinking" },
  referee: { blush:"#b4decb", star:"#a7cbe8", mouth:"M46 66Q52 63 58 66",eyes:"soft",pose:"review" },
  uncertain: { blush:"#d8cde4", star:"#c8c7ee", mouth:"M47 65Q52 60 57 65", eyes:"thoughtful",pose:"thinking" },
  celebrate: { blush:"#fec3ac", star:"#f6cc71", mouth:"M43 60Q52 76 61 60", eyes:"happy",pose:"celebrate" },
  error: { blush:"#e9bbbd", star:"#d6b7c4", mouth:"M46 67Q52 61 59 67",eyes:"soft",pose:"thinking" },
  waiting: { blush:"#d6c4ba", star:"#f0d998",mouth:"M47 65Q52 66 57 65",eyes:"soft",pose:"guide" },
  confirm: { blush:"#bde5c2", star:"#f1d18c",mouth:"M44 62Q52 71 60 62",eyes:"happy",pose:"celebrate" },
};

export default function PicoFamiliar({
  className="",
  mood="guide",
  label,
}: PicoFamiliarProps) {
  const face=expressions[mood];
  const spoken=label||("Pico, your AI Familiar — "+mood);
  return (
    <span
      className={"sum-familiar "+className}
      role="img"
      aria-label={spoken}
      data-mood={mood}
      data-pose={face.pose}
      style={{ "--pico-spark": face.star } as CSSProperties}
    >
      <svg viewBox="0 0 104 104" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="pico-ivory" x1="25" y1="22" x2="87" y2="93" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff"/><stop offset=".5" stopColor="#fff9e9"/><stop offset="1" stopColor="#e9efe9"/>
          </linearGradient>
          <linearGradient id="pico-ear" x1="20" y1="13" x2="43" y2="41" gradientUnits="userSpaceOnUse">
            <stop stopColor="#d0f0d9"/><stop offset="1" stopColor="#73bfaa"/>
          </linearGradient>
        </defs>
        <ellipse cx="52" cy="94" rx="24" ry="4" fill="#315c53" opacity=".06"/>
        <g className="pico-ears">
          <path d="M22 36C9 26 12 12 30 16L40 31" fill="url(#pico-ear)" stroke="#173b40" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M82 36C95 26 92 12 74 16L64 31" fill="url(#pico-ear)" stroke="#173b40" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M51 21C52 10 59 6 68 10C66 20 59 25 51 21Z" fill="#c2e7c9" stroke="#173b40" strokeWidth="3.4" strokeLinejoin="round"/>
          <path d="M52 21C47 11 38 9 32 16C38 25 45 26 52 21Z" fill="#f5d890" stroke="#173b40" strokeWidth="3.4" strokeLinejoin="round"/>
        </g>
        <path d="M18 56C18 33 32 21 52 21C71 21 86 34 86 56C86 77 71 89 52 89C32 89 18 77 18 56Z" fill="url(#pico-ivory)" stroke="#173b40" strokeWidth="3.8"/>
        <path d="M25 51C26 37 37 28 50 27C35 38 32 50 34 63C35 77 41 82 45 85C31 81 25 69 25 51Z" fill="#d4ecf5" opacity=".8"/>
        <path d="M58 28Q72 30 79 45" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity=".7"/>
        <ellipse cx="37" cy="59" rx="8.2" ry="4.5" fill={face.blush} opacity=".64"/>
        <ellipse cx="67" cy="59" rx="8.2" ry="4.5" fill={face.blush} opacity=".64"/>
        <g className="pico-eyes" stroke="#173b40" strokeLinecap="round" fill="#173b40">
          {face.eyes==="open" && <>
            <ellipse cx="39" cy="49" rx="3.3" ry="4.1" strokeWidth="0"/>
            <ellipse cx="65" cy="49" rx="3.3" ry="4.1" strokeWidth="0"/>
            <circle cx="40" cy="47.5" r="1.1" fill="#fff"/>
            <circle cx="66" cy="47.5" r="1.1" fill="#fff"/>
          </>}
          {face.eyes==="happy" && <>
            <path d="M34 50Q39 45 44 50" strokeWidth="3.4"/>
            <path d="M60 50Q65 45 70 50" strokeWidth="3.4"/>
          </>}
          {face.eyes==="soft" && <>
            <path d="M34 50Q39 48 44 50" strokeWidth="3"/>
            <path d="M60 50Q65 48 70 50" strokeWidth="3"/>
          </>}
          {face.eyes==="thoughtful" && <>
            <ellipse cx="39" cy="49" rx="3.1" ry="3.4" strokeWidth="0"/>
            <path d="M61 49Q65 47 70 49" strokeWidth="3"/>
            <path d="M35 42Q39 40 43 43" strokeWidth="2.3"/>
          </>}
        </g>
        <path d={face.mouth} stroke="#173b40" strokeWidth="3.2" strokeLinecap="round"/>
        <g className="pico-star">
          <path d="M84 24L87 31L94 34L87 37L84 44L81 37L74 34L81 31L84 24Z" fill={face.star} stroke="#173b40" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M84 29V38M79 34H89" stroke="#fffaf1" strokeWidth="1" opacity=".65"/>
        </g>
        {mood==="referee"&&<path d="M41 78H63L59 87H45L41 78Z" fill="#e4caa2" stroke="#173b40" strokeWidth="2.8" strokeLinejoin="round"/>}
        {(mood==="celebrate"||mood==="confirm")&&<path d="M41 22L46 15L52 21L58 14L63 22" stroke="#f3ca80" strokeWidth="3" strokeLinejoin="round"/>}
        {(mood==="thinking"||mood==="clarify"||mood==="uncertain")&&<path d="M73 73L78 75L76 80" stroke="#8ca6aa" strokeWidth="2" strokeLinecap="round"/>}
      </svg>
    </span>
  );
}
