"use client";

const nearbyUsers = [
  { name: "Alex C.", distance: "0.3 mi", active: 2, avatar: "AC" },
  { name: "Jamie L.", distance: "0.8 mi", active: 1, avatar: "JL" },
  { name: "Sam K.", distance: "1.2 mi", active: 3, avatar: "SK" },
  { name: "Morgan R.", distance: "2.1 mi", active: 0, avatar: "MR" },
];

export default function NearbySection() {
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
          className="text-gold"
        >
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        <h2 className="text-sm font-bold text-text-primary">Nearby</h2>
      </div>
      <div className="space-y-2 stagger-children">
        {nearbyUsers.map((user) => (
          <div
            key={user.name}
            className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-bg-hover transition-colors animate-float-up"
          >
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-teal/20 flex items-center justify-center text-xs font-bold text-accent">
                  {user.avatar}
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-white" />
              </div>
              <div>
                <div className="text-sm font-medium text-text-primary">
                  {user.name}
                </div>
                <div className="text-xs text-text-tertiary">
                  {user.distance}
                </div>
              </div>
            </div>
            <div className="text-right">
              {user.active > 0 ? (
                <span className="text-xs font-medium text-accent">
                  {user.active} active
                </span>
              ) : (
                <span className="text-xs text-text-tertiary">Idle</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <button className="w-full mt-3 py-2 text-xs font-semibold text-accent hover:text-accent-dark transition-colors">
        View all nearby challengers →
      </button>
    </div>
  );
}
