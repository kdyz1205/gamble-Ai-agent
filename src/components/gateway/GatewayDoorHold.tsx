"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import PicoFamiliar from "@/components/familiar/PicoFamiliar";

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
    <section className="gateway-door" data-phase={phase} data-testid="gateway-door-hold">
      <button
        aria-label="Enter World"
        aria-disabled={isOpening}
        className="gateway-door__button outline-none focus-visible:ring-4 focus-visible:ring-white/70"
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
        style={{ touchAction: "none" }}
        type="button"
      >
        <motion.span
          aria-hidden
          className="gateway-door__progress"
          animate={{ width: isOpening ? ["100%", "92%", "100%"] : progressPercent }}
          transition={{ duration: isOpening ? 0.9 : 0.14, ease: "easeOut" }}
        />
        <span className="gateway-door__label relative z-10">
          <motion.span
            aria-hidden
            className="gateway-door__pico"
            animate={{
              scale: isCharging ? 1 + holdProgress * 0.04 : isOpening ? [1, 1.08, 1] : 1,
              rotate: isOpening ? [0, -4, 4, 0] : 0,
            }}
          >
            <PicoFamiliar className="h-14 w-14" />
          </motion.span>
          <span>
            <small className="block text-[10px] uppercase tracking-[0.16em] opacity-70">Pico is waiting</small>
            <span className="block">{buttonLabel}</span>
          </span>
        </span>
        <span className="gateway-door__arrow relative z-10" aria-hidden>→</span>
      </button>
      <p className="px-3 pb-1 pt-3 text-center text-[11px] font-extrabold text-[color:var(--sum-muted)]">
        Tap once, or hold to open the portal
      </p>
    </section>
  );
}
