interface QuixMarkProps {
  className?: string;
}

export default function QuixMark({ className }: QuixMarkProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M32 6 38.5 25.5 58 32 38.5 38.5 32 58 25.5 38.5 6 32 25.5 25.5 32 6Z" stroke="currentColor" strokeWidth="2.4" />
      <path d="M32 18 36 28 46 32 36 36 32 46 28 36 18 32 28 28 32 18Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M32 2V14M32 50V62M2 32H14M50 32H62" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
      <circle cx="32" cy="32" r="3.2" fill="currentColor" />
    </svg>
  );
}
