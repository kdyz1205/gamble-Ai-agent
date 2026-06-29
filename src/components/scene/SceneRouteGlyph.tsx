import QuixMark from "@/components/scene/QuixMark";
import type { SceneRouteHref } from "@/lib/scene/scene-routes";

interface SceneRouteGlyphProps {
  href: SceneRouteHref;
  className?: string;
}

export default function SceneRouteGlyph({ className, href }: SceneRouteGlyphProps) {
  const baseClass = `relative block ${className ?? "h-4 w-4"}`;

  if (href === "/summons") {
    return <QuixMark className={className ?? "h-4 w-4"} />;
  }

  if (href === "/contracts/bind") {
    return (
      <span aria-hidden className={baseClass}>
        <span className="absolute inset-x-[22%] inset-y-[10%] rounded-[3px] border border-current" />
        <span className="absolute left-[36%] right-[20%] top-[34%] h-px bg-current opacity-80" />
        <span className="absolute left-[36%] right-[26%] top-[52%] h-px bg-current opacity-50" />
        <span className="absolute left-[25%] top-[31%] h-1 w-1 rounded-full bg-current" />
      </span>
    );
  }

  if (href === "/duel/demo") {
    return (
      <span aria-hidden className={baseClass}>
        <span className="absolute left-1/2 top-1/2 h-[58%] w-[58%] -translate-x-1/2 -translate-y-1/2 rotate-45 border border-current" />
        <span className="absolute left-1/2 top-[18%] h-[64%] w-px -translate-x-1/2 bg-current opacity-65" />
        <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
      </span>
    );
  }

  if (href === "/rituals") {
    return (
      <span aria-hidden className={baseClass}>
        <span className="absolute left-[23%] top-[28%] h-1.5 w-1.5 rounded-full bg-current" />
        <span className="absolute right-[23%] top-[28%] h-1.5 w-1.5 rounded-full bg-current" />
        <span className="absolute left-1/2 bottom-[22%] h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-current" />
        <span className="absolute left-[31%] right-[31%] top-[38%] h-px bg-current opacity-55" />
        <span className="absolute left-[37%] top-[45%] h-[32%] w-px -rotate-[35deg] bg-current opacity-55" />
        <span className="absolute right-[37%] top-[45%] h-[32%] w-px rotate-[35deg] bg-current opacity-55" />
      </span>
    );
  }

  if (href === "/enter") {
    return (
      <span aria-hidden className={baseClass}>
        <span className="absolute inset-x-[22%] bottom-[12%] top-[12%] rounded-t-full border border-current" />
        <span className="absolute bottom-[12%] left-[50%] top-[38%] w-px bg-current opacity-70" />
        <span className="absolute left-[36%] top-[50%] h-1 w-1 rounded-full bg-current" />
        <span className="absolute right-[36%] top-[50%] h-1 w-1 rounded-full bg-current opacity-70" />
      </span>
    );
  }

  return (
    <span aria-hidden className={baseClass}>
      <span className="absolute left-1/2 top-[14%] h-[70%] w-px -translate-x-1/2 bg-current" />
      <span className="absolute left-[22%] right-[22%] top-[30%] h-px bg-current" />
      <span className="absolute left-[20%] top-[40%] h-[30%] w-[24%] rounded-b-full border border-t-0 border-current" />
      <span className="absolute right-[20%] top-[40%] h-[30%] w-[24%] rounded-b-full border border-t-0 border-current" />
      <span className="absolute left-1/2 bottom-[12%] h-px w-[44%] -translate-x-1/2 bg-current" />
    </span>
  );
}
