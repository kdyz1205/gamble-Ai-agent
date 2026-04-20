"use client";

import { motion } from "framer-motion";

/**
 * Floating pastel light orbs that drift slowly across the page.
 * Mounted globally in layout.tsx; sits at z-index -1 so all content layers above.
 *
 * Per LuckyPlay design spec — replaces hard-edged ambient blobs with breathing,
 * cotton-candy gradient halos that hint at depth without a busy texture.
 */
export default function SoftBackground() {
  return (
    <div
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: -1 }}
      aria-hidden
    >
      {/* mint-200 halo — top-left */}
      <motion.div
        className="absolute rounded-full"
        style={{
          top: "-10%",
          left: "-10%",
          width: "55vw",
          height: "55vw",
          background: "#A7F3D0",
          opacity: 0.40,
          filter: "blur(110px)",
        }}
        animate={{ x: [0, 50, 0], y: [0, 30, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* cotton-candy pink halo — top-right */}
      <motion.div
        className="absolute rounded-full"
        style={{
          top: "20%",
          right: "-12%",
          width: "60vw",
          height: "60vw",
          background: "#FFD1DC",
          opacity: 0.40,
          filter: "blur(130px)",
        }}
        animate={{ x: [0, -40, 0], y: [0, 50, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />

      {/* purple-200 halo — bottom-left */}
      <motion.div
        className="absolute rounded-full"
        style={{
          bottom: "-20%",
          left: "20%",
          width: "70vw",
          height: "70vw",
          background: "#E9D5FF",
          opacity: 0.40,
          filter: "blur(150px)",
        }}
        animate={{ x: [0, 60, 0], y: [0, -40, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />

      {/* orange-200 small halo — center accent */}
      <motion.div
        className="absolute rounded-full"
        style={{
          top: "55%",
          left: "45%",
          width: "30vw",
          height: "30vw",
          background: "#FED7AA",
          opacity: 0.30,
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -30, 30, 0], y: [0, 20, -20, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
    </div>
  );
}
