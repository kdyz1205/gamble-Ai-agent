"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function GatewayArrival() {
  const router = useRouter();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    if (search.get("arrival") === "gateway") {
      const revealComposer = () => {
        const input = document.querySelector<HTMLElement>('[data-testid="pact-composer"] textarea');
        if (!input) return;

        input.scrollIntoView({ behavior: "auto", block: "center" });
        const rect = input.getBoundingClientRect();
        const bottomLimit = window.innerHeight - 24;
        if (rect.bottom > bottomLimit) {
          window.scrollBy({ top: rect.bottom - bottomLimit, behavior: "auto" });
        }
      };

      revealComposer();
      router.replace("/summons", { scroll: false });
      const timer = window.setTimeout(revealComposer, 180);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [router]);

  return null;
}
