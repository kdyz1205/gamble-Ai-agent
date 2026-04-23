"use client";

import { useEffect, useState } from "react";

/**
 * One-source-of-truth for "should this ambient animation run right now?".
 *
 * Returns false when ANY of:
 *   - the OS/browser reports prefers-reduced-motion (user accessibility setting)
 *   - the tab is currently hidden (Page Visibility API) — no need to burn CPU
 *     on an orb the user can't see
 *   - the device looks like a low-powered / low-memory client (coarse heuristic:
 *     Device Memory API < 4 GB, or hardwareConcurrency <= 4 on mobile)
 *
 * We consume this in SoftBackground, the homepage mascot, and anywhere else we
 * have an infinite `repeat: Infinity` animation. When it returns false, callers
 * are expected to either skip the animation entirely or fall back to a static
 * visual.
 *
 * Why: on iPhone Safari the compositor ran four overlapping blur(100-150px)
 * filters at 60fps continuously, even while the user was reading — which the
 * user reported as their phone getting "extremely hot" within minutes. Pausing
 * these when hidden/reduced-motion brings CPU/GPU usage to nearly zero when
 * the page is idle.
 */
export function useAmbientMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    // Heuristic: low-end device = little thermal headroom. Don't animate ambient
    // decoration there. "Low-end" is fuzzy; we err on the side of "animate" only
    // when we're confident the device can handle it.
    const nav = navigator as Navigator & { deviceMemory?: number };
    const lowMem = typeof nav.deviceMemory === "number" && nav.deviceMemory < 4;
    const lowCores =
      typeof navigator.hardwareConcurrency === "number" && navigator.hardwareConcurrency <= 4;
    const isMobileUA = /iPhone|iPad|Android|Mobile/i.test(navigator.userAgent);
    const looksLowEnd = lowMem || (isMobileUA && lowCores);

    function compute() {
      if (mql.matches) return false;
      if (document.hidden) return false;
      if (looksLowEnd) return false;
      return true;
    }

    setAllowed(compute());
    const onChange = () => setAllowed(compute());
    mql.addEventListener("change", onChange);
    document.addEventListener("visibilitychange", onChange);
    return () => {
      mql.removeEventListener("change", onChange);
      document.removeEventListener("visibilitychange", onChange);
    };
  }, []);

  return allowed;
}
