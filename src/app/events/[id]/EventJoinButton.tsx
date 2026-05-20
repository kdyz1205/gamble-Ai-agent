"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { joinEvent } from "@/lib/api-client";

export default function EventJoinButton({ eventId }: { eventId: string }) {
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleJoin() {
    setStatus("joining");
    setMessage("");
    try {
      const result = await joinEvent(eventId);
      setStatus("joined");
      setMessage(result.alreadyJoined ? "You already have a ticket." : "Ticket issued.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Join failed.";
      if (/unauthorized/i.test(text)) {
        setStatus("idle");
        void signIn();
        return;
      }
      setStatus("error");
      setMessage(text);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleJoin}
        disabled={status === "joining" || status === "joined"}
        className="w-full rounded-full px-5 py-3 text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-70"
        style={{ background: status === "joined" ? "#A7F3D0" : "#10B981", color: status === "joined" ? "#064E3B" : "#FFFFFF" }}
      >
        {status === "joining" ? "Joining..." : status === "joined" ? "Joined" : "Join event"}
      </button>
      {message && (
        <p className="text-center text-xs font-bold" style={{ color: status === "error" ? "#B91C1C" : "#047857" }}>
          {message}
        </p>
      )}
    </div>
  );
}
