import Header from "@/components/Header";
import ChallengeInput from "@/components/ChallengeInput";
import ChallengeCard from "@/components/ChallengeCard";
import type { Challenge } from "@/components/ChallengeCard";
import TrendingSection from "@/components/TrendingSection";
import NearbySection from "@/components/NearbySection";
import LiveTicker from "@/components/LiveTicker";
import StatsBar from "@/components/StatsBar";

const challenges: Challenge[] = [
  {
    id: "1",
    title: "50 Push-ups in 2 Minutes",
    playerA: { name: "Alex Chen", avatar: "AC" },
    playerB: { name: "Sam Kim", avatar: "SK" },
    type: "Fitness",
    stake: "$20",
    currency: "USD",
    deadline: "02:13:22",
    evidence: "Video proof",
    status: "live",
    participants: 48,
    aiReview: true,
  },
  {
    id: "2",
    title: "Who Finishes 'Atomic Habits' First?",
    playerA: { name: "Jamie Lee", avatar: "JL" },
    playerB: null,
    type: "Learning",
    stake: "$15",
    currency: "USD",
    deadline: "7 days left",
    evidence: "Photo proof",
    status: "open",
    participants: 12,
    aiReview: true,
  },
  {
    id: "3",
    title: "5K Run Under 25 Minutes",
    playerA: { name: "Morgan R.", avatar: "MR" },
    playerB: { name: "Casey W.", avatar: "CW" },
    type: "Fitness",
    stake: "$50",
    currency: "USD",
    deadline: "Sat 9:00 AM",
    evidence: "GPS + Screenshot",
    status: "open",
    participants: 89,
    aiReview: true,
  },
  {
    id: "4",
    title: "Best Home-Cooked Pasta — Community Vote",
    playerA: { name: "Priya S.", avatar: "PS" },
    playerB: { name: "Taylor M.", avatar: "TM" },
    type: "Cooking",
    stake: "500 pts",
    currency: "points",
    deadline: "1 day left",
    evidence: "Video proof",
    status: "judging",
    participants: 234,
    aiReview: true,
  },
  {
    id: "5",
    title: "Chess Blitz — 3 Minute Speed Match",
    playerA: { name: "David K.", avatar: "DK" },
    playerB: { name: "Nina C.", avatar: "NC" },
    type: "Games",
    stake: "$10",
    currency: "USD",
    deadline: "Completed",
    evidence: "Screen recording",
    status: "completed",
    participants: 67,
    aiReview: true,
  },
  {
    id: "6",
    title: "100 Lines of Code in 30 Minutes",
    playerA: { name: "Ravi P.", avatar: "RP" },
    playerB: null,
    type: "Coding",
    stake: "$25",
    currency: "USD",
    deadline: "3 days left",
    evidence: "GitHub commit",
    status: "open",
    participants: 31,
    aiReview: true,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-bg-primary">
      <Header />

      {/* Hero — Central Challenge Input */}
      <section className="relative pt-12 pb-8 px-4 sm:px-6">
        {/* Subtle background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.03] via-teal/[0.02] to-transparent pointer-events-none" />
        <div className="relative">
          <ChallengeInput />
        </div>
      </section>

      {/* Live Ticker */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <LiveTicker />
      </section>

      {/* Stats Bar */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 mb-8">
        <StatsBar />
      </section>

      {/* Main content: Feed + Sidebar */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Challenge Feed */}
          <div className="flex-1">
            {/* Section tabs */}
            <div className="flex items-center gap-1 mb-5 bg-white rounded-xl border border-border-subtle p-1">
              {[
                { label: "All Challenges", active: true },
                { label: "Friends", active: false },
                { label: "Nearby", active: false },
                { label: "Live Now", active: false },
              ].map((tab) => (
                <button
                  key={tab.label}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    tab.active
                      ? "bg-accent text-white shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Cards grid */}
            <div className="grid gap-4 sm:grid-cols-2 stagger-children">
              {challenges.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} />
              ))}
            </div>

            {/* Load more */}
            <div className="mt-6 text-center">
              <button className="px-6 py-2.5 text-sm font-semibold text-accent bg-white border border-border-subtle rounded-xl hover:bg-bg-hover hover:shadow-sm transition-all">
                Load more challenges
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-full lg:w-80 flex-shrink-0 space-y-4">
            <TrendingSection />
            <NearbySection />

            {/* Quick create card */}
            <div className="bg-gradient-to-br from-accent to-teal rounded-2xl p-5 text-white">
              <h3 className="text-sm font-bold mb-2">Create Instantly</h3>
              <p className="text-xs text-white/80 mb-4">
                Type any challenge idea and AI will handle the rest — rules,
                matching, and arbitration.
              </p>
              <button className="w-full py-2.5 bg-white/20 backdrop-blur rounded-xl text-sm font-semibold hover:bg-white/30 transition-colors">
                New Challenge →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-teal flex items-center justify-center">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                >
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-text-primary">
                ChallengeAI
              </span>
            </div>
            <div className="flex items-center gap-6 text-xs text-text-tertiary">
              <span>Terms</span>
              <span>Privacy</span>
              <span>Help</span>
              <span>API</span>
            </div>
            <span className="text-xs text-text-tertiary">
              AI-Powered Challenge Operating System
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
