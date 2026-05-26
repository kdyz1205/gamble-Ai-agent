import { useId } from "react";

type BrandMarkProps = {
  className?: string;
  label?: string;
};

export default function BrandMark({ className = "h-9 w-9", label = "Axelrod" }: BrandMarkProps) {
  const id = useId().replace(/:/g, "");
  const bgId = `axelrod-bg-${id}`;
  const coreId = `axelrod-core-${id}`;

  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={`${className} block shrink-0`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={bgId} x1="8" y1="5" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E8FFF7" />
          <stop offset="0.52" stopColor="#F8FAFC" />
          <stop offset="1" stopColor="#FFE5C2" />
        </linearGradient>
        <linearGradient id={coreId} x1="19" y1="15" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0F172A" />
          <stop offset="1" stopColor="#243B63" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="17" fill={ `url(#${bgId})` } />
      <path d="M12 32C12 21 21 12 32 12C43 12 52 21 52 32" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" opacity="0.42" />
      <path d="M10 39C15 48 23 53 32 53C41 53 49 48 54 39" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" opacity="0.16" />

      <path d="M32 14.5L46.5 23V41L32 49.5L17.5 41V23L32 14.5Z" fill={ `url(#${coreId})` } />
      <path d="M32 20.5L41 25.8V38.2L32 43.5L23 38.2V25.8L32 20.5Z" fill="#F8FAFC" />
      <path d="M32 24L38 27.7V36.3L32 40L26 36.3V27.7L32 24Z" fill="#0F172A" />

      <path d="M32 24V40" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.92" />
      <path d="M26 27.7L38 36.3" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.92" />
      <path d="M38 27.7L26 36.3" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" opacity="0.92" />
      <circle cx="32" cy="32" r="4" fill="#F8FAFC" />
      <circle cx="32" cy="32" r="1.7" fill="#0F172A" />

      <circle cx="10.5" cy="32" r="3.2" fill="#10B981" />
      <path d="M47.8 32H54" stroke="#F97316" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="55.5" cy="32" r="3.4" fill="#F97316" />
      <path d="M53.9 32.1L55.1 33.3L57.3 30.7" stroke="#FFF7ED" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
