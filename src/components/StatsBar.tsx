export default function StatsBar() {
  const stats = [
    { label: "Active Challenges", value: "12,847", trend: "+14%" },
    { label: "Total Staked", value: "$2.4M", trend: "+8%" },
    { label: "AI Judgments Today", value: "3,291", trend: "+22%" },
    { label: "Players Online", value: "8,432", trend: null },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-white rounded-2xl border border-border-subtle p-4 hover:shadow-md transition-shadow"
        >
          <div className="text-xs font-medium text-text-tertiary mb-1">
            {stat.label}
          </div>
          <div className="flex items-end gap-2">
            <span className="text-xl font-bold text-text-primary animate-count-pulse">
              {stat.value}
            </span>
            {stat.trend && (
              <span className="text-xs font-semibold text-success mb-0.5">
                {stat.trend}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
