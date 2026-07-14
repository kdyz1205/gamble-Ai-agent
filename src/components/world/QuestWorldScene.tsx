import type { CSSProperties } from "react";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

interface QuestWorldSceneProps {
  className?: string;
  compact?: boolean;
}

const trailStops = [
  { x: 104, y: 305, label: "Say it", tone: "coral" },
  { x: 218, y: 238, label: "Invite", tone: "sun" },
  { x: 346, y: 292, label: "Prove", tone: "mint" },
  { x: 474, y: 196, label: "Receipt", tone: "violet" },
] as const;

export default function QuestWorldScene({ className = "", compact = false }: QuestWorldSceneProps) {
  return (
    <div className={`quest-world-scene ${compact ? "quest-world-scene--compact" : ""} ${className}`} aria-label="Quest trail from challenge to result">
      <svg aria-hidden="true" className="quest-world-scene__map" viewBox="0 0 580 430" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="quest-sky" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#9be0ff" />
            <stop offset="1" stopColor="#e9fbff" />
          </linearGradient>
          <linearGradient id="quest-ground" x1="0" x2="1" y1="0" y2="1">
            <stop stopColor="#baf19a" />
            <stop offset="1" stopColor="#74d8a4" />
          </linearGradient>
          <filter id="quest-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="10" floodColor="#284e64" floodOpacity=".16" stdDeviation="8" />
          </filter>
        </defs>

        <rect width="580" height="430" rx="42" fill="url(#quest-sky)" />
        <circle cx="471" cy="74" r="42" fill="#ffd85f" opacity=".96" />
        <circle cx="471" cy="74" r="58" fill="#ffd85f" opacity=".18" />
        <path d="M0 186C87 143 158 168 229 188C300 209 383 133 580 167V430H0V186Z" fill="#dff6a8" />
        <path d="M0 250C84 205 163 231 237 252C324 276 405 210 580 235V430H0V250Z" fill="url(#quest-ground)" />
        <path d="M438 430C426 376 421 338 445 309C466 284 515 276 580 288V430H438Z" fill="#5bc9e7" />
        <path d="M462 430C452 382 451 350 469 328C486 307 524 300 580 311" fill="none" opacity=".72" stroke="#d9f8ff" strokeLinecap="round" strokeWidth="12" />

        <g fill="#fff" opacity=".82">
          <path d="M54 84C58 64 77 53 96 59C105 40 139 44 144 69C169 64 184 78 181 96H54Z" />
          <path d="M289 73C294 56 310 49 326 54C337 35 365 42 368 63C391 60 402 73 400 88H289Z" />
        </g>

        <g fill="#3c9d70" opacity=".9">
          <path d="M36 264L57 216L78 264Z" />
          <path d="M55 270L82 211L106 270Z" />
          <path d="M150 214L173 167L194 214Z" />
          <path d="M169 220L198 158L222 220Z" />
          <path d="M388 234L413 180L438 234Z" />
          <path d="M413 239L443 171L468 239Z" />
        </g>
        <g fill="#267a60">
          <rect x="65" y="257" width="6" height="22" rx="3" />
          <rect x="184" y="207" width="7" height="24" rx="3" />
          <rect x="423" y="227" width="7" height="25" rx="3" />
        </g>

        <path d="M105 305C147 279 174 267 218 238C263 209 303 315 346 292C391 268 427 229 474 196" fill="none" stroke="#fffdf0" strokeDasharray="12 12" strokeLinecap="round" strokeWidth="11" />
        <path d="M105 305C147 279 174 267 218 238C263 209 303 315 346 292C391 268 427 229 474 196" fill="none" opacity=".2" stroke="#244f66" strokeDasharray="12 12" strokeLinecap="round" strokeWidth="2" />

        {trailStops.map((stop, index) => (
          <g key={stop.label} className="quest-world-scene__node" style={{ "--quest-node-delay": `${index * 160}ms` } as CSSProperties}>
            <circle cx={stop.x} cy={stop.y + 7} r="28" fill="#21445a" opacity=".16" />
            <circle cx={stop.x} cy={stop.y} r="25" fill="#fffdf4" stroke="#fff" strokeWidth="5" />
            <circle className={`quest-node-fill quest-node-fill--${stop.tone}`} cx={stop.x} cy={stop.y} r="16" />
          </g>
        ))}

        <g filter="url(#quest-shadow)">
          <path d="M438 160H525V201H438Z" fill="#fffdf3" />
          <path d="M438 160L482 132L525 160Z" fill="#ff8f68" />
          <rect x="451" y="171" width="18" height="30" rx="3" fill="#7cd4aa" />
          <rect x="488" y="170" width="22" height="17" rx="4" fill="#9adff3" />
          <path d="M431 205H533" stroke="#245066" strokeLinecap="round" strokeWidth="5" />
        </g>
      </svg>

      <div className="quest-world-scene__familiar">
        <span className="quest-world-scene__familiar-ring" aria-hidden />
        <PicoFamiliar className={compact ? "h-20 w-20" : "h-28 w-28 sm:h-32 sm:w-32"} mood="guide" />
      </div>

      <div className="quest-world-scene__legend" aria-hidden="true">
        {trailStops.map((stop, index) => (
          <span key={stop.label} style={{ left: `${(stop.x / 580) * 100}%`, top: `${(stop.y / 430) * 100}%` }}>
            {index + 1}. {stop.label}
          </span>
        ))}
      </div>

      <div className="quest-world-scene__hud">
        <span>Quest trail</span>
        <strong>Ready to explore</strong>
      </div>
    </div>
  );
}
