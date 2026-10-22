import { useId, type CSSProperties } from "react";

/** The one canonical Pico character across web, iOS and every quest state. */
export type PicoMood =
  | "guide" | "listening" | "thinking" | "clarify"
  | "referee" | "uncertain" | "celebrate" | "error" | "waiting" | "confirm";

interface PicoFamiliarProps {
  className?: string;
  mood?: PicoMood;
  label?: string;
}

const expressions: Record<PicoMood, { blush: string; star: string; eyes: "open" | "smile" | "pensive"; pose: string }> = {
  guide: { blush: "#ffc5ca", star: "#ffe291", eyes: "open", pose: "guide" },
  listening: { blush: "#ffc5c9", star: "#b8eff1", eyes: "open", pose: "attentive" },
  thinking: { blush: "#f5c6cf", star: "#d4caff", eyes: "pensive", pose: "thinking" },
  clarify: { blush: "#ffced1", star: "#ffe291", eyes: "open", pose: "thinking" },
  referee: { blush: "#ffd1cf", star: "#b7e7de", eyes: "open", pose: "review" },
  uncertain: { blush: "#f1c0ca", star: "#d4caff", eyes: "pensive", pose: "thinking" },
  celebrate: { blush: "#ffc4c8", star: "#ffe291", eyes: "smile", pose: "celebrate" },
  error: { blush: "#f4c7cf", star: "#e9c3db", eyes: "pensive", pose: "thinking" },
  waiting: { blush: "#ffced1", star: "#f9df9a", eyes: "smile", pose: "guide" },
  confirm: { blush: "#ffc6c8", star: "#c4ebbb", eyes: "smile", pose: "celebrate" },
};

export default function PicoFamiliar({ className = "", mood = "guide", label }: PicoFamiliarProps) {
  const id = useId().replace(/:/g, "");
  const face = expressions[mood];
  return (
    <span
      className={"sum-familiar " + className}
      role="img"
      aria-label={label ?? "Pico, your AI Familiar — " + mood}
      data-mood={mood}
      data-pose={face.pose}
      style={{ "--pico-spark": face.star } as CSSProperties}
    >
      <svg viewBox="0 0 104 104" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <radialGradient id={id + "fur"} cx="0" cy="0" r="1" gradientTransform="translate(37 30) rotate(56) scale(71 69)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fffefa" /><stop offset=".58" stopColor="#fff5eb" /><stop offset="1" stopColor="#e3e5db" />
          </radialGradient>
          <linearGradient id={id + "leaf"} x1="10" y1="13" x2="33" y2="49" gradientUnits="userSpaceOnUse">
            <stop stopColor="#dff7c7"/><stop offset=".52" stopColor="#a3dcb8"/><stop offset="1" stopColor="#6aaa92"/>
          </linearGradient>
          <radialGradient id={id + "eye"} cx="0" cy="0" r="1" gradientTransform="translate(37 44) rotate(69) scale(19 16)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#77666f"/><stop offset=".5" stopColor="#35333c"/><stop offset="1" stopColor="#1c2e3c"/>
          </radialGradient>
        </defs>
        <ellipse cx="52" cy="97" rx="30" ry="4.5" fill="#496c65" opacity=".13"/>
        <g className="pico-ears">
          <path d="M27 42C5 38-2 20 9 9c12-8 29 12 31 26Z" fill={`url(#${id}leaf)`} stroke="#768d79" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M23 35C11 27 8 15 12 15c8 0 16 12 19 18Z" fill="#f1babe" opacity=".92"/>
          <path d="M77 42c22-4 29-22 18-33-12-8-29 12-31 26Z" fill={`url(#${id}leaf)`} stroke="#768d79" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M81 35c12-8 15-20 11-20-8 0-16 12-19 18Z" fill="#f1babe" opacity=".92"/>
          <path d="M50 29C38 21 38 10 40 7c12 2 19 10 15 21Z" fill="#b5deb5" stroke="#7c9f81" strokeWidth="2" />
          <path d="M57 27c1-14 9-22 18-21-1 14-7 22-18 21Z" fill="#89c7a6" stroke="#6e9f85" strokeWidth="2"/>
          <path d="M57 24c3-8 8-11 12-13" stroke="#e0f4df" strokeWidth="1.8" strokeLinecap="round"/>
        </g>
        <path
          d="M52 28c17-3 32 6 38 21 4 10 1 20-5 27 2 9-8 17-18 17-5 7-17 8-23 2-12 4-22-2-23-12-9-4-12-18-7-29 5-16 19-27 38-26Z"
          fill={`url(#${id}fur)`} stroke="#a29587" strokeWidth="2.15" strokeLinejoin="round"
        />
        <path d="M26 48C30 36 43 32 53 33" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" opacity=".85"/>
        <path d="M80 48c5 13 1 24-7 29" stroke="#deded2" strokeWidth="3" strokeLinecap="round" opacity=".4"/>
        <ellipse cx="27" cy="64" rx="10" ry="6" fill={face.blush} opacity=".8"/>
        <ellipse cx="77" cy="64" rx="10" ry="6" fill={face.blush} opacity=".8"/>
        <g className="pico-eyes">
          {face.eyes === "smile" ? <>
            <path d="M30 52q8-9 16 0M58 52q8-9 16 0" stroke="#36424a" strokeWidth="3.6" strokeLinecap="round"/>
          </> : <>
            <ellipse cx="39" cy="50.5" rx="7" ry={face.eyes === "pensive" ? 7.5 : 9} fill={`url(#${id}eye)`}/>
            <ellipse cx="65" cy="50.5" rx="7" ry={face.eyes === "pensive" ? 7.5 : 9} fill={`url(#${id}eye)`}/>
            <ellipse cx="36.9" cy="46.5" rx="2.5" ry="3.15" fill="white"/>
            <ellipse cx="62.9" cy="46.5" rx="2.5" ry="3.15" fill="white"/>
            <circle cx="41.6" cy="54.2" r="1.15" fill="#fff" opacity=".85"/>
            <circle cx="67.6" cy="54.2" r="1.15" fill="#fff" opacity=".85"/>
          </>}
        </g>
        <path d="M49 63q3-3 6 0q-3 3-6 0Z" fill="#b87c77"/>
        {mood === "celebrate" || mood === "confirm"
          ? <path d="M46 68q6 12 13 0" stroke="#ad7671" strokeWidth="2.2" strokeLinecap="round"/>
          : <path d="M47 67q5 5 10 0" stroke="#ad7671" strokeWidth="2.2" strokeLinecap="round"/>}
        <g className="pico-paws">
          <ellipse cx="34" cy="85" rx="10" ry="6.7" fill="#fff7ee" stroke="#ccbaac" strokeWidth="1.6" transform="rotate(17 34 85)"/>
          <ellipse cx="70" cy="85" rx="10" ry="6.7" fill="#fff7ee" stroke="#ccbaac" strokeWidth="1.6" transform="rotate(-17 70 85)"/>
          <ellipse cx="34" cy="86" rx="3" ry="1.6" fill="#f3c9c6"/>
          <ellipse cx="70" cy="86" rx="3" ry="1.6" fill="#f3c9c6"/>
        </g>
        <g className="pico-star">
          <circle cx="56" cy="27" r="7.5" fill="#fff9ea" stroke="#e9c69f" strokeWidth="1.3"/>
          <circle cx="56" cy="20" r="4.2" fill="#ffd0d4"/>
          <circle cx="62.6" cy="25.1" r="4.2" fill="#fbc2cb"/>
          <circle cx="60.1" cy="31.1" r="4.2" fill="#ffe2a8"/>
          <circle cx="52" cy="31.1" r="4.2" fill="#ffcfdd"/>
          <circle cx="49.4" cy="25.1" r="4.2" fill="#f6c3ca"/>
          <circle cx="56" cy="26.2" r="3" fill="#f6ce73"/>
          <path d="m81 18 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill={face.star} stroke="#c6a976" strokeWidth="1.1"/>
        </g>
        {mood === "referee" && <path d="M46 78h13l-2 5h-9Z" fill="#b8d6ca" stroke="#799e8f" strokeWidth="1.5"/>}
        {(mood === "thinking" || mood === "clarify" || mood === "uncertain") && <circle cx="84" cy="37" r="2.3" fill="#d0bde9"/>}
      </svg>
    </span>
  );
}
