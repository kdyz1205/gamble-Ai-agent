"use client";

import { useState, useEffect } from "react";

const liveEvents = [
  { id: 1, text: "Alex earned +50 XP in Push-up Quest", time: "2m ago" },
  { id: 2, text: "New quest: 10K run under 50 min", time: "5m ago" },
  { id: 3, text: "Jamie vs Sam — Video proof submitted", time: "8m ago" },
  { id: 4, text: "Familiar result ready: Chess Speed Match", time: "12m ago" },
  { id: 5, text: "Morgan joined Weekend 5K with 100 credits", time: "15m ago" },
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
    <div className="sum-map-world sum-quest-card p-4 overflow-hidden">
      <div className="sum-sticker-badge px-3 py-1.5 mb-3 text-xs font-bold uppercase tracking-wider">
        <span className="sum-quest-orb" />
        <span>
          Quest Activity
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
            <span className="text-sm truncate pr-4" style={{ color: "var(--sum-ink)" }}>
              {event.text}
            </span>
            <span className="text-xs whitespace-nowrap" style={{ color: "var(--sum-muted)" }}>
              {event.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
