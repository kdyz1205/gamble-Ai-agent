import QuixMark from "@/components/scene/QuixMark";
import { sceneTokens } from "@/lib/scene/scene-tokens";

interface ContractObjectProps {
  condition: string;
  proof: string;
  stake: string;
  title: string;
}

const clauses = [
  ["Win Condition", "Defined strategy must complete before proof window closes."],
  ["Proof Requirement", "Uploaded proof and final AI referee."],
  ["Familiar Result", "Final result becomes a public receipt."],
] as const;

export default function ContractObject({ condition, proof, stake, title }: ContractObjectProps) {
  return (
    <section className="contract-object-shell relative mx-auto mt-5 flex min-h-[360px] w-full max-w-[500px] flex-col items-center justify-center lg:mt-0 min-[1400px]:min-h-[452px]" data-testid="contract-object">
      <div
        aria-hidden
        className="absolute left-1/2 top-[8%] h-[72%] w-[78%] -translate-x-1/2 rounded-[44%] opacity-45"
        style={{
          backgroundImage: "url('/scene/premium/rune-ring.png')",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "contain",
          filter: "drop-shadow(0 0 42px rgba(255,79,189,0.32))",
          mixBlendMode: "screen",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-x-10 bottom-2 h-20 rounded-full opacity-70"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(255,79,189,0.28), rgba(139,61,255,0.16) 42%, transparent 70%)",
          filter: "blur(14px)",
        }}
      />
      <div
        aria-hidden
        className="absolute bottom-2 h-24 w-[84%] rounded-[50%]"
        style={{
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: "0 0 70px rgba(255,79,189,0.22), inset 0 0 42px rgba(255,79,189,0.12)",
          transform: "perspective(420px) rotateX(64deg)",
        }}
      />

      <div
        className="contract-scroll-object relative z-10 w-[88%] max-w-[360px] rounded-lg px-4 py-4 text-center min-[1400px]:max-w-[416px] min-[1400px]:px-5 min-[1400px]:py-5"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,143,220,0.2), rgba(12,1,22,0.7) 32%, rgba(3,0,8,0.92)), radial-gradient(circle at 50% 0%, rgba(255,79,189,0.34), transparent 38%)",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow:
            "0 0 94px rgba(255,79,189,0.38), 0 0 170px rgba(139,61,255,0.22), inset 0 0 78px rgba(255,79,189,0.1)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div
          aria-hidden
          className="absolute left-1/2 top-[-16px] h-7 w-[92%] -translate-x-1/2 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(255,79,189,0.18), rgba(255,184,230,0.82), rgba(139,61,255,0.36))",
            border: "1px solid rgba(255,206,239,0.58)",
            boxShadow: "0 0 52px rgba(255,79,189,0.42)",
          }}
        />
        <div
          aria-hidden
          className="absolute bottom-[-16px] left-1/2 h-7 w-[92%] -translate-x-1/2 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(139,61,255,0.32), rgba(255,184,230,0.74), rgba(255,79,189,0.18))",
            border: "1px solid rgba(255,206,239,0.48)",
            boxShadow: "0 0 46px rgba(255,79,189,0.34)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-4 left-3 w-px"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(255,143,220,0.72), transparent)",
            boxShadow: "0 0 22px rgba(255,79,189,0.42)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-y-4 right-3 w-px"
          style={{
            background: "linear-gradient(180deg, transparent, rgba(186,126,255,0.68), transparent)",
            boxShadow: "0 0 22px rgba(139,61,255,0.38)",
          }}
        />
        {[
          "left-[-10px] top-[-10px]",
          "right-[-10px] top-[-10px]",
          "bottom-[-10px] left-[-10px]",
          "bottom-[-10px] right-[-10px]",
        ].map((position) => (
          <span
            key={position}
            aria-hidden
            className={`absolute h-6 w-6 rounded-full ${position}`}
            style={{
              background: "radial-gradient(circle, rgba(255,191,234,0.95), rgba(255,79,189,0.5) 42%, rgba(139,61,255,0.12) 68%)",
              border: "1px solid rgba(255,206,239,0.64)",
              boxShadow: sceneTokens.shadow.gold,
            }}
          />
        ))}

        <div
          aria-hidden
          className="absolute inset-x-8 top-14 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(255,79,189,0.54), transparent)" }}
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em]" style={{ color: sceneTokens.color.gold }}>
          Quest Terms
        </p>
        <h1 className="mx-auto mt-2 max-w-[320px] text-2xl font-semibold leading-tight min-[1400px]:mt-3 sm:text-3xl" style={{ color: sceneTokens.color.text }}>
          {title}
        </h1>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: sceneTokens.color.textFaint }}>
          With Familiar Support
        </p>

        <div className="contract-clauses mt-3 space-y-2 text-left min-[1400px]:mt-5 min-[1400px]:space-y-2.5">
          {clauses.map(([label, value], index) => (
            <div key={label} className="grid grid-cols-[32px_1fr] gap-3">
              <span
                className="grid h-7 w-7 place-items-center rounded-full text-xs font-semibold"
                style={{
                  background: index === 1 ? "rgba(139,61,255,0.18)" : "rgba(255,79,189,0.15)",
                  border: `1px solid ${sceneTokens.color.lineStrong}`,
                  color: sceneTokens.color.gold,
                }}
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: sceneTokens.color.text }}>
                  {label}
                </span>
                <span className="mt-1 block text-xs leading-5" style={{ color: sceneTokens.color.textMuted }}>
                  {value}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="contract-time mt-2 rounded-lg px-4 py-2 min-[1400px]:mt-3 min-[1400px]:py-2.5" style={{ border: `1px solid ${sceneTokens.color.line}`, background: "rgba(244,239,255,0.035)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color: sceneTokens.color.gold }}>
            Time Limit
          </p>
        <p className="mt-1 text-base font-semibold min-[1400px]:text-lg" style={{ color: sceneTokens.color.text }}>
            7 Days
          </p>
        </div>
      </div>

      <div
        className="pointer-events-none relative z-20 -mt-3 grid h-20 w-20 place-items-center rounded-full min-[1400px]:-mt-4 min-[1400px]:h-24 min-[1400px]:w-24"
        style={{
          background:
            "radial-gradient(circle, rgba(255,79,189,0.42), rgba(139,61,255,0.18) 52%, rgba(5,0,10,0.86) 72%)",
          border: `1px solid ${sceneTokens.color.lineStrong}`,
          boxShadow: sceneTokens.shadow.seal,
          color: sceneTokens.color.gold,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-2 rounded-full"
          style={{
            backgroundImage: "url('/scene/premium/rune-ring.png')",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            opacity: 0.44,
          }}
        />
        <QuixMark className="relative h-11 w-11" />
      </div>

      <div className="sr-only">
        {condition} {proof} {stake}
      </div>
    </section>
  );
}
