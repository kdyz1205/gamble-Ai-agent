"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

export default function EventResolveButton({
  eventId,
  disabled,
  disabledReason,
}: {
  eventId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "checking" | "done" | "error">("idle");
  const [message, setMessage] = useState(disabledReason ?? "");

  async function handleResolve() {
    if (disabled) return;
    setStatus("checking");
    setMessage("");
    try {
      const response = await fetch(`/api/events/${eventId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const text = typeof payload.error === "string" ? payload.error : "Resolve failed.";
        if (response.status === 401 || /unauthorized/i.test(text)) {
          void signIn();
          setStatus("idle");
          return;
        }
        throw new Error(text);
      }
      setStatus("done");
      setMessage(payload.status === "not_due" ? "Not ready yet." : "Oracle check saved.");
      router.refresh();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Resolve failed.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleResolve}
        disabled={disabled || status === "checking"}
        className="w-full rounded-full px-5 py-3 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: "#172033", color: "#FFFFFF" }}
      >
        {status === "checking" ? "Checking Open-Meteo..." : "Verify now"}
      </button>
      {message && (
        <p className="text-center text-xs font-bold" style={{ color: status === "error" ? "#B91C1C" : "#64748B" }}>
          {message}
        </p>
      )}
    </div>
  );
}
