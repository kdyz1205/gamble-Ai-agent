import type { SVGProps } from "react";

export function ArrowMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}><path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SparkMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}><path d="m24 0 5.1 15.2L43 5l-10.2 14L48 24l-15.2 5.1L43 43l-14-10.2L24 48l-5.1-15.2L5 43l10.2-14L0 24l15.2-5.1L5 5l14 10.2L24 0Z" fill="currentColor" /></svg>;
}

/** Original line illustration; never presented as user-submitted evidence. */
export function RacketArtwork({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 420 310" fill="none" role="img" aria-label="Illustration of two badminton rackets and a shuttlecock">
      <path d="M34 243h353M58 93v150m306-150v150M58 168h306M211 93v150" stroke="#577B63" strokeWidth="1.3" opacity=".35" />
      <ellipse cx="217" cy="266" rx="148" ry="17" fill="#41614C" opacity=".1" />
      <g transform="translate(8,-16) rotate(-26 164 168)">
        <path d="M159 154v113" stroke="#1D302D" strokeWidth="14" strokeLinecap="round" />
        <path d="M159 217v53" stroke="#F3BAA6" strokeWidth="22" strokeLinecap="round" />
        <path d="M148 224h22m-22 11h22m-22 11h22m-22 11h22" stroke="#1D302D" strokeWidth="1.2" opacity=".5" />
        <ellipse cx="159" cy="97" rx="52" ry="69" fill="#F8F5EA" stroke="#1D302D" strokeWidth="7" />
        <ellipse cx="159" cy="97" rx="43" ry="60" stroke="#A4B8A0" strokeWidth="1.4" />
        <path d="M131 51v91m14-102v113m14-116v121m14-117v111m14-99v86M117 68h84m-87 14h90m-90 14h90m-88 14h86m-80 14h75m-66 14h55" stroke="#A4B8A0" strokeWidth="1.25" />
      </g>
      <g transform="translate(13,5) rotate(28 245 177)">
        <path d="M245 151v119" stroke="#1D302D" strokeWidth="14" strokeLinecap="round" />
        <path d="M245 220v53" stroke="#EED15C" strokeWidth="22" strokeLinecap="round" />
        <path d="M234 227h22m-22 11h22m-22 11h22m-22 11h22" stroke="#1D302D" strokeWidth="1.2" opacity=".5" />
        <ellipse cx="245" cy="96" rx="52" ry="69" fill="#F8F5EA" stroke="#1D302D" strokeWidth="7" />
        <ellipse cx="245" cy="96" rx="43" ry="60" stroke="#A4B8A0" strokeWidth="1.4" />
        <path d="M217 50v91m14-102v113m14-116v121m14-117v111m14-99v86M203 67h84m-87 14h90m-90 14h90m-88 14h86m-80 14h75m-66 14h55" stroke="#A4B8A0" strokeWidth="1.25" />
      </g>
      <g transform="rotate(27 332 67)"><path d="m314 36 18-15 20 15-9 43h-22l-7-43Z" fill="#FFFDF5" stroke="#1D302D" strokeWidth="2.4" strokeLinejoin="round" /><path d="m322 36 6 40m6-48v48m10-40-6 40M317 48h30m-28 12h26" stroke="#A4B8A0" strokeWidth="1.4" /><path d="M321 77h23v8a11.5 11.5 0 0 1-23 0v-8Z" fill="#F3BAA6" stroke="#1D302D" strokeWidth="2.4" /></g>
      <path d="m78 60 4 12 12 4-12 4-4 12-4-12-12-4 12-4 4-12Zm279 123 3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9Z" fill="#C7422C" />
    </svg>
  );
}
