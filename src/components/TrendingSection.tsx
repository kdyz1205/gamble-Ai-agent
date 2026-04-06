"use client";

const trending = [
  { tag: "Push-up Marathon", count: "2.4K bets", hot: true },
  { tag: "Weekend 5K Race", count: "1.8K bets", hot: true },
  { tag: "Chess Speed Match", count: "956 bets", hot: false },
  { tag: "Cooking Challenge", count: "743 bets", hot: false },
  { tag: "Study Hours Bet", count: "621 bets", hot: false },
];

export default function TrendingSection() {
  return (
    <div className="bg-white rounded-2xl border border-border-subtle p-5">
      <div className="flex items-center gap-2 mb-4">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-danger"
        >
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
        </svg>
        <h2 className="text-sm font-bold text-text-primary">Trending</h2>
      </div>
      <div className="space-y-2 stagger-children">
        {trending.map((item) => (
          <button
            key={item.tag}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-bg-hover transition-colors animate-float-up"
          >
            <div className="flex items-center gap-2">
              {item.hot && (
                <span className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
              )}
              <span className="text-sm font-medium text-text-primary">
                {item.tag}
              </span>
            </div>
            <span className="text-xs text-text-tertiary">{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
