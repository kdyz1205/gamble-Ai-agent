import type { CSSProperties } from "react";

type PicoMood = "guide" | "referee" | "celebrate";

interface PicoFamiliarProps {
  className?: string;
  mood?: PicoMood;
  label?: string;
}

const moodDetails: Record<PicoMood, { blush: string; spark: string; mouth: string }> = {
  guide: { blush: "#ffb9a5", spark: "#ffd86b", mouth: "M46 62 Q52 67 58 62" },
  referee: { blush: "#8fe6c1", spark: "#88d7ff", mouth: "M47 64 Q52 61 57 64" },
  celebrate: { blush: "#ffb978", spark: "#ffd86b", mouth: "M45 61 Q52 70 59 61" },
};

export default function PicoFamiliar({
  className = "",
  mood = "guide",
  label = "Pico, your AI Familiar",
}: PicoFamiliarProps) {
  const details = moodDetails[mood];

  return (
    <span
      aria-label={label}
      className={`sum-familiar ${className}`}
      data-mood={mood}
      role="img"
      style={{ "--pico-spark": details.spark } as CSSProperties}
    >
      <svg aria-hidden="true" fill="none" viewBox="0 0 104 104" xmlns="http://www.w3.org/2000/svg">
        <path d="M22 34C9 22 13 9 30 17L38 31" fill="#8FE6C1" stroke="#153047" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M82 34C95 22 91 9 74 17L66 31" fill="#8FE6C1" stroke="#153047" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <path d="M51 21C52 11 59 7 68 10C64 20 59 24 51 21Z" fill="#BFF3C7" stroke="#153047" strokeLinejoin="round" strokeWidth="4" />
        <path d="M52 21C47 12 38 11 32 16C38 24 45 26 52 21Z" fill="#FFD86B" stroke="#153047" strokeLinejoin="round" strokeWidth="4" />
        <path d="M18 55C18 33 33 22 52 22C71 22 86 33 86 55C86 75 72 88 52 88C32 88 18 75 18 55Z" fill="#FFF9E8" stroke="#153047" strokeWidth="4" />
        <path d="M24 52C25 37 36 28 51 27C39 34 34 45 34 59C34 71 39 79 46 85C31 82 23 70 24 52Z" fill="#DFF5FF" />
        <ellipse cx="37" cy="58" fill={details.blush} opacity=".72" rx="7" ry="4" />
        <ellipse cx="67" cy="58" fill={details.blush} opacity=".72" rx="7" ry="4" />
        <path d="M34 49C37 46 41 46 44 49" stroke="#153047" strokeLinecap="round" strokeWidth="4" />
        <path d="M60 49C63 46 67 46 70 49" stroke="#153047" strokeLinecap="round" strokeWidth="4" />
        <path d={details.mouth} stroke="#153047" strokeLinecap="round" strokeWidth="3.5" />
        <path d="M84 24L87 31L94 34L87 37L84 44L81 37L74 34L81 31L84 24Z" fill={details.spark} stroke="#153047" strokeLinejoin="round" strokeWidth="2.5" />
        {mood === "referee" && (
          <path d="M41 77H63L59 87H45L41 77Z" fill="#FFB978" stroke="#153047" strokeLinejoin="round" strokeWidth="3" />
        )}
        {mood === "celebrate" && (
          <path d="M42 21L47 13L52 20L58 12L63 21" stroke="#FFB978" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        )}
      </svg>
    </span>
  );
}
