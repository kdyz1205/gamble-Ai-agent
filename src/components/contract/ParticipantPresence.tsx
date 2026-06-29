import { sceneTokens } from "@/lib/scene/scene-tokens";

interface ParticipantPresenceProps {
  align?: "left" | "right";
  familiar: string;
  image?: string;
  name: string;
  pnl?: string;
  presence: string;
  seal?: string;
  winRate?: string;
}

const statRows = [
  ["Calm", "92"],
  ["Pace", "78"],
  ["Seal", "S+"],
] as const;

export default function ParticipantPresence({
  align = "left",
  familiar,
  image,
  name,
  pnl = "+0 XP",
  presence,
  seal = "A",
  winRate = "60.0%",
}: ParticipantPresenceProps) {
  const right = align === "right";
  const sideGlow = right ? "rgba(139,61,255,0.32)" : "rgba(255,79,189,0.34)";
  const imageUrl = image || "/scene/quixnova/familiars/oraclex.png";

  return (
    <article
      className="contract-participant-card group qx-award-card relative isolate min-h-[300px] overflow-hidden rounded-lg p-3 min-[1400px]:min-h-[374px] min-[1400px]:p-4"
      data-testid={`contract-participant-${align}`}
      style={{
        background: "linear-gradient(180deg, rgba(18,4,28,0.8), rgba(5,0,10,0.9))",
        border: `1px solid ${sceneTokens.color.lineStrong}`,
        boxShadow: `0 24px 90px rgba(0,0,0,0.44), 0 0 64px ${sideGlow}, inset 0 0 64px rgba(255,79,189,0.04)`,
      }}
    >
      <span aria-hidden className="qx-corner-frame" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-35"
        style={{
          background:
            "linear-gradient(rgba(255,79,189,0.13) 1px, transparent 1px), linear-gradient(90deg, rgba(139,61,255,0.12) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "radial-gradient(circle at 50% 28%, black 0%, transparent 66%)",
        }}
      />
      <div
        aria-hidden
        className={`absolute top-4 -z-10 h-48 w-48 rounded-full ${right ? "right-3" : "left-3"}`}
        style={{
          background: `radial-gradient(circle, ${sideGlow}, rgba(5,0,10,0.1) 58%, transparent 72%)`,
          filter: "blur(10px)",
        }}
      />

      <div className={`flex items-center justify-between gap-4 ${right ? "flex-row-reverse text-right" : ""}`}>
        <p className="text-[10px] font-semibold uppercase tracking-[0.36em]" style={{ color: right ? "#caa6ff" : sceneTokens.color.gold }}>
          {presence}
        </p>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            background: "rgba(244,239,255,0.045)",
            border: `1px solid ${sceneTokens.color.line}`,
            color: sceneTokens.color.text,
          }}
        >
          {seal}
        </span>
      </div>

      <div className={`mt-4 flex ${right ? "justify-end" : "justify-start"}`}>
        <div
          className="contract-participant-avatar relative h-24 w-24 overflow-hidden rounded-full min-[1400px]:h-32 min-[1400px]:w-32 2xl:h-36 2xl:w-36"
          style={{
            border: `1px solid ${sceneTokens.color.lineStrong}`,
            boxShadow: `0 0 54px ${sideGlow}`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-0 scale-110 transition duration-500 group-hover:scale-125"
            style={{
              backgroundImage:
                `linear-gradient(180deg, rgba(3,0,8,0.02), rgba(3,0,8,0.42)), url('${imageUrl}')`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background: "radial-gradient(circle at 50% 40%, transparent 0%, transparent 48%, rgba(5,0,10,0.56) 78%)",
            }}
          />
        </div>
      </div>

      <div className={`mt-3 min-[1400px]:mt-4 ${right ? "text-right" : ""}`}>
        <h2 className="text-lg font-semibold leading-[1.12] min-[1400px]:text-xl 2xl:text-2xl" style={{ color: sceneTokens.color.text }}>
          {name}
        </h2>
        <p className="mt-2 text-sm" style={{ color: sceneTokens.color.textMuted }}>
          {familiar}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg min-[1400px]:mt-4" style={{ border: `1px solid ${sceneTokens.color.line}`, background: "rgba(244,239,255,0.035)" }}>
        <div className="p-2.5">
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.textFaint }}>
            Rank
          </p>
          <p className="mt-1 text-xl font-semibold leading-tight" style={{ color: right ? "#caa6ff" : sceneTokens.color.gold }}>
            {seal}
          </p>
        </div>
        <div className="border-l p-2.5 text-right" style={{ borderColor: sceneTokens.color.line }}>
          <p className="text-[10px] uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.textFaint }}>
            Quest Record
          </p>
          <p className="mt-1 text-lg font-semibold leading-tight" style={{ color: sceneTokens.color.text }}>
            {winRate}
          </p>
        </div>
      </div>

      <p className={`contract-compact-optional mt-3 hidden text-[10px] font-semibold uppercase tracking-[0.22em] min-[1400px]:block ${right ? "text-right" : ""}`} style={{ color: right ? "#caa6ff" : sceneTokens.color.gold }}>
        Quest Boost
      </p>

      <div className="contract-compact-optional mt-1.5 hidden rounded-lg p-2.5 min-[1400px]:block" style={{ border: `1px solid ${sceneTokens.color.line}`, background: "rgba(5,0,10,0.38)" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
              Familiar Support I
            </p>
            <p className="mt-1 text-xs" style={{ color: sceneTokens.color.textMuted }}>
              Quest clarity +6 XP
            </p>
          </div>
          <p className="text-sm font-semibold" style={{ color: sceneTokens.color.cyan }}>
            {pnl}
          </p>
        </div>
      </div>

      <div className="contract-compact-optional mt-2.5 hidden grid-cols-3 overflow-hidden rounded-lg min-[1400px]:grid" style={{ border: `1px solid ${sceneTokens.color.line}`, background: "rgba(244,239,255,0.025)" }}>
        {statRows.map(([label, value], index) => (
          <div key={label} className={index ? "border-l px-3 py-2 text-center" : "px-3 py-2 text-center"} style={{ borderColor: sceneTokens.color.line }}>
            <p className="text-[9px] uppercase tracking-[0.16em]" style={{ color: sceneTokens.color.textFaint }}>
              {label}
            </p>
            <p className="mt-1 text-sm font-semibold" style={{ color: sceneTokens.color.text }}>
              {index === 2 ? seal : value}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
