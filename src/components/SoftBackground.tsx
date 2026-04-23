"use client";

import { motion } from "framer-motion";
import { useAmbientMotionAllowed } from "@/lib/use-motion-policy";

/**
 * Floating pastel light orbs that drift slowly across the page.
 * Mounted globally in layout.tsx; sits at z-index -1 so all content layers above.
 *
 * Per LuckyPlay design spec — replaces hard-edged ambient blobs with breathing,
 * cotton-candy gradient halos that hint at depth without a busy texture.
 *
 * Performance note: the 4 overlapping blur(90-150px) filters running at 60fps
 * continuously were the #1 cause of a user report that "the phone gets
 * extremely hot within a minute of opening the site". We now:
 *   - respect prefers-reduced-motion (OS accessibility)
 *   - pause when the tab is hidden (Page Visibility API)
 *   - skip motion entirely on low-end / low-memory devices
 *   - dropped blur radius 110-150px → 70-100px (visually identical under this
 *     opacity but 2-3x cheaper to rasterize on mobile GPUs)
 */
export default function SoftBackground() {
  const animate = useAmbientMotionAllowed();

  // Static halos only — no motion.
  if (!animate) {
    return (
      <div
        className="fixed inset-0 overflow-hidden pointer-events-none"
        style={{ zIndex: -1 }}
        aria-hidden
      >
        <div className="absolute rounded-full" style={staticHalo("-10%", "-10%", "55vw", "#A7F3D0", 0.35, 80)} />
        <div className="absolute rounded-full" style={staticHalo("20%", undefined, "60vw", "#FFD1DC", 0.35, 90, "-12%")} />
        <div className="absolute rounded-full" style={staticHalo(undefined, "20%", "70vw", "#E9D5FF", 0.35, 100, undefined, "-20%")} />
      </div>
    );
  }

  // Animated halos — only when the device has headroom.
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: -1 }}
      aria-hidden
    >
      <motion.div
        className="absolute rounded-full"
        style={{ top: "-10%", left: "-10%", width: "55vw", height: "55vw", background: "#A7F3D0", opacity: 0.4, filter: "blur(80px)" }}
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ top: "20%", right: "-12%", width: "60vw", height: "60vw", background: "#FFD1DC", opacity: 0.4, filter: "blur(90px)" }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ bottom: "-20%", left: "20%", width: "70vw", height: "70vw", background: "#E9D5FF", opacity: 0.4, filter: "blur(100px)" }}
        animate={{ x: [0, 60, 0], y: [0, -40, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      {/* The 4th "accent" orb was dropping ~15% visual impact for ~25% of the
          total composite cost. Cut it. */}
    </div>
  );
}

function staticHalo(
  top: string | undefined,
  left: string | undefined,
  size: string,
  color: string,
  opacity: number,
  blur: number,
  right?: string,
  bottom?: string,
): React.CSSProperties {
  return {
    top,
    left,
    right,
    bottom,
    width: size,
    height: size,
    background: color,
    opacity,
    filter: `blur(${blur}px)`,
  };
}
