"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";

const HOLD_MS = 1650;
const ROUTE_DELAY_MS = 2180;

type GatewayPhase = "ready" | "charging" | "opening";

export default function GatewayDoorHold() {
  const router = useRouter();
  const openedRef = useRef(false);
  const routeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFrameRef = useRef<number | null>(null);
  const holdStartedAtRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<GatewayPhase>("ready");
  const [holdProgress, setHoldProgress] = useState(0);
  const reduceMotion = useReducedMotion();

  const isOpening = phase === "opening";
  const isCharging = phase === "charging";

  const clearHoldFrame = useCallback(() => {
    if (holdFrameRef.current !== null) {
      window.cancelAnimationFrame(holdFrameRef.current);
      holdFrameRef.current = null;
    }
  }, []);

  const playSound = useCallback((src: string, volume: number) => {
    const audio = new Audio(src);
    audio.volume = volume;
    void audio.play().catch(() => undefined);
  }, []);

  const openGateway = useCallback(() => {
    if (openedRef.current) return;

    openedRef.current = true;
    clearHoldFrame();
    setHoldProgress(1);
    setPhase("opening");
    playSound("/sfx/gateway/open_004.wav", 0.22);
    chimeTimerRef.current = setTimeout(() => playSound("/sfx/gateway/confirmation_002.wav", 0.16), 420);
    routeTimerRef.current = setTimeout(() => router.push("/summons?arrival=gateway"), ROUTE_DELAY_MS);
  }, [clearHoldFrame, playSound, router]);

  const tickHold = useCallback(function tickHoldFrame() {
    if (openedRef.current || holdStartedAtRef.current === null) return;

    const elapsed = performance.now() - holdStartedAtRef.current;
    const nextProgress = Math.min(1, elapsed / HOLD_MS);
    setHoldProgress(nextProgress);

    if (nextProgress >= 1 || reduceMotion) {
      openGateway();
      return;
    }

    holdFrameRef.current = window.requestAnimationFrame(tickHoldFrame);
  }, [openGateway, reduceMotion]);

  const startHold = useCallback((event?: PointerEvent<HTMLButtonElement>) => {
    if (openedRef.current) return;
    if (event && event.pointerType === "mouse" && event.button !== 0) return;

    event?.currentTarget.setPointerCapture?.(event.pointerId);
    clearHoldFrame();
    holdStartedAtRef.current = performance.now();
    setPhase("charging");
    setHoldProgress(0);
    holdFrameRef.current = window.requestAnimationFrame(tickHold);
  }, [clearHoldFrame, tickHold]);

  const cancelHold = useCallback(() => {
    if (openedRef.current) return;
    clearHoldFrame();
    holdStartedAtRef.current = null;
    setPhase("ready");
    setHoldProgress(0);
  }, [clearHoldFrame]);

  useEffect(() => {
    return () => {
      clearHoldFrame();
      if (routeTimerRef.current) clearTimeout(routeTimerRef.current);
      if (chimeTimerRef.current) clearTimeout(chimeTimerRef.current);
    };
  }, [clearHoldFrame]);

  const progressPercent = `${Math.max(0.08, holdProgress) * 100}%`;
  const buttonLabel = isOpening ? "Entering World..." : "Enter World";

  return (
    <section
      className="sum-quest-card relative w-full max-w-xl overflow-hidden p-4 sm:p-5"
      data-phase={phase}
      data-testid="gateway-door-hold"
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, var(--sum-cloud), var(--sum-sun) 34%, var(--sum-peach) 70%)",
          boxShadow: "0 0 44px var(--sum-orb-glow)",
        }}
        animate={{ y: isOpening ? [-4, -18, -8] : [-3, 4, -3], rotate: isOpening ? [0, 18, 36] : [0, 8, 0] }}
        transition={{ duration: isOpening ? 1.3 : 4.2, repeat: isOpening ? 0 : Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <motion.div
            aria-hidden
            className="grid h-14 w-14 shrink-0 place-items-center rounded-[20px] border border-white/80 bg-white text-xl font-extrabold shadow-[0_12px_24px_rgba(40,102,133,0.12)]"
            animate={{
              scale: isCharging ? 1 + holdProgress * 0.04 : isOpening ? [1, 1.08, 1] : 1,
              rotate: isOpening ? [0, -4, 4, 0] : 0,
            }}
            transition={{ duration: isOpening ? 0.8 : 0.2 }}
          >
            F
          </motion.div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: "var(--sum-muted)" }}>
              AI familiar
            </p>
            <p className="text-base font-extrabold leading-tight sm:text-lg">Ready to referee your next quest</p>
          </div>
        </div>

        <button
          aria-label="Enter World"
          aria-disabled={isOpening}
          className="group relative min-h-14 w-full overflow-hidden rounded-full border border-[rgba(255,185,120,0.58)] px-6 py-4 text-base font-extrabold shadow-[0_14px_30px_rgba(255,164,96,0.28)] outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-4 focus-visible:ring-[rgba(255,185,120,0.42)] sm:w-auto sm:min-w-44"
          data-testid="gateway-handle"
          disabled={isOpening}
          onClick={openGateway}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") openGateway();
          }}
          onPointerCancel={cancelHold}
          onPointerDown={startHold}
          onPointerLeave={cancelHold}
          onPointerUp={cancelHold}
          style={{
            background: "linear-gradient(135deg, var(--sum-peach), var(--sum-sun))",
            color: "var(--sum-ink)",
            touchAction: "none",
          }}
          type="button"
        >
          <motion.span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-full bg-white/24"
            animate={{ width: isOpening ? ["100%", "92%", "100%"] : progressPercent }}
            transition={{ duration: isOpening ? 0.9 : 0.14, ease: "easeOut" }}
          />
          <span className="relative inline-flex items-center justify-center gap-2">
            <span className="sum-quest-orb" aria-hidden />
            {buttonLabel}
          </span>
        </button>
      </div>
    </section>
  );
}
