"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";
import AppToastHost from "@/components/AppToastHost";
import ChallengeRealtimeBridge from "@/components/ChallengeRealtimeBridge";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: ErrorEvent) => {
      if (e.message?.includes("ethereum") || e.filename?.includes("chrome-extension")) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    };
    window.addEventListener("error", handler, true);
    return () => window.removeEventListener("error", handler, true);
  }, []);

  return (
    <SessionProvider>
      <ChallengeRealtimeBridge />
      <AppToastHost />
      {children}
    </SessionProvider>
  );
}
