"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function EntryPolicyLinks() {
  const pathname = usePathname();
  const isPublicGateway = pathname === "/enter" || pathname === "/privacy" || pathname === "/terms" || pathname === "/support";

  if (!isPublicGateway) return null;

  return (
    <nav
      aria-label="Policies and support"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border px-2 py-1.5 text-[11px] font-extrabold shadow-[0_8px_24px_rgba(40,102,133,0.14)] backdrop-blur-md"
      style={{
        background: "rgba(255,255,255,0.88)",
        borderColor: "var(--sum-border)",
        color: "var(--sum-muted)",
      }}
    >
      <Link className="rounded-full px-2 py-1 transition-colors hover:bg-white" href="/privacy">
        Privacy
      </Link>
      <span aria-hidden>•</span>
      <Link className="rounded-full px-2 py-1 transition-colors hover:bg-white" href="/terms">
        Terms
      </Link>
      <span aria-hidden>•</span>
      <Link className="rounded-full px-2 py-1 transition-colors hover:bg-white" href="/support">
        Support
      </Link>
    </nav>
  );
}
