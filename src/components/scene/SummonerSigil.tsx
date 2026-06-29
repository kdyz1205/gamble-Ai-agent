interface SummonerSigilProps {
  className?: string;
}

export default function SummonerSigil({ className = "h-5 w-5" }: SummonerSigilProps) {
  return (
    <span aria-hidden className={`relative block ${className}`}>
      <span className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2 bg-current opacity-70" />
      <span className="absolute left-[8%] top-1/2 h-px w-[84%] -translate-y-1/2 bg-current opacity-70" />
      <span className="absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-current opacity-85" />
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
    </span>
  );
}
