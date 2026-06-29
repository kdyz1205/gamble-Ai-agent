"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { sceneTokens } from "@/lib/scene/scene-tokens";

const supportKinds = [
  { value: "report_content", label: "Report content" },
  { value: "block_user", label: "Block a user" },
  { value: "support_request", label: "Support request" },
];

export default function SupportReportForm() {
  const [kind, setKind] = useState(supportKinds[0].value);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    try {
      const response = await fetch("/api/support/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, target, reason, contact }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; reportId?: string };

      if (!response.ok) {
        throw new Error(data.error || "Could not send report");
      }

      setStatus("sent");
      setMessage(data.reportId ? `Report received: ${data.reportId}` : "Report received");
      setTarget("");
      setReason("");
      setContact("");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not send report");
    }
  }

  const fieldClass = "w-full rounded-md bg-transparent px-3 py-2 text-sm outline-none";
  const fieldStyle = { border: `1px solid ${sceneTokens.color.line}`, color: sceneTokens.color.text };

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="mt-6 space-y-4 rounded-md p-4"
      style={{ background: sceneTokens.color.panelStrong, border: `1px solid ${sceneTokens.color.line}` }}
    >
      <label className="block space-y-2 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
        Request type
        <select className={fieldClass} style={fieldStyle} value={kind} onChange={(event) => setKind(event.target.value)}>
          {supportKinds.map((option) => (
            <option key={option.value} value={option.value} style={{ color: "#050508" }}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-2 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
        Quest, profile, or proof link
        <input
          className={fieldClass}
          style={fieldStyle}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="https://summoner.world/join/..."
        />
      </label>

      <label className="block space-y-2 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
        What happened?
        <textarea
          className={`${fieldClass} min-h-28 resize-none`}
          style={fieldStyle}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Describe the unsafe content, user, proof issue, or result concern."
          required
        />
      </label>

      <label className="block space-y-2 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
        Contact email
        <input
          className={fieldClass}
          style={fieldStyle}
          type="email"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs" style={{ color: status === "error" ? "#fecaca" : sceneTokens.color.textMuted }}>
          {message || "Reports are written to the audit log for review."}
        </p>
        <button
          type="submit"
          disabled={status === "sending"}
          className="min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50"
          style={{ background: sceneTokens.color.gold, color: "#050508" }}
        >
          {status === "sending" ? "Sending" : "Send report"}
        </button>
      </div>
    </form>
  );
}
