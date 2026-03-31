"use client";

import { useState, useEffect } from "react";

const liveEvents = [
  { id: 1, text: "Alex won $50 in Push-up Challenge", time: "2m ago" },
  { id: 2, text: "New challenge: 10K run under 50 min", time: "5m ago" },
  { id: 3, text: "Jamie vs Sam — Video proof submitted", time: "8m ago" },
  { id: 4, text: "AI judging complete: Chess Speed Match", time: "12m ago" },
  { id: 5, text: "Morgan staked $100 on Weekend 5K", time: "15m ago" },
];

export default function LiveTicker() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % liveEvents.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-danger animate-pulse" />
        <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
          Live Activity
        </span>
      </div>
      <div className="relative h-8 overflow-hidden">
        {liveEvents.map((event, i) => (
          <div
            key={event.id}
            className={`absolute inset-x-0 flex items-center justify-between transition-all duration-500 ${
              i === activeIndex
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-4"
            }`}
          >
            <span className="text-sm text-text-secondary truncate pr-4">
              {event.text}
            </span>
            <span className="text-xs text-text-tertiary whitespace-nowrap">
              {event.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
